use std::time::Duration;

use meilisearch_sdk::client::Client;
use meilisearch_sdk::indexes;
use meilisearch_sdk::search::Selectors;
use serde::Deserialize;
use thiserror::Error;

use radicle::identity::RepoId;

use crate::index::repo;

#[derive(Debug, Error)]
pub enum SearchError {
    #[error("search query timed out")]
    Timeout,
    #[error("meilisearch error: {0}")]
    Meili(#[from] meilisearch_sdk::errors::Error),
}

#[derive(Debug, Clone, Copy)]
pub enum SortField {
    HeadCommitterTime,
    SeedingCount,
}

impl SortField {
    fn field(self) -> &'static str {
        match self {
            Self::HeadCommitterTime => repo::FIELD_HEAD_COMMITTER_TIME,
            Self::SeedingCount => repo::FIELD_SEEDING_COUNT,
        }
    }
}

/// A read-only Meilisearch client for obtaining pre-sorted repo listings
/// and full-text search results. Document construction lives in the
/// indexer; this client only reads.
#[derive(Clone)]
pub struct SearchClient {
    index: indexes::Index,
    query_timeout: Duration,
}

#[derive(Deserialize)]
struct RidHit {
    rid: String,
}

impl SearchClient {
    pub fn new(
        url: &str,
        api_key: Option<&str>,
        index_name: &str,
        query_timeout: Duration,
    ) -> Result<Self, SearchError> {
        let client = Client::new(url, api_key)?;
        let index = client.index(index_name);
        Ok(Self {
            index,
            query_timeout,
        })
    }

    /// Return a sorted, paginated list of RIDs. Always sorts descending —
    /// the only useful direction for activity/seeding.
    pub async fn sorted_rids(
        &self,
        sort: SortField,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RepoId>, SearchError> {
        let sort_clause = format!("{}:desc", sort.field());
        let sort_attrs = [sort_clause.as_str()];
        let attrs = ["rid"];

        let mut query = self.index.search();
        query
            .with_sort(&sort_attrs)
            .with_offset(offset)
            .with_limit(limit)
            .with_attributes_to_retrieve(Selectors::Some(&attrs));

        let result = tokio::time::timeout(self.query_timeout, query.execute::<RidHit>())
            .await
            .map_err(|_| SearchError::Timeout)??;

        let rids = result
            .hits
            .into_iter()
            .filter_map(|hit| hit.result.rid.parse::<RepoId>().ok())
            .collect();
        Ok(rids)
    }

    /// Free-text search by name / description. Meilisearch ranks by its
    /// built-in relevance rules (typo-tolerant prefix match); ties — and
    /// the empty-query case — fall back to seedingCount desc.
    pub async fn search_by_query(
        &self,
        query: &str,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RepoId>, SearchError> {
        let sort_clause = format!("{}:desc", repo::FIELD_SEEDING_COUNT);
        let sort_attrs = [sort_clause.as_str()];
        let attrs = ["rid"];

        let mut search = self.index.search();
        search
            .with_query(query)
            .with_sort(&sort_attrs)
            .with_offset(offset)
            .with_limit(limit)
            .with_attributes_to_retrieve(Selectors::Some(&attrs));

        let result = tokio::time::timeout(self.query_timeout, search.execute::<RidHit>())
            .await
            .map_err(|_| SearchError::Timeout)??;

        let rids = result
            .hits
            .into_iter()
            .filter_map(|hit| hit.result.rid.parse::<RepoId>().ok())
            .collect();
        Ok(rids)
    }
}
