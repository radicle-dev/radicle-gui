use radicle::identity::RepoId;
use radicle::node::{Alias, Event, NodeId};

#[derive(Debug)]
pub(super) enum EventCategory {
    /// The node successfully replicated refs for this rid; implies we seed it.
    Replication,
    /// Network gossip mentioning a rid that may or may not be locally seeded.
    Gossip,
}

#[derive(Debug)]
pub(super) enum EventClass {
    /// An event about a repository's refs or seeding status.
    Repo(RepoId, EventCategory),
    /// A node announced itself (alias may have changed).
    Node { nid: NodeId, alias: Alias },
    /// A node announced its full inventory.
    Inventory { nid: NodeId, inventory: Vec<RepoId> },
}

pub(super) fn classify_event(event: &Event) -> Option<EventClass> {
    match event {
        Event::LocalRefsAnnounced { rid, .. }
        | Event::CanonicalRefUpdated { rid, .. }
        | Event::RefsFetched { rid, .. }
        | Event::RefsSynced { rid, .. } => Some(EventClass::Repo(*rid, EventCategory::Replication)),
        Event::RefsAnnounced { rid, .. } => Some(EventClass::Repo(*rid, EventCategory::Gossip)),
        // Seed events only feed the seedingCount ranking field, which the
        // periodic rescan refreshes anyway. Any peer can emit them at will
        // by flapping its connection, so reindexing on them is a DoS vector.
        Event::SeedDiscovered { .. } | Event::SeedDropped { .. } => None,
        Event::NodeAnnounced { nid, alias, .. } => Some(EventClass::Node {
            nid: *nid,
            alias: alias.clone(),
        }),
        Event::InventoryAnnounced { nid, inventory, .. } => Some(EventClass::Inventory {
            nid: *nid,
            inventory: inventory.clone(),
        }),
        _ => None,
    }
}

pub(super) fn event_kind(event: &Event) -> &'static str {
    match event {
        Event::RefsFetched { .. } => "RefsFetched",
        Event::RefsSynced { .. } => "RefsSynced",
        Event::RefsAnnounced { .. } => "RefsAnnounced",
        Event::SeedDiscovered { .. } => "SeedDiscovered",
        Event::SeedDropped { .. } => "SeedDropped",
        Event::PeerConnected { .. } => "PeerConnected",
        Event::PeerDisconnected { .. } => "PeerDisconnected",
        Event::LocalRefsAnnounced { .. } => "LocalRefsAnnounced",
        Event::InventoryAnnounced { .. } => "InventoryAnnounced",
        Event::NodeAnnounced { .. } => "NodeAnnounced",
        Event::UploadPack(_) => "UploadPack",
        Event::CanonicalRefUpdated { .. } => "CanonicalRefUpdated",
        _ => "Unknown",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum EventAction {
    /// Gossip about a repo we don't seed — ignore.
    Skip,
    /// Repo we already track changed — reindex it.
    Reindex,
    /// Replication event for a repo not yet in cache — add to cache and reindex.
    DiscoverAndReindex,
}

pub(super) fn event_action(category: EventCategory, is_locally_seeded: bool) -> EventAction {
    match (category, is_locally_seeded) {
        (EventCategory::Gossip, false) => EventAction::Skip,
        (EventCategory::Gossip, true) => EventAction::Reindex,
        (EventCategory::Replication, true) => EventAction::Reindex,
        (EventCategory::Replication, false) => EventAction::DiscoverAndReindex,
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn seed_events_are_ignored() {
        let rid = "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5".parse().unwrap();
        let nid = "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi"
            .parse()
            .unwrap();
        assert!(classify_event(&Event::SeedDiscovered { rid, nid }).is_none());
        assert!(classify_event(&Event::SeedDropped { rid, nid }).is_none());
    }

    #[test]
    fn gossip_not_seeded_is_skipped() {
        assert_eq!(
            event_action(EventCategory::Gossip, false),
            EventAction::Skip
        );
    }

    #[test]
    fn gossip_seeded_triggers_reindex() {
        assert_eq!(
            event_action(EventCategory::Gossip, true),
            EventAction::Reindex
        );
    }

    #[test]
    fn replication_not_seeded_discovers() {
        assert_eq!(
            event_action(EventCategory::Replication, false),
            EventAction::DiscoverAndReindex
        );
    }

    #[test]
    fn replication_seeded_triggers_reindex() {
        assert_eq!(
            event_action(EventCategory::Replication, true),
            EventAction::Reindex
        );
    }

    #[test]
    fn node_announced_is_classified() {
        use std::str::FromStr;
        let nid =
            radicle::node::NodeId::from_str("z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi")
                .unwrap();
        let event = radicle::node::Event::NodeAnnounced {
            nid,
            alias: radicle::node::Alias::new("seed"),
            timestamp: radicle::node::Timestamp::try_from(1755700000u64).unwrap(),
            features: radicle::node::Features::SEED,
            addresses: vec![],
        };
        match classify_event(&event) {
            Some(EventClass::Node { nid: n, alias }) => {
                assert_eq!(n, nid);
                assert_eq!(alias.to_string(), "seed");
            }
            other => panic!("unexpected classification: {:?}", other.is_some()),
        }
    }

    #[test]
    fn inventory_announced_is_classified() {
        use std::str::FromStr;
        let nid =
            radicle::node::NodeId::from_str("z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi")
                .unwrap();
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let event = radicle::node::Event::InventoryAnnounced {
            nid,
            inventory: vec![rid],
            timestamp: radicle::node::Timestamp::try_from(1755700000u64).unwrap(),
        };
        match classify_event(&event) {
            Some(EventClass::Inventory { nid: n, inventory }) => {
                assert_eq!(n, nid);
                assert_eq!(inventory, vec![rid]);
            }
            other => panic!("unexpected classification: {:?}", other.is_some()),
        }
    }

    #[test]
    fn repo_events_still_classified() {
        use std::str::FromStr;
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let nid =
            radicle::node::NodeId::from_str("z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi")
                .unwrap();
        let event = radicle::node::Event::RefsAnnounced {
            nid,
            rid,
            refs: vec![],
            timestamp: radicle::node::Timestamp::try_from(1755700000u64).unwrap(),
        };
        assert!(matches!(
            classify_event(&event),
            Some(EventClass::Repo(r, EventCategory::Gossip)) if r == rid
        ));
    }
}
