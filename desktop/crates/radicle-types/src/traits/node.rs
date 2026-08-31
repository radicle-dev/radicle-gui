use std::collections::{BTreeMap, BTreeSet};

use radicle::git;
use radicle::git::refs::storage::SIGREFS_BRANCH;
use radicle::identity;
use std::str::FromStr;

use radicle::cob;
use radicle::identity::doc;
use radicle::issue::cache::Issues as _;
use radicle::node::seed::Store as _;
use radicle::node::sync::DEFAULT_REPLICATION_FACTOR;
use radicle::node::{AliasStore, Handle as _, SyncedAt};
use radicle::patch::cache::Patches as _;
use radicle::storage::git::Repository;
use radicle::storage::refs::SignedRefs;
use radicle::storage::{ReadRepository as _, ReadStorage as _};

use crate::cobs::repo::SyncStatus;
use crate::domain::inbox::models::notification;
use crate::error::Error;
use crate::node::{
    LatestPublish, NodeStatus, PublishChange, PublishKind, RepoSyncStatus, SeedStatus, SyncSummary,
};
use crate::repo;
use crate::traits::Profile;

/// The timestamp a seed last held our refs at, for ordering. Seeds with no
/// reported sync status sort last.
fn sync_rank(seed: &SeedStatus) -> u8 {
    match &seed.sync {
        Some(SyncStatus::Synced { .. }) => 0,
        Some(SyncStatus::OutOfSync { .. }) => 1,
        None => 2,
    }
}

fn synced_at(seed: &SeedStatus) -> Option<i64> {
    match &seed.sync {
        Some(SyncStatus::Synced { at }) => Some(at.timestamp.as_millis() as i64),
        Some(SyncStatus::OutOfSync { remote, .. }) => Some(remote.timestamp.as_millis() as i64),
        None => None,
    }
}

/// What our latest publication in `repo` touched, by comparing the refs signed
/// at `head` against those signed by the commit before it.
///
/// Falls back to [`PublishKind::Mixed`] whenever the comparison is unavailable
/// or spans more than one kind, rather than guessing.
fn publish_kind(
    repo: &Repository,
    nid: &radicle::crypto::PublicKey,
    head: git::Oid,
) -> (PublishKind, PublishChange, Option<CobChange>) {
    let Ok(Some(current)) = SignedRefs::load_at(head, *nid, repo) else {
        return (PublishKind::Mixed, PublishChange::Updated, None);
    };
    // Keyed by string so lookups do not have to reconstruct a `Qualified`.
    let previous: BTreeMap<String, git::Oid> = repo
        .commit(head)
        .ok()
        .and_then(|commit| commit.parent_id(0).ok())
        .and_then(|parent| {
            SignedRefs::load_at(parent.into(), *nid, repo)
                .ok()
                .flatten()
        })
        .map(|refs| {
            refs.iter()
                .map(|(name, oid)| (name.to_string(), *oid))
                .collect()
        })
        .unwrap_or_default();

    let mut kinds = BTreeSet::new();
    let mut cob: Option<CobChange> = None;
    // Whether the patch branch was added or moved. Only authoring a patch adds
    // it, and only pushing code moves it, so it separates a new patch and a
    // revision from a comment or edit, which touch just the COB.
    let mut patch_branch_added = false;
    let mut patch_branch_moved = false;
    let mut issue_added = false;

    for (name, oid) in current.iter() {
        let name = name.to_string();
        // `refs/rad/*` is signing bookkeeping, not something anyone published.
        if name.starts_with("refs/rad/") {
            continue;
        }
        match previous.get(&name) {
            Some(before) if before == oid => continue,
            before => {
                let is_new = before.is_none();
                if let Some(id) = name
                    .strip_prefix("refs/cobs/xyz.radicle.patch/")
                    .or_else(|| name.strip_prefix("refs/cobs/xyz.radicle.issue/"))
                    .and_then(|id| cob::ObjectId::from_str(id).ok())
                {
                    cob = Some(CobChange {
                        typename: if name.contains("xyz.radicle.patch") {
                            radicle::cob::patch::TYPENAME.clone()
                        } else {
                            radicle::cob::issue::TYPENAME.clone()
                        },
                        id,
                        from: before.copied(),
                        until: *oid,
                    });
                }
                if name.starts_with("refs/cobs/xyz.radicle.patch/")
                    || name.starts_with("refs/heads/patches/")
                {
                    if name.starts_with("refs/heads/patches/") {
                        patch_branch_added |= is_new;
                        patch_branch_moved |= !is_new;
                    }
                    kinds.insert(PublishKind::Patch);
                } else if name.starts_with("refs/cobs/xyz.radicle.issue/") {
                    issue_added |= is_new;
                    kinds.insert(PublishKind::Issue);
                } else if name.starts_with("refs/heads/") {
                    kinds.insert(PublishKind::Branch);
                } else {
                    kinds.insert(PublishKind::Mixed);
                }
            }
        }
    }

    let kind = match kinds.len() {
        1 => kinds.into_iter().next().unwrap_or(PublishKind::Mixed),
        _ => PublishKind::Mixed,
    };
    let change = match kind {
        PublishKind::Patch if patch_branch_added => PublishChange::Created,
        PublishKind::Patch if patch_branch_moved => PublishChange::Revised,
        // A first comment on someone else's issue also adds the COB ref under
        // our namespace, so this cannot separate that from authoring one.
        PublishKind::Issue if issue_added => PublishChange::Created,
        PublishKind::Branch => PublishChange::Created,
        _ => PublishChange::Updated,
    };

    (kind, change, cob)
}

/// The serde tag of the last action in a collaborative object's history range,
/// e.g. `comment` or `review`. Read as JSON rather than matched variant by
/// variant so new action types do not silently become wrong labels.
fn last_action_tag<A>(
    repo: &Repository,
    aliases: &radicle::profile::Aliases,
    change: &CobChange,
) -> Option<String>
where
    A: serde::Serialize + for<'de> serde::Deserialize<'de> + std::fmt::Debug,
{
    let actions = notification::actions::<A>(
        change.typename.clone(),
        change.id,
        change.from,
        Some(change.until),
        repo,
        aliases,
    )
    .ok()?;
    let last = actions.last()?;

    serde_json::to_value(&last.action)
        .ok()?
        .get("type")?
        .as_str()
        .map(str::to_owned)
}

/// A collaborative object that moved in a publication, and the range of its
/// history that moved, so its actions can be read.
struct CobChange {
    typename: cob::TypeName,
    id: cob::ObjectId,
    from: Option<git::Oid>,
    until: git::Oid,
}

pub trait Node: Profile {
    fn node_status(&self) -> Result<NodeStatus, Error> {
        let profile = self.profile();
        let node = radicle::Node::new(profile.home().socket_from_env());
        let running = node.is_running();

        // Sessions and listen addresses are IPC round trips, so they only
        // resolve while the node is up. Identity and seeding policies come from
        // disk and are reported either way.
        let connected_peers = if running {
            node.sessions().map_or(0, |sessions| {
                sessions.iter().filter(|s| s.state.is_connected()).count()
            })
        } else {
            0
        };

        let listen_addrs = if running {
            node.listen_addrs()
                .unwrap_or_default()
                .iter()
                .map(ToString::to_string)
                .collect()
        } else {
            Vec::new()
        };

        let seeding = profile
            .policies()?
            .seed_policies()?
            .filter_map(Result::ok)
            .filter(|policy| policy.policy.is_allow())
            .count();

        Ok(NodeStatus {
            running,
            nid: profile.public_key,
            alias: profile.config.node.alias.clone(),
            listen_addrs,
            connected_peers,
            seeding,
            sync: self.sync_summary()?,
        })
    }

    /// How far our own work has reached other nodes.
    ///
    /// Reads the node's `repo-sync-status` table rather than asking the daemon,
    /// so it costs no IPC and still answers while the node is stopped — which is
    /// exactly when "did my work get out before I went offline?" is asked.
    fn sync_summary(&self) -> Result<SyncSummary, Error> {
        let profile = self.profile();
        let db = profile.database()?;
        let policies = profile.policies()?;
        let storage = &profile.storage;

        let mut repos = 0;
        let mut confirmed = 0;
        let mut latest: Option<LatestPublish> = None;

        for info in storage.repositories()? {
            if !policies.is_seeding(&info.rid)? {
                continue;
            }
            let Ok(repo) = storage.repository(info.rid) else {
                continue;
            };
            // Our own signed refs. Absent for repositories we only seed, which
            // have nothing of ours to propagate and so are not counted.
            let Ok(head) = repo.reference_oid(&profile.public_key, &SIGREFS_BRANCH) else {
                continue;
            };
            repos += 1;

            // The sigrefs commit time is when we last published here.
            let published_at = SyncedAt::new(head, &repo)?.timestamp.as_millis() as i64;
            let (kind, change, cob) = publish_kind(&repo, &profile.public_key, head);
            // Only a COB-only move needs this: a ref diff already describes a
            // new patch or a revision, but cannot say whether an object moved
            // because of a comment, a review or a state change.
            let (action, title) = match (&change, &cob) {
                (PublishChange::Updated, Some(cob)) => {
                    let aliases = profile.aliases();
                    if cob.typename == *radicle::cob::patch::TYPENAME {
                        (
                            last_action_tag::<radicle::cob::patch::Action>(&repo, &aliases, cob),
                            profile
                                .patches(&repo)
                                .ok()
                                .and_then(|patches| patches.get(&cob.id).ok().flatten())
                                .map(|patch| patch.title().to_string()),
                        )
                    } else {
                        (
                            last_action_tag::<radicle::cob::issue::Action>(&repo, &aliases, cob),
                            profile
                                .issues(&repo)
                                .ok()
                                .and_then(|issues| issues.get(&cob.id).ok().flatten())
                                .map(|issue| issue.title().to_string()),
                        )
                    }
                }
                _ => (None, None),
            };
            let mut repo_confirmed_at: Option<i64> = None;
            let mut repo_confirmed_by = 0;
            for seed in db.seeds_for(&info.rid)? {
                let seed = seed?;
                // Our own row is the local copy, not evidence of propagation.
                if seed.nid == profile.public_key || seed.synced_at.oid != head {
                    continue;
                }
                repo_confirmed_by += 1;
                let at = seed.synced_at.timestamp.as_millis() as i64;
                repo_confirmed_at = Some(repo_confirmed_at.map_or(at, |prev: i64| prev.max(at)));
            }
            if repo_confirmed_at.is_some() {
                confirmed += 1;
            }

            if latest
                .as_ref()
                .is_none_or(|current| published_at > current.published_at)
            {
                latest = Some(LatestPublish {
                    rid: info.rid,
                    name: info
                        .doc
                        .payload()
                        .get(&doc::PayloadId::project())
                        .and_then(|payload| {
                            repo::ProjectPayloadData::try_from((*payload).clone()).ok()
                        })
                        .map(|data| data.name),
                    published_at,
                    kind,
                    change,
                    action,
                    title,
                    confirmed_at: repo_confirmed_at,
                    confirmed_by: repo_confirmed_by,
                });
            }
        }

        Ok(SyncSummary {
            repos,
            confirmed,
            latest,
        })
    }

    /// Report how far our own refs have propagated for `rid`, mirroring
    /// `rad sync status`. The seed list and its sync state are held by the
    /// daemon, so a stopped node yields an empty status.
    fn repo_sync_status(&self, rid: identity::RepoId) -> Result<RepoSyncStatus, Error> {
        let profile = self.profile();
        let mut node = radicle::Node::new(profile.home().socket_from_env());

        let aliases = profile.aliases();
        let mut entries = if node.is_running() {
            // The daemon knows the full routing table, including seeds that
            // hold the repo but have never synced our refs, plus live session
            // state. Preferred whenever it is up.
            node.seeds_for(rid, [profile.public_key])?
                .iter()
                .filter(|seed| seed.nid != profile.public_key)
                .map(|seed| SeedStatus {
                    nid: seed.nid,
                    alias: aliases.alias(&seed.nid),
                    connected: seed.is_connected(),
                    sync: seed.sync.clone().map(Into::into),
                })
                .collect::<Vec<_>>()
        } else {
            // Falling back to the node's own `repo-sync-status` table keeps this
            // answerable while the node is stopped, which is exactly when "did
            // my work get out?" gets asked. It covers only nodes that have
            // synced our refs, and cannot report who we are connected to.
            self.stored_seeds(rid)?
        };

        // Seeds holding our current refs lead the list, then the stale ones,
        // then those reporting no sync status; within each group the connected
        // ones first, then the most recently seen. Sorting on recency alone ranked a seed that
        // fetched an old head minutes ago above one holding our latest from
        // hours ago, which reads wrong in a list whose ticks are the point.
        // `Seeds` also iterates in a random order, so without a total order
        // here the list would reshuffle on every poll.
        entries.sort_by(|a, b| {
            sync_rank(a)
                .cmp(&sync_rank(b))
                // Connected seeds lead their group: they are the ones we can
                // fetch from right now. Inert on the database fallback, which
                // has no session state to report.
                .then_with(|| b.connected.cmp(&a.connected))
                .then_with(|| synced_at(b).cmp(&synced_at(a)))
                .then_with(|| a.nid.to_string().cmp(&b.nid.to_string()))
        });

        let synced = entries
            .iter()
            .filter(|seed| matches!(seed.sync, Some(SyncStatus::Synced { .. })))
            .count();
        let tracked = entries.iter().filter(|seed| seed.sync.is_some()).count();

        Ok(RepoSyncStatus {
            seeds: entries,
            synced,
            tracked,
            target: DEFAULT_REPLICATION_FACTOR,
            available: true,
        })
    }

    /// Announce our refs for `rid` to the network, so seeds holding the
    /// repository fetch them. This advertises rather than pushes: peers decide
    /// to fetch in response.
    fn announce_repo(&self, rid: identity::RepoId) -> Result<(), Error> {
        let profile = self.profile();
        let mut node = radicle::Node::new(profile.home().socket_from_env());

        node.announce_refs_for(rid, [profile.public_key])?;

        Ok(())
    }

    /// Seeds for `rid` as recorded in the node's database, without asking the
    /// daemon. Classifies each against our current `rad/sigrefs` head the way
    /// the daemon would.
    fn stored_seeds(&self, rid: identity::RepoId) -> Result<Vec<SeedStatus>, Error> {
        let profile = self.profile();
        let db = profile.database()?;
        let aliases = profile.aliases();
        let repo = profile.storage.repository(rid)?;
        let local = repo
            .reference_oid(&profile.public_key, &SIGREFS_BRANCH)
            .ok()
            .map(|oid| SyncedAt::new(oid, &repo))
            .transpose()?;

        let mut entries = Vec::new();
        for seed in db.seeds_for(&rid)? {
            let seed = seed?;
            if seed.nid == profile.public_key {
                continue;
            }
            // Without our own signed refs there is nothing to compare against,
            // so we report the seed but claim no sync state for it.
            let sync = local.as_ref().map(|local| {
                if local.oid == seed.synced_at.oid {
                    SyncStatus::Synced {
                        at: seed.synced_at.into(),
                    }
                } else {
                    SyncStatus::OutOfSync {
                        local: (*local).into(),
                        remote: seed.synced_at.into(),
                    }
                }
            });

            entries.push(SeedStatus {
                nid: seed.nid,
                alias: aliases.alias(&seed.nid),
                // Session state lives in the daemon; with it stopped we have
                // no connections to report.
                connected: false,
                sync,
            });
        }

        Ok(entries)
    }
}
