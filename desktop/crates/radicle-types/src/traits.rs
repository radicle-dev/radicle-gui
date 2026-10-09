use std::collections::{BTreeMap, BTreeSet};
use std::str::FromStr;

use radicle::node;
use radicle::node::{Alias, AliasStore, NodeId};

use crate::cobs::AliasSuggestion;
use crate::config::Config;
use crate::error::Error;

const ALIAS_SEARCH_LIMIT: usize = 50;

pub mod artifact_node;
pub mod cobs;
pub mod identity;
pub mod inbox;
pub mod issue;
pub mod job;
pub mod patch;
pub mod release;
pub mod release_mut;
pub mod repo;
pub mod thread;

pub trait Profile {
    fn profile(&self) -> radicle::Profile;

    fn config(&self) -> Config {
        let p = self.profile();
        // Settings can rewrite `config.json` while the app runs, so read it
        // again rather than trusting the copy loaded at startup.
        let cfg = radicle::profile::Config::load(&p.home().config()).unwrap_or(p.config);

        Config {
            public_key: p.public_key,
            alias: cfg.node.alias.clone(),
            seeding_policy: cfg.node.seeding_policy,
            public_explorer: cfg.public_explorer.clone(),
            preferred_seeds: cfg.preferred_seeds.clone(),
        }
    }

    fn set_preferred_seeds(&self, seeds: Vec<String>) -> Result<Config, Error> {
        let p = self.profile();
        crate::config::set_value(&p.home().config(), "preferredSeeds", seeds.into())?;

        Ok(self.config())
    }

    fn set_public_explorer(&self, explorer: String) -> Result<Config, Error> {
        crate::config::validate_explorer(&explorer)?;
        let p = self.profile();
        crate::config::set_value(&p.home().config(), "publicExplorer", explorer.into())?;

        Ok(self.config())
    }

    fn check_cobs_cache(&self) -> Result<(), Error> {
        let p = self.profile();
        let cache = radicle::cob::cache::Store::open(
            p.home().cobs().join(radicle::cob::cache::COBS_DB_FILE),
        )?;
        cache.check_version()?;

        Ok(())
    }

    fn node_running(&self) -> bool {
        let p = self.profile();

        radicle::node::Handle::is_running(&radicle::Node::new(p.home().socket_from_env()))
    }

    fn alias(&self, nid: NodeId) -> Option<radicle::node::Alias> {
        let p = self.profile();
        let aliases = p.aliases();

        aliases.alias(&nid)
    }

    fn search_aliases(&self, query: Option<String>) -> Vec<AliasSuggestion> {
        let p = self.profile();
        let query = query.unwrap_or_default();
        let query = query.trim();
        let policies = p.policies().ok();

        let mut candidates: BTreeMap<NodeId, Option<Alias>> = BTreeMap::new();
        let mut followed = BTreeSet::new();
        // The `following` table holds blocked nodes alongside followed ones, so
        // they have to be filtered out of every source, not just this one.
        let mut blocked = BTreeSet::new();
        if let Some(policies) = policies.as_ref()
            && let Ok(follow_policies) = policies.follow_policies()
        {
            for policy in follow_policies.flatten() {
                match policy.policy {
                    node::policy::Policy::Allow => {
                        followed.insert(policy.nid);
                        candidates.insert(policy.nid, policy.alias);
                    }
                    node::policy::Policy::Block => {
                        blocked.insert(policy.nid);
                    }
                }
            }
        }

        candidates.insert(p.public_key, Some(p.config.node.alias.clone()));

        // `Aliases::reverse_lookup` merges its two stores with `BTreeMap::extend`,
        // which drops node ids when both stores hold the same alias. Query the
        // stores separately so every matching node id survives.
        if let Ok(alias) = Alias::from_str(query) {
            if let Some(policies) = policies.as_ref() {
                extend_candidates(&mut candidates, policies.reverse_lookup(&alias));
            }
            if let Ok(db) = p.database() {
                extend_candidates(&mut candidates, db.reverse_lookup(&alias));
            }
        }

        let needle = query.to_lowercase();
        let mut matches = candidates
            .into_iter()
            .filter(|(nid, _)| !blocked.contains(nid))
            .filter_map(|(nid, alias)| {
                let rank = rank_alias(alias.as_ref(), &needle, followed.contains(&nid))?;

                Some((rank, alias.clone(), nid))
            })
            .collect::<Vec<_>>();

        matches.sort_by(|(a_rank, a_alias, a_nid), (b_rank, b_alias, b_nid)| {
            a_rank
                .cmp(b_rank)
                .then_with(|| a_alias.cmp(b_alias))
                .then_with(|| a_nid.cmp(b_nid))
        });
        matches.truncate(ALIAS_SEARCH_LIMIT);

        matches
            .into_iter()
            .map(|(_, alias, nid)| AliasSuggestion {
                did: nid.into(),
                alias,
                followed: followed.contains(&nid),
                is_self: nid == p.public_key,
            })
            .collect()
    }
}

fn extend_candidates(
    candidates: &mut BTreeMap<NodeId, Option<Alias>>,
    found: BTreeMap<Alias, BTreeSet<NodeId>>,
) {
    for (alias, nids) in found {
        for nid in nids {
            candidates.insert(nid, Some(alias.clone()));
        }
    }
}

fn rank_alias(alias: Option<&Alias>, needle: &str, followed: bool) -> Option<u8> {
    let position = match alias {
        None if needle.is_empty() => 3,
        None => return None,
        Some(alias) => {
            let alias = alias.to_string().to_lowercase();

            if alias == needle {
                0
            } else if alias.starts_with(needle) {
                1
            } else if alias.contains(needle) {
                2
            } else {
                return None;
            }
        }
    };

    Some(position * 2 + u8::from(!followed))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::str::FromStr;

    use radicle::crypto::{Seed, Signer, SigningKey};
    use radicle::node::{Alias, config};

    use crate::config::Config;
    use crate::{AppState, Profile, test};

    use super::rank_alias;

    #[test]
    fn config() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(tmp.path(), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let state = AppState { profile };

        assert_eq!(
            Profile::config(&state),
            Config {
                public_key: *signer.public_key(),
                alias: Alias::from_str("seed").unwrap(),
                seeding_policy: config::DefaultSeedingPolicy::Block,
                public_explorer: state.profile.config.public_explorer.clone(),
                preferred_seeds: state.profile.config.preferred_seeds.clone(),
            }
        )
    }

    fn node(seed: u8) -> radicle::node::NodeId {
        *SigningKey::from_seed(Seed::new([seed; 32])).public_key()
    }

    #[test]
    fn search_aliases() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(tmp.path(), [0xff; 32]);
        let mut policies = profile.policies_mut().unwrap();
        let alice = Alias::from_str("alice").unwrap();
        policies.follow(&node(1), Some(&alice)).unwrap();
        policies
            .follow(&node(2), Some(&Alias::from_str("alicia").unwrap()))
            .unwrap();
        policies.follow(&node(3), Some(&alice)).unwrap();
        policies
            .set_follow_policy(&node(3), radicle::node::policy::Policy::Block)
            .unwrap();
        drop(policies);
        let state = AppState { profile };
        let search = |query: &str| {
            Profile::search_aliases(&state, Some(query.to_string()))
                .into_iter()
                .map(|suggestion| suggestion.did.as_key().to_owned())
                .collect::<Vec<_>>()
        };

        assert_eq!(search("alice"), vec![node(1)]);
        assert_eq!(search("ali"), vec![node(1), node(2)]);
        assert_eq!(search(""), vec![node(1), node(2), state.profile.public_key]);
    }

    #[test]
    fn rank_alias_orders_matches() {
        let alias = |name: &str| Alias::from_str(name).unwrap();
        let rank = |name: &str, needle: &str, followed: bool| {
            rank_alias(Some(&alias(name)), needle, followed)
        };

        assert!(rank("alice", "alice", false) < rank("alice", "ali", false));
        assert!(rank("alice", "ali", false) < rank("malice", "ali", false));
        assert!(rank("alice", "ali", true) < rank("alice", "ali", false));
        assert_eq!(rank("bob", "ali", true), None);
        assert_eq!(rank_alias(None, "ali", true), None);
        assert!(rank_alias(None, "", true).is_some());
    }
}
