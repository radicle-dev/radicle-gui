use std::collections::HashMap;

use radicle::identity::{Did, RepoId};
use radicle::node::policy::{SeedPolicy, SeedingPolicy};
use radicle::node::{Alias, NodeId};
use radicle_search::index::{cob, node, release, repo};
use radicle_search::query::{CobKind, ReleaseView, SearchClient, SearchError, SortField};

/// The search backend httpd reads from. In production this is always the
/// Meilisearch client; tests substitute an in-memory fake so handlers can
/// be exercised without a running Meilisearch.
#[derive(Clone)]
pub(crate) enum Backend {
    Meili(Box<SearchClient>),
    #[cfg(test)]
    Fake(fake::Fake),
}

impl Backend {
    pub async fn sorted_rids(
        &self,
        sort: SortField,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RepoId>, SearchError> {
        match self {
            Self::Meili(c) => c.sorted_rids(sort, offset, limit).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.sorted_rids(sort, offset, limit)),
        }
    }

    pub async fn search_by_query(
        &self,
        query: &str,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RepoId>, SearchError> {
        match self {
            Self::Meili(c) => c.search_by_query(query, offset, limit).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.search_by_query(query, offset, limit)),
        }
    }

    pub async fn get_repo_doc(&self, rid: RepoId) -> Result<Option<repo::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.get_repo_doc(rid).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.repos.iter().find(|d| d.rid == rid).cloned()),
        }
    }

    pub async fn get_repo_docs(&self, rids: &[RepoId]) -> Result<Vec<repo::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.get_repo_docs(rids).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f
                .repos
                .iter()
                .filter(|d| rids.contains(&d.rid))
                .cloned()
                .collect()),
        }
    }

    pub async fn get_node(&self, nid: &NodeId) -> Result<Option<node::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.get_node(nid).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.nodes.iter().find(|d| d.nid == *nid).cloned()),
        }
    }

    pub async fn get_aliases(
        &self,
        nids: &[NodeId],
    ) -> Result<HashMap<NodeId, Alias>, SearchError> {
        match self {
            Self::Meili(c) => c.get_aliases(nids).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f
                .nodes
                .iter()
                .filter(|d| nids.contains(&d.nid))
                .filter_map(|d| {
                    let alias = d.alias.as_ref()?.parse::<Alias>().ok()?;
                    Some((d.nid, alias))
                })
                .collect()),
        }
    }

    pub async fn list_cobs(
        &self,
        kind: CobKind,
        rid: RepoId,
        state: Option<&str>,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<cob::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.list_cobs(kind, rid, state, offset, limit).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.list_cobs(kind, rid, state, offset, limit)),
        }
    }

    pub async fn get_cob(
        &self,
        kind: CobKind,
        rid: RepoId,
        oid: &str,
    ) -> Result<Option<cob::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.get_cob(kind, rid, oid).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f
                .cobs(kind)
                .iter()
                .find(|d| d.rid == rid && d.cob_id == oid)
                .cloned()),
        }
    }

    #[cfg_attr(not(feature = "artifacts"), allow(dead_code))]
    pub async fn list_releases(
        &self,
        rid: RepoId,
        view: ReleaseView,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<release::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.list_releases(rid, view, offset, limit).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.list_releases(rid, view, offset, limit)),
        }
    }

    #[cfg_attr(not(feature = "artifacts"), allow(dead_code))]
    pub async fn get_release(
        &self,
        rid: RepoId,
        oid: &str,
    ) -> Result<Option<release::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.get_release(rid, oid).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f
                .releases
                .iter()
                .find(|d| d.rid == rid && d.cob_id == oid)
                .cloned()),
        }
    }

    #[cfg_attr(not(feature = "artifacts"), allow(dead_code))]
    pub async fn search_releases(
        &self,
        rid: RepoId,
        q: &str,
        view: ReleaseView,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<release::Document>, SearchError> {
        match self {
            Self::Meili(c) => c.search_releases(rid, q, view, offset, limit).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.search_releases(rid, q, view, offset, limit)),
        }
    }

    pub async fn get_policy(&self, rid: RepoId) -> Result<Option<SeedingPolicy>, SearchError> {
        match self {
            Self::Meili(c) => c.get_policy(rid).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.policies.iter().find(|(r, _)| *r == rid).map(|(_, p)| *p)),
        }
    }

    pub async fn list_policies(&self) -> Result<Vec<SeedPolicy>, SearchError> {
        match self {
            Self::Meili(c) => c.list_policies().await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f
                .policies
                .iter()
                .map(|(rid, policy)| SeedPolicy {
                    rid: *rid,
                    policy: *policy,
                })
                .collect()),
        }
    }

    pub async fn get_inventory(&self, nid: &NodeId) -> Result<Option<Vec<RepoId>>, SearchError> {
        match self {
            Self::Meili(c) => c.get_inventory(nid).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.inventory.get(nid).cloned()),
        }
    }

    pub async fn repos_by_delegate(
        &self,
        did: &Did,
        max: usize,
    ) -> Result<Vec<RepoId>, SearchError> {
        match self {
            Self::Meili(c) => c.repos_by_delegate(did, max).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f
                .repos
                .iter()
                .filter(|d| d.delegates.iter().any(|del| del == did))
                .map(|d| d.rid)
                .take(max)
                .collect()),
        }
    }
}

#[cfg(test)]
pub(crate) mod fake {
    use super::*;

    /// In-memory search backend for handler tests. Fields are filled by
    /// the test fixture; lookup semantics mirror the real indexes.
    #[derive(Clone, Default)]
    pub(crate) struct Fake {
        pub repos: Vec<repo::Document>,
        pub issues: Vec<cob::Document>,
        pub patches: Vec<cob::Document>,
        pub releases: Vec<release::Document>,
        pub nodes: Vec<node::Document>,
        pub policies: Vec<(RepoId, SeedingPolicy)>,
        pub inventory: HashMap<NodeId, Vec<RepoId>>,
    }

    impl Fake {
        pub fn cobs(&self, kind: CobKind) -> &Vec<cob::Document> {
            match kind {
                CobKind::Issues => &self.issues,
                CobKind::Patches => &self.patches,
            }
        }

        pub fn sorted_rids(&self, sort: SortField, offset: usize, limit: usize) -> Vec<RepoId> {
            let mut docs: Vec<&repo::Document> = self.repos.iter().collect();
            match sort {
                SortField::HeadCommitterTime => {
                    docs.sort_by_key(|d| std::cmp::Reverse(d.activity.head_committer_time))
                }
                SortField::SeedingCount => docs.sort_by_key(|d| std::cmp::Reverse(d.seeding_count)),
                SortField::Rid => docs.sort_by_key(|d| d.rid),
            }
            docs.into_iter()
                .skip(offset)
                .take(limit)
                .map(|d| d.rid)
                .collect()
        }

        pub fn search_by_query(&self, query: &str, offset: usize, limit: usize) -> Vec<RepoId> {
            let mut docs: Vec<&repo::Document> = self
                .repos
                .iter()
                .filter(|d| query.is_empty() || d.name.contains(query))
                .collect();
            docs.sort_by_key(|d| std::cmp::Reverse(d.seeding_count));
            docs.into_iter()
                .skip(offset)
                .take(limit)
                .map(|d| d.rid)
                .collect()
        }

        pub fn list_cobs(
            &self,
            kind: CobKind,
            rid: RepoId,
            state: Option<&str>,
            offset: usize,
            limit: usize,
        ) -> Vec<cob::Document> {
            let mut docs: Vec<cob::Document> = self
                .cobs(kind)
                .iter()
                .filter(|d| d.rid == rid && state.is_none_or(|s| d.state == s))
                .cloned()
                .collect();
            docs.sort_by_key(|d| std::cmp::Reverse(d.timestamp));
            docs.into_iter().skip(offset).take(limit).collect()
        }

        fn release_in_view(doc: &release::Document, view: ReleaseView) -> bool {
            (view.all_authors || doc.creator_is_delegate) && (view.show_redacted || !doc.redacted)
        }

        fn release_text_fields(doc: &release::Document) -> Vec<String> {
            let mut fields: Vec<String> = Vec::new();
            fields.extend(doc.title.clone());
            fields.extend(doc.tag_name.clone());
            fields.push(doc.description.clone());
            fields.extend(doc.artifact_names.iter().cloned());
            fields.extend(doc.artifact_urls.iter().cloned());
            fields.extend(doc.dids.iter().map(|did| did.to_string()));
            fields
        }

        pub fn list_releases(
            &self,
            rid: RepoId,
            view: ReleaseView,
            offset: usize,
            limit: usize,
        ) -> Vec<release::Document> {
            let mut docs: Vec<release::Document> = self
                .releases
                .iter()
                .filter(|d| d.rid == rid && Self::release_in_view(d, view))
                .cloned()
                .collect();
            docs.sort_by_key(|d| std::cmp::Reverse(d.timestamp));
            docs.into_iter().skip(offset).take(limit).collect()
        }

        pub fn search_releases(
            &self,
            rid: RepoId,
            q: &str,
            view: ReleaseView,
            offset: usize,
            limit: usize,
        ) -> Vec<release::Document> {
            self.list_releases(rid, view, 0, usize::MAX)
                .into_iter()
                .filter(|d| {
                    let fields = Self::release_text_fields(d);
                    release::text_matches(q, fields.iter().map(String::as_str))
                })
                .skip(offset)
                .take(limit)
                .collect()
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::str::FromStr;

        fn doc(
            cob_id: &str,
            timestamp: i64,
            creator_is_delegate: bool,
            redacted: bool,
        ) -> release::Document {
            let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
            release::Document {
                v: radicle_search::index::SCHEMA_VERSION,
                id: radicle_search::index::cob::doc_id(rid, cob_id),
                rid,
                cob_id: cob_id.to_string(),
                timestamp,
                title: Some(format!("release {cob_id}")),
                tag_name: None,
                description: String::new(),
                artifact_names: vec![format!("bin-{cob_id}")],
                artifact_urls: vec![],
                dids: vec![],
                creator_is_delegate,
                redacted,
                cob: "{}".to_string(),
            }
        }

        #[test]
        fn fake_release_listing_applies_view_and_orders_newest_first() {
            let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
            let fake = Fake {
                releases: vec![
                    doc("aa", 1, true, false),
                    doc("bb", 3, false, false),
                    doc("cc", 2, true, true),
                ],
                ..Default::default()
            };

            let ids = |docs: Vec<release::Document>| {
                docs.into_iter().map(|d| d.cob_id).collect::<Vec<_>>()
            };
            assert_eq!(
                ids(fake.list_releases(rid, ReleaseView::default(), 0, 10)),
                vec!["aa"]
            );
            assert_eq!(
                ids(fake.list_releases(
                    rid,
                    ReleaseView {
                        all_authors: true,
                        show_redacted: false
                    },
                    0,
                    10
                )),
                vec!["bb", "aa"]
            );
            assert_eq!(
                ids(fake.list_releases(
                    rid,
                    ReleaseView {
                        all_authors: true,
                        show_redacted: true
                    },
                    0,
                    10
                )),
                vec!["bb", "cc", "aa"]
            );
            assert_eq!(
                ids(fake.list_releases(
                    rid,
                    ReleaseView {
                        all_authors: true,
                        show_redacted: true
                    },
                    1,
                    1
                )),
                vec!["cc"]
            );
        }

        #[test]
        fn fake_release_search_matches_text_fields_within_the_view() {
            let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
            let fake = Fake {
                releases: vec![doc("aa", 1, true, false), doc("bb", 2, false, false)],
                ..Default::default()
            };

            let hits = fake.search_releases(rid, "BIN-AA", ReleaseView::default(), 0, 10);
            assert_eq!(hits.len(), 1);
            assert_eq!(hits[0].cob_id, "aa");
            assert!(fake
                .search_releases(rid, "bin-bb", ReleaseView::default(), 0, 10)
                .is_empty());
        }
    }
}
