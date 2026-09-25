use serde::{Deserialize, Serialize};

use radicle::cob::{issue, patch};
use radicle::identity::Did;
use radicle::node::NodeId;
use radicle_search::query::CobFilter;

/// Upper bound on caller-supplied `per_page` for paginated list and search
/// endpoints. Larger requests are silently clamped to this value to avoid
/// unbounded fan-out (e.g. N repository lookups, or N Meili results).
pub const MAX_PER_PAGE: usize = 100;

/// Upper bound on caller-supplied `q` length on search endpoints. Queries
/// longer than this are truncated before being forwarded to the search
/// backend.
pub const MAX_QUERY_LEN: usize = 256;

pub fn search_query(q: Option<String>) -> String {
    q.unwrap_or_default()
        .trim()
        .chars()
        .take(MAX_QUERY_LEN)
        .collect()
}

/// Parse a `did:key:…` DID or a bare node id into a [`Did`].
pub fn parse_did(s: &str) -> Option<Did> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    s.parse::<Did>()
        .ok()
        .or_else(|| s.parse::<NodeId>().ok().map(Did::from))
}

fn optional(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

fn parse_optional_did(value: &Option<String>) -> Result<Option<Did>, ()> {
    match optional(value) {
        None => Ok(None),
        Some(s) => parse_did(s).map(Some).ok_or(()),
    }
}

fn usable_label(value: &Option<String>) -> Result<Option<&str>, ()> {
    match optional(value) {
        None => Ok(None),
        Some(l) if l.contains(['"', '\\']) => Err(()),
        Some(l) => Ok(Some(l)),
    }
}

/// Build the search filter for a cob search request. `None` means a supplied
/// value can never match (unparsable DID, label with a quote), so the caller
/// answers with an empty list.
pub fn cob_filter<'a, T>(
    state: Option<&'static str>,
    qs: &'a CobsSearchQuery<T>,
) -> Option<CobFilter<'a>> {
    Some(CobFilter {
        state,
        author: parse_optional_did(&qs.author).ok()?,
        assignee: parse_optional_did(&qs.assignee).ok()?,
        label: usable_label(&qs.label).ok()?,
    })
}

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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CobsSearchQuery<T> {
    pub q: Option<String>,
    pub page: Option<usize>,
    pub per_page: Option<usize>,
    pub status: Option<T>,
    pub author: Option<String>,
    pub assignee: Option<String>,
    pub label: Option<String>,
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

#[cfg(feature = "artifacts")]
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReleasesSearchQuery {
    pub q: Option<String>,
    pub page: Option<usize>,
    pub per_page: Option<usize>,
    pub all_authors: Option<bool>,
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

impl IssueStatus {
    pub fn as_state_filter(&self) -> Option<&'static str> {
        match self {
            Self::All => None,
            Self::Open => Some("open"),
            Self::Closed => Some("closed"),
        }
    }
}

impl PatchStatus {
    pub fn as_state_filter(&self) -> Option<&'static str> {
        match self {
            Self::All => None,
            Self::Open => Some("open"),
            Self::Draft => Some("draft"),
            Self::Archived => Some("archived"),
            Self::Merged => Some("merged"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_filters_map_to_state_strings() {
        assert_eq!(IssueStatus::All.as_state_filter(), None);
        assert_eq!(IssueStatus::Open.as_state_filter(), Some("open"));
        assert_eq!(IssueStatus::Closed.as_state_filter(), Some("closed"));
        assert_eq!(PatchStatus::All.as_state_filter(), None);
        assert_eq!(PatchStatus::Draft.as_state_filter(), Some("draft"));
        assert_eq!(PatchStatus::Merged.as_state_filter(), Some("merged"));
    }

    #[test]
    fn search_query_trims_and_truncates() {
        assert_eq!(search_query(None), "");
        assert_eq!(search_query(Some("  hello  ".to_string())), "hello");
        let long = "x".repeat(MAX_QUERY_LEN + 10);
        assert_eq!(search_query(Some(long)).chars().count(), MAX_QUERY_LEN);
    }

    #[test]
    fn parse_did_accepts_did_and_bare_nid() {
        let did = "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";
        let nid = "z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";
        assert_eq!(parse_did(did).unwrap().to_string(), did);
        assert_eq!(parse_did(nid).unwrap().to_string(), did);
        assert_eq!(
            parse_did(" did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5 ")
                .unwrap()
                .to_string(),
            did
        );
        assert!(parse_did("alice").is_none());
        assert!(parse_did("").is_none());
    }

    #[test]
    fn cob_filter_rejects_unusable_values() {
        let base = CobsSearchQuery::<IssueStatus> {
            q: None,
            page: None,
            per_page: None,
            status: None,
            author: None,
            assignee: None,
            label: None,
        };
        let did = "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";

        let ok = CobsSearchQuery {
            author: Some(did.to_string()),
            assignee: Some(did.to_string()),
            label: Some("good-first-issue".to_string()),
            ..base.clone()
        };
        let filter = cob_filter(Some("open"), &ok).unwrap();
        assert_eq!(filter.state, Some("open"));
        assert_eq!(filter.author.unwrap().to_string(), did);
        assert_eq!(filter.assignee.unwrap().to_string(), did);
        assert_eq!(filter.label, Some("good-first-issue"));

        let empty_strings = CobsSearchQuery {
            author: Some(String::new()),
            label: Some("  ".to_string()),
            ..base.clone()
        };
        let filter = cob_filter(None, &empty_strings).unwrap();
        assert!(filter.author.is_none());
        assert!(filter.label.is_none());

        let bad_author = CobsSearchQuery {
            author: Some("alice".to_string()),
            ..base.clone()
        };
        assert!(cob_filter(None, &bad_author).is_none());

        let bad_label = CobsSearchQuery {
            label: Some("a\"b".to_string()),
            ..base.clone()
        };
        assert!(cob_filter(None, &bad_label).is_none());

        let bad_label = CobsSearchQuery {
            label: Some("a\\b".to_string()),
            ..base
        };
        assert!(cob_filter(None, &bad_label).is_none());
    }
}
