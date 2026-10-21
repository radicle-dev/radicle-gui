use serde::{Deserialize, Serialize};

use radicle::cob::{issue, patch};

/// Upper bound on caller-supplied `per_page` for paginated list and search
/// endpoints. Larger requests are silently clamped to this value to avoid
/// unbounded fan-out (e.g. N repository lookups, or N Meili results).
pub const MAX_PER_PAGE: usize = 100;

/// Upper bound on caller-supplied `q` length on search endpoints. Queries
/// longer than this are truncated before being forwarded to the search
/// backend.
pub const MAX_QUERY_LEN: usize = 256;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaginationQuery {
    #[serde(default)]
    pub show: RepoQuery,
    pub sort: Option<RepoSort>,
    pub page: Option<usize>,
    pub per_page: Option<usize>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub enum RepoQuery {
    All,
    #[default]
    Pinned,
}

#[derive(Serialize, Deserialize, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RepoSort {
    #[default]
    Rid,
    Activity,
    Seeding,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawQuery {
    pub mime: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CobsQuery<T> {
    pub page: Option<usize>,
    pub per_page: Option<usize>,
    pub status: Option<T>,
}

#[cfg(feature = "artifacts")]
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReleasesQuery {
    pub page: Option<usize>,
    pub per_page: Option<usize>,
    /// Include releases and artifacts authored by non-delegates.
    pub all_authors: Option<bool>,
    /// Include artifacts redacted by their author or a delegate.
    pub show_redacted: Option<bool>,
}

#[derive(Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum IssueStatus {
    Closed,
    #[default]
    Open,
    All,
}

impl IssueStatus {
    pub fn matches(&self, issue: &issue::State) -> bool {
        match self {
            Self::Open => matches!(issue, issue::State::Open),
            Self::Closed => matches!(issue, issue::State::Closed { .. }),
            Self::All => true,
        }
    }
}

#[derive(Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum PatchStatus {
    #[default]
    Open,
    Draft,
    Archived,
    Merged,
    All,
}

impl PatchStatus {
    pub fn matches(&self, patch: &patch::State) -> bool {
        match self {
            Self::Open => matches!(patch, patch::State::Open { .. }),
            Self::Draft => matches!(patch, patch::State::Draft),
            Self::Archived => matches!(patch, patch::State::Archived),
            Self::Merged => matches!(patch, patch::State::Merged { .. }),
            Self::All => true,
        }
    }
}
