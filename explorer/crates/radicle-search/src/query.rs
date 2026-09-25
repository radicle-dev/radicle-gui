use std::collections::HashMap;
use std::time::Duration;

use meilisearch_sdk::client::Client;
use meilisearch_sdk::documents::DocumentsQuery;
use meilisearch_sdk::errors::ErrorCode;
use meilisearch_sdk::indexes;
use meilisearch_sdk::search::Selectors;
use serde::Deserialize;
use thiserror::Error;

use radicle::identity::{Did, RepoId};
use radicle::node::policy::{SeedPolicy, SeedingPolicy};
use radicle::node::{Alias, NodeId};

use crate::index::node;
use crate::index::repo;
use crate::index::{cob, inventory, policy, release};

#[derive(Debug, Error)]
pub enum SearchError {
    #[error("search query timed out")]
    Timeout,
    #[error("document schema version mismatch (index is being rebuilt)")]
    SchemaMismatch,
    #[error("meilisearch error: {0}")]
    Meili(#[from] meilisearch_sdk::errors::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CobKind {
    Issues,
    Patches,
}

impl CobKind {
    pub fn base(self) -> &'static str {
        match self {
            Self::Issues => "issues",
            Self::Patches => "patches",
        }
    }
}

pub(crate) fn index_uid(prefix: &str, base: &str) -> String {
    format!("{prefix}{base}")
}

pub(crate) fn ensure_v(v: u32) -> Result<(), SearchError> {
    if v == crate::index::SCHEMA_VERSION {
        Ok(())
    } else {
        Err(SearchError::SchemaMismatch)
    }
}

#[derive(Debug, Clone, Copy)]
pub enum SortField {
    HeadCommitterTime,
    SeedingCount,
    Rid,
}

impl SortField {
    fn field(self) -> &'static str {
        match self {
            Self::HeadCommitterTime => repo::FIELD_HEAD_COMMITTER_TIME,
            Self::SeedingCount => repo::FIELD_SEEDING_COUNT,
            Self::Rid => repo::FIELD_RID_HEX,
        }
    }

    fn direction(self) -> &'static str {
        match self {
            Self::HeadCommitterTime | Self::SeedingCount => "desc",
            Self::Rid => "asc",
        }
    }
}

pub(crate) fn in_filter<T: std::fmt::Display>(field: &str, values: &[T]) -> String {
    let quoted: Vec<String> = values.iter().map(|v| format!("\"{v}\"")).collect();
    format!("{field} IN [{}]", quoted.join(", "))
}

pub(crate) fn eq_filter(field: &str, value: impl std::fmt::Display) -> String {
    format!("{field} = \"{value}\"")
}

#[derive(Debug, Clone, Copy, Default)]
pub struct CobFilter<'a> {
    pub state: Option<&'a str>,
    pub author: Option<Did>,
    pub assignee: Option<Did>,
    pub label: Option<&'a str>,
}

pub(crate) fn cob_search_filter(rid: RepoId, filter: &CobFilter<'_>) -> String {
    let mut clauses = vec![eq_filter("rid", rid)];
    if let Some(state) = filter.state {
        clauses.push(eq_filter("state", state));
    }
    if let Some(author) = filter.author {
        clauses.push(eq_filter("authorDid", author));
    }
    if let Some(assignee) = filter.assignee {
        clauses.push(eq_filter("assigneeDids", assignee));
    }
    if let Some(label) = filter.label {
        clauses.push(eq_filter("labels", label));
    }
    clauses.join(" AND ")
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ReleaseView {
    pub all_authors: bool,
    pub show_redacted: bool,
}

pub(crate) fn release_filter(rid: RepoId, view: ReleaseView) -> String {
    let mut clauses = vec![eq_filter("rid", rid)];
    if !view.all_authors {
        clauses.push("creatorIsDelegate = true".to_string());
    }
    if !view.show_redacted {
        clauses.push("redacted = false".to_string());
    }
    clauses.join(" AND ")
}

fn is_not_found(e: &meilisearch_sdk::errors::Error) -> bool {
    matches!(
        e,
        meilisearch_sdk::errors::Error::Meilisearch(inner)
            if inner.error_code == ErrorCode::DocumentNotFound
    )
}

/// A read-only Meilisearch client over the seven indexes radicle-search
/// publishes. Document construction lives in the indexer; this client
/// only reads.
#[derive(Clone)]
pub struct SearchClient {
    repos: indexes::Index,
    issues: indexes::Index,
    patches: indexes::Index,
    nodes: indexes::Index,
    policies: indexes::Index,
    inventory: indexes::Index,
    releases: indexes::Index,
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
        index_prefix: &str,
        query_timeout: Duration,
    ) -> Result<Self, SearchError> {
        let client = Client::new(url, api_key)?;
        Ok(Self {
            repos: client.index(index_uid(index_prefix, "repos")),
            issues: client.index(index_uid(index_prefix, "issues")),
            patches: client.index(index_uid(index_prefix, "patches")),
            nodes: client.index(index_uid(index_prefix, "nodes")),
            policies: client.index(index_uid(index_prefix, "policies")),
            inventory: client.index(index_uid(index_prefix, "inventory")),
            releases: client.index(index_uid(index_prefix, "releases")),
            query_timeout,
        })
    }

    fn cob_index(&self, kind: CobKind) -> &indexes::Index {
        match kind {
            CobKind::Issues => &self.issues,
            CobKind::Patches => &self.patches,
        }
    }

    /// Return a sorted, paginated list of RIDs. Always sorts descending —
    /// the only useful direction for activity/seeding.
    pub async fn sorted_rids(
        &self,
        sort: SortField,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RepoId>, SearchError> {
        let sort_clause = format!("{}:{}", sort.field(), sort.direction());
        let sort_attrs = [sort_clause.as_str()];
        let attrs = ["rid"];

        let mut query = self.repos.search();
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

    async fn run<T, F>(&self, fut: F) -> Result<T, SearchError>
    where
        F: std::future::Future<Output = Result<T, meilisearch_sdk::errors::Error>>,
    {
        tokio::time::timeout(self.query_timeout, fut)
            .await
            .map_err(|_| SearchError::Timeout)?
            .map_err(SearchError::from)
    }

    async fn get_document<D>(
        &self,
        index: &indexes::Index,
        id: &str,
    ) -> Result<Option<D>, SearchError>
    where
        D: serde::de::DeserializeOwned + Send + Sync + 'static,
    {
        match self.run(index.get_document::<D>(id)).await {
            Ok(doc) => Ok(Some(doc)),
            Err(SearchError::Meili(e)) if is_not_found(&e) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub async fn get_repo_doc(&self, rid: RepoId) -> Result<Option<repo::Document>, SearchError> {
        let doc: Option<repo::Document> = self.get_document(&self.repos, &rid.canonical()).await?;
        doc.map(|d| ensure_v(d.v).map(|()| d)).transpose()
    }

    pub async fn get_repo_docs(&self, rids: &[RepoId]) -> Result<Vec<repo::Document>, SearchError> {
        if rids.is_empty() {
            return Ok(Vec::new());
        }
        let filter = in_filter("rid", rids);
        let mut query = DocumentsQuery::new(&self.repos);
        query.with_filter(&filter).with_limit(rids.len());
        let page = self
            .run(self.repos.get_documents_with::<repo::Document>(&query))
            .await?;
        page.results
            .into_iter()
            .map(|d| ensure_v(d.v).map(|()| d))
            .collect()
    }

    pub async fn get_node(&self, nid: &NodeId) -> Result<Option<node::Document>, SearchError> {
        let doc: Option<node::Document> = self.get_document(&self.nodes, &nid.to_string()).await?;
        doc.map(|d| ensure_v(d.v).map(|()| d)).transpose()
    }

    pub async fn get_aliases(
        &self,
        nids: &[NodeId],
    ) -> Result<HashMap<NodeId, Alias>, SearchError> {
        if nids.is_empty() {
            return Ok(HashMap::new());
        }
        let filter = in_filter("nid", nids);
        let mut query = DocumentsQuery::new(&self.nodes);
        query.with_filter(&filter).with_limit(nids.len());
        let page = self
            .run(self.nodes.get_documents_with::<node::Document>(&query))
            .await?;
        let mut aliases = HashMap::new();
        for doc in page.results {
            ensure_v(doc.v)?;
            if let Some(alias) = doc.alias.and_then(|a| a.parse::<Alias>().ok()) {
                aliases.insert(doc.nid, alias);
            }
        }
        Ok(aliases)
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

        let mut search = self.repos.search();
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

    pub async fn search_cobs(
        &self,
        kind: CobKind,
        rid: RepoId,
        q: &str,
        filter: CobFilter<'_>,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<cob::Document>, SearchError> {
        let index = self.cob_index(kind);
        let filter = cob_search_filter(rid, &filter);
        let sort = ["timestamp:desc"];
        let mut query = index.search();
        if !q.is_empty() {
            query.with_query(q);
        }
        query
            .with_filter(&filter)
            .with_sort(&sort)
            .with_offset(offset)
            .with_limit(limit);
        let result = self.run(query.execute::<cob::Document>()).await?;
        result
            .hits
            .into_iter()
            .map(|hit| ensure_v(hit.result.v).map(|()| hit.result))
            .collect()
    }

    pub async fn list_cobs(
        &self,
        kind: CobKind,
        rid: RepoId,
        state: Option<&str>,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<cob::Document>, SearchError> {
        self.search_cobs(
            kind,
            rid,
            "",
            CobFilter {
                state,
                ..Default::default()
            },
            offset,
            limit,
        )
        .await
    }

    pub async fn get_cob(
        &self,
        kind: CobKind,
        rid: RepoId,
        oid: &str,
    ) -> Result<Option<cob::Document>, SearchError> {
        let doc: Option<cob::Document> = self
            .get_document(self.cob_index(kind), &cob::doc_id(rid, oid))
            .await?;
        doc.map(|d| ensure_v(d.v).map(|()| d)).transpose()
    }

    pub async fn list_releases(
        &self,
        rid: RepoId,
        view: ReleaseView,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<release::Document>, SearchError> {
        let filter = release_filter(rid, view);
        let sort = ["timestamp:desc"];
        let mut query = self.releases.search();
        query
            .with_filter(&filter)
            .with_sort(&sort)
            .with_offset(offset)
            .with_limit(limit);
        let result = self.run(query.execute::<release::Document>()).await?;
        result
            .hits
            .into_iter()
            .map(|hit| ensure_v(hit.result.v).map(|()| hit.result))
            .collect()
    }

    pub async fn get_release(
        &self,
        rid: RepoId,
        oid: &str,
    ) -> Result<Option<release::Document>, SearchError> {
        let doc: Option<release::Document> = self
            .get_document(&self.releases, &cob::doc_id(rid, oid))
            .await?;
        doc.map(|d| ensure_v(d.v).map(|()| d)).transpose()
    }

    pub async fn search_releases(
        &self,
        rid: RepoId,
        q: &str,
        view: ReleaseView,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<release::Document>, SearchError> {
        let filter = release_filter(rid, view);
        let sort = ["timestamp:desc"];
        let mut query = self.releases.search();
        query
            .with_query(q)
            .with_filter(&filter)
            .with_sort(&sort)
            .with_offset(offset)
            .with_limit(limit);
        let result = self.run(query.execute::<release::Document>()).await?;
        result
            .hits
            .into_iter()
            .map(|hit| ensure_v(hit.result.v).map(|()| hit.result))
            .collect()
    }

    pub async fn get_policy(&self, rid: RepoId) -> Result<Option<SeedingPolicy>, SearchError> {
        let doc: Option<policy::Document> =
            self.get_document(&self.policies, &rid.canonical()).await?;
        doc.map(|d| ensure_v(d.v).map(|()| d.policy)).transpose()
    }

    pub async fn list_policies(&self) -> Result<Vec<SeedPolicy>, SearchError> {
        const PAGE: usize = 1000;
        let mut policies = Vec::new();
        let mut offset = 0;
        loop {
            let mut query = DocumentsQuery::new(&self.policies);
            query.with_limit(PAGE).with_offset(offset);
            let page = self
                .run(self.policies.get_documents_with::<policy::Document>(&query))
                .await?;
            let done = page.results.len() < PAGE;
            for doc in page.results {
                ensure_v(doc.v)?;
                policies.push(SeedPolicy {
                    rid: doc.rid,
                    policy: doc.policy,
                });
            }
            if done {
                break;
            }
            offset += PAGE;
        }
        Ok(policies)
    }

    pub async fn get_inventory(&self, nid: &NodeId) -> Result<Option<Vec<RepoId>>, SearchError> {
        let doc: Option<inventory::Document> =
            self.get_document(&self.inventory, &nid.to_string()).await?;
        doc.map(|d| ensure_v(d.v).map(|()| d.repos)).transpose()
    }

    pub async fn repos_by_delegate(
        &self,
        did: &Did,
        max: usize,
    ) -> Result<Vec<RepoId>, SearchError> {
        let filter = eq_filter("delegates", did);
        let attrs = ["rid"];
        let mut query = self.repos.search();
        query
            .with_filter(&filter)
            .with_limit(max)
            .with_attributes_to_retrieve(Selectors::Some(&attrs));
        let result = self.run(query.execute::<RidHit>()).await?;
        Ok(result
            .hits
            .into_iter()
            .filter_map(|hit| hit.result.rid.parse::<RepoId>().ok())
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn in_filter_quotes_each_value() {
        let values = [
            "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
            "rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE",
        ];
        assert_eq!(
            in_filter("rid", &values),
            "rid IN [\"rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp\", \"rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE\"]"
        );
    }

    #[test]
    fn in_filter_single_value() {
        assert_eq!(in_filter("nid", &["z6Mk"]), "nid IN [\"z6Mk\"]");
    }

    #[test]
    fn index_uid_joins_prefix_and_base() {
        assert_eq!(index_uid("", "repos"), "repos");
        assert_eq!(index_uid("staging-", "issues"), "staging-issues");
    }

    #[test]
    fn cob_kind_maps_to_base_names() {
        assert_eq!(CobKind::Issues.base(), "issues");
        assert_eq!(CobKind::Patches.base(), "patches");
    }

    #[test]
    fn ensure_v_accepts_current_and_rejects_others() {
        assert!(ensure_v(crate::index::SCHEMA_VERSION).is_ok());
        assert!(matches!(ensure_v(0), Err(SearchError::SchemaMismatch)));
        assert!(matches!(
            ensure_v(crate::index::SCHEMA_VERSION + 1),
            Err(SearchError::SchemaMismatch)
        ));
    }

    #[test]
    fn eq_filter_quotes_value() {
        assert_eq!(
            eq_filter("rid", "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp"),
            "rid = \"rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp\""
        );
    }

    #[test]
    fn cob_search_filter_composes_every_option() {
        use std::str::FromStr;
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let did =
            Did::from_str("did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5").unwrap();
        let rid_clause = "rid = \"rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp\"";

        assert_eq!(cob_search_filter(rid, &CobFilter::default()), rid_clause);
        assert_eq!(
            cob_search_filter(
                rid,
                &CobFilter {
                    state: Some("open"),
                    ..Default::default()
                }
            ),
            format!("{rid_clause} AND state = \"open\"")
        );
        assert_eq!(
            cob_search_filter(
                rid,
                &CobFilter {
                    author: Some(did),
                    ..Default::default()
                }
            ),
            format!("{rid_clause} AND authorDid = \"{did}\"")
        );
        assert_eq!(
            cob_search_filter(
                rid,
                &CobFilter {
                    assignee: Some(did),
                    ..Default::default()
                }
            ),
            format!("{rid_clause} AND assigneeDids = \"{did}\"")
        );
        assert_eq!(
            cob_search_filter(
                rid,
                &CobFilter {
                    label: Some("good first issue"),
                    ..Default::default()
                }
            ),
            format!("{rid_clause} AND labels = \"good first issue\"")
        );
        assert_eq!(
            cob_search_filter(
                rid,
                &CobFilter {
                    state: Some("closed"),
                    author: Some(did),
                    assignee: Some(did),
                    label: Some("bug"),
                }
            ),
            format!(
                "{rid_clause} AND state = \"closed\" AND authorDid = \"{did}\" AND assigneeDids = \"{did}\" AND labels = \"bug\""
            )
        );
    }

    #[test]
    fn release_filter_maps_every_view_combination() {
        let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let base = "rid = \"rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp\"";

        assert_eq!(
            release_filter(
                rid,
                ReleaseView {
                    all_authors: false,
                    show_redacted: false
                }
            ),
            format!("{base} AND creatorIsDelegate = true AND redacted = false")
        );
        assert_eq!(
            release_filter(
                rid,
                ReleaseView {
                    all_authors: true,
                    show_redacted: false
                }
            ),
            format!("{base} AND redacted = false")
        );
        assert_eq!(
            release_filter(
                rid,
                ReleaseView {
                    all_authors: false,
                    show_redacted: true
                }
            ),
            format!("{base} AND creatorIsDelegate = true")
        );
        assert_eq!(
            release_filter(
                rid,
                ReleaseView {
                    all_authors: true,
                    show_redacted: true
                }
            ),
            base
        );
    }
}
