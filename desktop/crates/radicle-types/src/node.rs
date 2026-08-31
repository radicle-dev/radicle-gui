use radicle::crypto::PublicKey;
use radicle::node::Alias;
use serde::Serialize;
use ts_rs::TS;

use crate::cobs::repo::SyncStatus;

/// Status of the local node, independent of any repository.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "node/")]
pub struct NodeStatus {
    /// Whether the node daemon is running.
    pub running: bool,
    /// Our own Node ID.
    #[ts(as = "String")]
    pub nid: PublicKey,
    /// Our own alias.
    #[ts(as = "String")]
    pub alias: Alias,
    /// Addresses the node listens on for inbound connections. Empty when the
    /// node is not configured to accept them.
    pub listen_addrs: Vec<String>,
    /// Number of peers we currently hold a connection to. Deliberately not
    /// paired with a total: the node's session table also holds disconnected
    /// entries awaiting retry, so any total reads as a cap that does not exist.
    pub connected_peers: usize,
    /// Number of repositories we have an "allow" seeding policy for.
    pub seeding: usize,
    /// How far our own work has propagated to other nodes.
    pub sync: SyncSummary,
}

/// How far the local node's own work has reached other nodes.
///
/// Derived from the node's `repo-sync-status` table, which records the head of
/// *our* `rad/sigrefs` that each other node was last seen holding. Comparing
/// that against our current head is the only thing we can honestly claim: it
/// says some node has our latest signed refs, not that the network as a whole
/// is in sync, which is unknowable in a peer-to-peer system.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "node/")]
pub struct SyncSummary {
    /// Repositories we seed and have signed refs in, i.e. the ones we have
    /// something of our own to propagate.
    pub repos: usize,
    /// Of those, how many have at least one other node holding our current
    /// `rad/sigrefs` head.
    pub confirmed: usize,
    /// The most recently published of those repositories. Absent when we have
    /// published nothing anywhere.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub latest: Option<LatestPublish>,
}

/// The repository we most recently published to, and whether that publication
/// has been seen elsewhere.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "node/")]
pub struct LatestPublish {
    #[ts(as = "String")]
    pub rid: radicle::identity::RepoId,
    /// Project name, when the repository has a project payload.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
    /// Commit time of our `rad/sigrefs` there, in milliseconds: when we last
    /// published to it.
    #[ts(type = "number")]
    pub published_at: i64,
    /// When another node was last recorded holding that exact head, in
    /// milliseconds. Absent while it has reached no one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "number", optional)]
    pub confirmed_at: Option<i64>,
    /// How many other nodes were recorded holding that exact head. Zero while
    /// it has reached no one.
    pub confirmed_by: usize,
    /// What kind of thing that publication touched.
    pub kind: PublishKind,
    /// Whether it was created, revised, or otherwise changed.
    pub change: PublishChange,
    /// The last collaborative-object action in that publication, by its serde
    /// tag, e.g. `comment` or `review`. Only resolved when the publication
    /// moved just an object, which is the case a ref diff alone cannot
    /// describe.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub action: Option<String>,
    /// Title of the object that action was on.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub title: Option<String>,
}

/// How a publication changed the thing it touched.
///
/// A patch's branch and its collaborative object move together for a revision,
/// but a comment, an edit or a state change moves only the object, so the two
/// are distinguishable.
#[derive(Debug, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "node/")]
pub enum PublishChange {
    /// The identifying ref did not exist in the previous signed refs.
    Created,
    /// An existing patch branch moved, i.e. new code was pushed to it.
    Revised,
    /// Only the collaborative object moved: a comment, edit or state change.
    Updated,
}

/// What a publication changed, derived from which refs moved between our
/// current `rad/sigrefs` and the one before it.
///
/// Paired with [`LatestPublish::created`] to tell a new object apart from a
/// change to an existing one.
#[derive(Debug, Serialize, TS, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "node/")]
pub enum PublishKind {
    /// Only patch refs moved.
    Patch,
    /// Only issue refs moved.
    Issue,
    /// Only ordinary branches moved.
    Branch,
    /// Several kinds moved at once, or the refs could not be compared.
    Mixed,
}

/// Sync status of a single repository across the seeds that hold it.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "node/")]
pub struct RepoSyncStatus {
    /// Seeds known to hold this repository, most recently synced first.
    pub seeds: Vec<SeedStatus>,
    /// Number of seeds that hold our refs at our local head.
    pub synced: usize,
    /// Number of seeds that report a sync status for our refs.
    pub tracked: usize,
    /// How many seeds the protocol aims to replicate to. Gives `synced` a
    /// denominator that means something: `tracked` counts every node that ever
    /// announced this repo, so a ratio against it reads as near-empty even when
    /// replication is healthy.
    pub target: usize,
    /// Whether the node answered. When false the seed list is empty because the
    /// node could not be queried, not because no seeds hold the repository, and
    /// callers should say so rather than reporting zero seeds.
    pub available: bool,
}

/// One seed's view of a repository.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "node/")]
pub struct SeedStatus {
    #[ts(as = "String")]
    pub nid: PublicKey,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub alias: Option<Alias>,
    /// Whether we currently hold a connection to this seed.
    pub connected: bool,
    /// How far this seed has replicated our refs. Absent when the seed reports
    /// no sync status for our namespace, which is the case for repositories we
    /// have never contributed to.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sync: Option<SyncStatus>,
}
