use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::str::FromStr;
use std::sync::Once;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use radicle::Storage;
use radicle::git::Oid;
use radicle::identity::RepoId;
use radicle::node::{self, Event, Handle, Node, NodeId};
use radicle::storage::refs::sigrefs::git::object::Reader as _;
use radicle::storage::refs::{REFS_BLOB_PATH, RefsAt};
use radicle::storage::{self, ReadStorage};
use tauri::{AppHandle, Emitter};

/// Refs that changed in a repository. `refs` is `None` when it isn't known
/// which refs changed, such as on the first announcement after a restart.
#[derive(Clone, serde::Serialize)]
struct RefUpdate {
    rid: RepoId,
    #[serde(skip_serializing_if = "Option::is_none")]
    refs: Option<Vec<String>>,
}

/// Whether the subscription to the node's events is up, so the frontend knows
/// whether it can rely on them or has to poll.
static LIVE: AtomicBool = AtomicBool::new(false);

pub(crate) fn is_live() -> bool {
    LIVE.load(Ordering::Relaxed)
}

/// Starts forwarding the node's ref updates, once per app: `startup` runs again
/// whenever the webview reloads.
pub(crate) fn spawn(app: AppHandle, node: Node, storage: Storage) {
    static FORWARDING: Once = Once::new();
    FORWARDING.call_once(|| {
        std::thread::spawn(move || {
            forward(
                app,
                node,
                Resolver {
                    storage,
                    seen: HashMap::new(),
                },
            )
        });
    });
}

/// Forwards the node's ref updates to the frontend as `ref_update` events.
/// Every time the subscription (re)starts, the frontend gets `ref_resync`,
/// because it may have missed events in between.
fn forward(app: AppHandle, node: Node, mut resolver: Resolver) {
    let mut subscribed = true;
    loop {
        match node.subscribe(Duration::from_secs(60 * 60 * 24)) {
            Ok(events) => {
                subscribed = true;
                let _live = Live::start();
                let _ = app.emit("ref_resync", ());
                for event in events {
                    match event {
                        Ok(event) => {
                            if let Some(update) = resolver.ref_update(event) {
                                let _ = app.emit("ref_update", update);
                            }
                        }
                        // An event this version can't read, such as a new kind
                        // from a newer node, doesn't end the subscription.
                        Err(
                            e @ (node::Error::InvalidJson { .. } | node::Error::Command { .. }),
                        ) => {
                            log::debug!("Skipping a node event: {e}");
                        }
                        Err(e) => {
                            log::warn!("Node event subscription ended: {e}");
                            break;
                        }
                    }
                }
            }
            // Mostly the node not running; logged once until it works again.
            Err(e) => {
                if subscribed {
                    log::info!("Not subscribed to node events: {e}");
                }
                subscribed = false;
            }
        }
        std::thread::sleep(Duration::from_secs(2));
    }
}

/// Marks the node's events as live while it exists, so that they stop
/// counting as live however the subscription ends, even by a panic.
struct Live;

impl Live {
    fn start() -> Self {
        LIVE.store(true, Ordering::Relaxed);
        Live
    }
}

impl Drop for Live {
    fn drop(&mut self) {
        LIVE.store(false, Ordering::Relaxed);
    }
}

/// Names the refs behind the node's events.
struct Resolver {
    storage: Storage,
    /// The last signed refs announced for each local namespace.
    seen: HashMap<(RepoId, NodeId), Oid>,
}

impl Resolver {
    fn ref_update(&mut self, event: Event) -> Option<RefUpdate> {
        match event {
            Event::RefsFetched { rid, updated, .. } => {
                let refs: Vec<String> = updated
                    .into_iter()
                    .filter_map(|update| match update {
                        storage::RefUpdate::Updated { name, .. }
                        | storage::RefUpdate::Created { name, .. }
                        | storage::RefUpdate::Deleted { name, .. } => Some(name.to_string()),
                        storage::RefUpdate::Skipped { .. } => None,
                    })
                    .collect();
                (!refs.is_empty()).then_some(RefUpdate {
                    rid,
                    refs: Some(refs),
                })
            }
            Event::CanonicalRefUpdated { rid, refname, .. } => Some(RefUpdate {
                rid,
                refs: Some(vec![refname.to_string()]),
            }),
            Event::LocalRefsAnnounced { rid, refs, .. } => {
                let refs = self.announced(rid, refs);
                match refs {
                    Some(refs) if refs.is_empty() => None,
                    refs => Some(RefUpdate { rid, refs }),
                }
            }
            _ => None,
        }
    }

    /// The refs that changed since the previous announcement of the same
    /// namespace, found by comparing their signed refs. This also names
    /// changes made outside the app, such as with the `rad` CLI, and several
    /// writes announced at once. `None` when there is nothing to compare
    /// with, such as the first announcement after a restart.
    fn announced(&mut self, rid: RepoId, refs: RefsAt) -> Option<Vec<String>> {
        let storage = &self.storage;
        // Verifying the refs would walk the whole history of older signed
        // refs, so they are read unverified. They are the node's own, and only
        // decide what the frontend refetches.
        let load = |at: Oid| -> Option<BTreeMap<String, Oid>> {
            let repo = storage.repository(rid).ok()?;
            let blob = repo.read_blob(&at, Path::new(REFS_BLOB_PATH)).ok()??;
            parse_refs(&blob.bytes)
        };
        announced_refs(&mut self.seen, rid, refs, load)
    }
}

/// Compares an announcement with the previous one of the same namespace,
/// loading each one's refs with `load`. The announcement is remembered even if
/// its refs can't be loaded, so the next one compares against it.
fn announced_refs(
    seen: &mut HashMap<(RepoId, NodeId), Oid>,
    rid: RepoId,
    refs: RefsAt,
    load: impl Fn(Oid) -> Option<BTreeMap<String, Oid>>,
) -> Option<Vec<String>> {
    let previous = seen.insert((rid, refs.remote), refs.at)?;
    if previous == refs.at {
        return Some(Vec::new());
    }
    Some(changed_refs(&load(previous)?, &load(refs.at)?))
}

/// Parses a signed refs blob: one `<oid> <name>` line per ref. The link to the
/// previous signed refs isn't a ref of the repository, so it is left out.
fn parse_refs(bytes: &[u8]) -> Option<BTreeMap<String, Oid>> {
    std::str::from_utf8(bytes)
        .ok()?
        .lines()
        .map(|line| {
            let (oid, name) = line.split_once(' ')?;
            Some((name.to_string(), Oid::from_str(oid).ok()?))
        })
        .filter(|entry| !matches!(entry, Some((name, _)) if name == "refs/rad/sigrefs-parent"))
        .collect()
}

/// The refs that were added, changed or removed between two sets of refs.
fn changed_refs(before: &BTreeMap<String, Oid>, after: &BTreeMap<String, Oid>) -> Vec<String> {
    after
        .iter()
        .filter(|(name, oid)| before.get(*name) != Some(*oid))
        .map(|(name, _)| name.clone())
        .chain(
            before
                .keys()
                .filter(|name| !after.contains_key(*name))
                .cloned(),
        )
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, HashMap};
    use std::str::FromStr;

    use radicle::git::Oid;
    use radicle::identity::RepoId;
    use radicle::node::NodeId;
    use radicle::storage::refs::RefsAt;

    use super::{announced_refs, changed_refs, parse_refs};

    fn oid(c: char) -> Oid {
        Oid::from_str(&c.to_string().repeat(40)).unwrap()
    }

    fn rid() -> RepoId {
        RepoId::from_str("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5").unwrap()
    }

    fn at(c: char) -> RefsAt {
        RefsAt {
            remote: NodeId::from_str("z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5").unwrap(),
            at: oid(c),
        }
    }

    // Signed refs `a` hold one issue, `b` a changed issue and a new branch.
    fn load(at: Oid) -> Option<BTreeMap<String, Oid>> {
        let issue = "refs/cobs/xyz.radicle.issue/1".to_string();
        if at == oid('a') {
            Some(BTreeMap::from([(issue, oid('1'))]))
        } else if at == oid('b') {
            Some(BTreeMap::from([
                (issue, oid('2')),
                ("refs/heads/topic".to_string(), oid('1')),
            ]))
        } else {
            None
        }
    }

    #[test]
    fn the_first_announcement_is_broad() {
        let mut seen = HashMap::new();
        assert_eq!(announced_refs(&mut seen, rid(), at('a'), load), None);
        assert_eq!(seen.values().collect::<Vec<_>>(), vec![&oid('a')]);
    }

    #[test]
    fn a_repeated_announcement_names_nothing() {
        let mut seen = HashMap::new();
        announced_refs(&mut seen, rid(), at('a'), load);
        assert_eq!(
            announced_refs(&mut seen, rid(), at('a'), load),
            Some(Vec::new())
        );
    }

    #[test]
    fn an_announcement_names_the_refs_since_the_previous_one() {
        let mut seen = HashMap::new();
        announced_refs(&mut seen, rid(), at('a'), load);
        assert_eq!(
            announced_refs(&mut seen, rid(), at('b'), load),
            Some(vec![
                "refs/cobs/xyz.radicle.issue/1".to_string(),
                "refs/heads/topic".to_string(),
            ])
        );
    }

    #[test]
    fn unreadable_refs_are_broad_but_remembered() {
        let mut seen = HashMap::new();
        announced_refs(&mut seen, rid(), at('a'), load);
        assert_eq!(announced_refs(&mut seen, rid(), at('c'), load), None);
        // The next announcement compares against the unreadable one, which
        // stays broad rather than naming changes it can't see.
        assert_eq!(announced_refs(&mut seen, rid(), at('b'), load), None);
        // From `b` back to `a` the issue changes again and the branch goes.
        assert_eq!(
            announced_refs(&mut seen, rid(), at('a'), load),
            Some(vec![
                "refs/cobs/xyz.radicle.issue/1".to_string(),
                "refs/heads/topic".to_string(),
            ])
        );
    }

    fn refs(entries: &[(&str, &str)]) -> BTreeMap<String, Oid> {
        entries
            .iter()
            .map(|(name, oid)| (name.to_string(), Oid::from_str(oid).unwrap()))
            .collect()
    }

    #[test]
    fn names_added_changed_and_removed_refs() {
        let a = "a".repeat(40);
        let b = "b".repeat(40);
        let before = refs(&[
            ("refs/cobs/xyz.radicle.issue/1", &a),
            ("refs/cobs/xyz.radicle.patch/2", &a),
            ("refs/heads/main", &a),
        ]);
        let after = refs(&[
            ("refs/cobs/xyz.radicle.issue/1", &b),
            ("refs/heads/main", &a),
            ("refs/heads/topic", &a),
        ]);

        assert_eq!(
            changed_refs(&before, &after),
            vec![
                "refs/cobs/xyz.radicle.issue/1",
                "refs/heads/topic",
                "refs/cobs/xyz.radicle.patch/2",
            ]
        );
    }

    #[test]
    fn parses_signed_refs_without_the_parent_link() {
        let a = "a".repeat(40);
        let blob = format!(
            "{a} refs/cobs/xyz.radicle.issue/1\n{a} refs/heads/main\n{a} refs/rad/sigrefs-parent\n"
        );
        assert_eq!(
            parse_refs(blob.as_bytes()),
            Some(refs(&[
                ("refs/cobs/xyz.radicle.issue/1", &a),
                ("refs/heads/main", &a),
            ]))
        );
        assert_eq!(parse_refs(b"not a ref line\n"), None);
    }

    #[test]
    fn names_nothing_when_unchanged() {
        let a = "a".repeat(40);
        let both = refs(&[("refs/heads/main", &a)]);
        assert!(changed_refs(&both, &both).is_empty());
    }
}
