pub mod data;
pub use data::{Activity, Document, DocumentKey, IssueCounts, PatchCounts};

use meilisearch_sdk::settings::{PaginationSetting, Settings};

/// Meilisearch field name for the head commit's committer timestamp.
pub const FIELD_HEAD_COMMITTER_TIME: &str = "headCommitterTime";
/// Meilisearch field name for the count of nodes seeding this repo.
pub const FIELD_SEEDING_COUNT: &str = "seedingCount";

pub const SORTABLE: &[&str] = &[
    FIELD_HEAD_COMMITTER_TIME,
    FIELD_SEEDING_COUNT,
    Document::PRIMARY_KEY,
];
pub const SEARCHABLE: &[&str] = &["name", "description"];
pub const FILTERABLE: &[&str] = &["delegates", "visibility", "rid"];
// Promote the `sort` rule ahead of `proximity`/`attribute`/`exactness` so
// that once a repo matches the query words (typo-tolerant), the query's
// `seedingCount:desc` sort decides order, with finer relevance acting as the
// tie-breaker. Meilisearch's default order keeps `sort` second-to-last, which
// reduces seed count to a deep tie-breaker for text queries.
pub const RANKING_RULES: &[&str] = &[
    "words",
    "typo",
    "sort",
    "proximity",
    "attribute",
    "exactness",
];

pub fn settings() -> Settings {
    Settings::new()
        .with_searchable_attributes(SEARCHABLE)
        .with_sortable_attributes(SORTABLE)
        .with_filterable_attributes(FILTERABLE)
        .with_ranking_rules(RANKING_RULES)
        .with_pagination(PaginationSetting {
            max_total_hits: super::MAX_TOTAL_HITS,
        })
}
