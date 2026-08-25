use serde::Serialize;
use thiserror::Error;
use ts_rs::TS;

use radicle::identity;

/// What one person authored in one repo, counted from the COB cache.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "contribution/")]
pub struct RepoContribution {
    #[ts(as = "String")]
    pub rid: identity::RepoId,
    #[ts(type = "number")]
    pub patches_authored: usize,
    #[ts(type = "number")]
    pub issues_authored: usize,
    /// When this person last contributed here, in epoch milliseconds. Counts
    /// follow-up revisions as well as opened patches and issues, so it is the
    /// last time they touched the repo at all.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(type = "number | undefined", optional)]
    pub last_contribution: Option<i64>,
}

/// What kind of thing an activity item records. `Revision` is a follow-up
/// revision pushed to someone else's or one's own existing patch, which is
/// distinct from opening the patch in the first place.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "contribution/")]
pub enum ActivityKind {
    Patch,
    Revision,
    Issue,
}

/// Something this person contributed, for the cross-repo activity feed.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "contribution/")]
pub struct ActivityItem {
    #[ts(as = "String")]
    pub rid: identity::RepoId,
    pub kind: ActivityKind,
    /// The COB to open: the patch or issue id. A revision item carries the id
    /// of the patch it belongs to, since revisions are not addressable on
    /// their own.
    pub id: String,
    /// Set only on revision items, and only to keep them distinct from each
    /// other and from their patch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub revision_id: Option<String>,
    /// 1-based position of this revision among its patch's revisions, and how
    /// many there are. Filled in from the patch's delivered revision order,
    /// not from the cache — see `Patches::annotate_revision_positions`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(type = "number | undefined", optional)]
    pub revision_position: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(type = "number | undefined", optional)]
    pub revision_total: Option<usize>,
    pub title: String,
    pub status: String,
    #[ts(type = "number")]
    pub timestamp: i64,
}

/// One day's contribution count, for the calendar heatmap. Days with no
/// contributions are omitted; the caller fills the grid.
#[derive(Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "contribution/")]
pub struct ContributionDay {
    /// `YYYY-MM-DD`, bucketed in UTC.
    pub date: String,
    #[ts(type = "number")]
    pub count: usize,
}

#[derive(Debug, Error)]
pub enum ContributionError {
    #[error(transparent)]
    Sqlite(#[from] sqlite::Error),

    #[error(transparent)]
    Unknown(#[from] anyhow::Error),
    // to be extended as new error scenarios are introduced
}
