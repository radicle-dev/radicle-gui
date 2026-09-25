use std::collections::HashMap;

use radicle::identity::{Did, RepoId};
use radicle::node::policy::{SeedPolicy, SeedingPolicy};
use radicle::node::{Alias, NodeId};
use radicle_search::index::{cob, node, release, repo};
use radicle_search::query::{
    CobFilter, CobKind, Hit, ReleaseView, SearchClient, SearchError, SortField,
};
#[cfg(test)]
use radicle_search::query::{Formatted, MARK_CLOSE, MARK_OPEN};

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

    pub async fn search_cobs(
        &self,
        kind: CobKind,
        rid: RepoId,
        q: &str,
        filter: CobFilter<'_>,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<Hit<cob::Document>>, SearchError> {
        match self {
            Self::Meili(c) => c.search_cobs(kind, rid, q, filter, offset, limit).await,
            #[cfg(test)]
            Self::Fake(f) => Ok(f.search_cobs(kind, rid, q, filter, offset, limit)),
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
    ) -> Result<Vec<Hit<release::Document>>, SearchError> {
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

        fn cob_text_fields(doc: &cob::Document) -> Vec<String> {
            let mut fields = vec![doc.title.clone(), doc.description.clone()];
            fields.extend(doc.comments.iter().cloned());
            fields.extend(doc.dids.iter().map(|did| did.to_string()));
            fields
        }

        fn mark(text: &str, q: &str) -> String {
            let needle = q.trim().to_lowercase();
            let hay = text.to_lowercase();
            if needle.is_empty() || hay.len() != text.len() {
                return text.to_string();
            }
            let mut out = String::new();
            let mut cursor = 0;
            while let Some(found) = hay[cursor..].find(&needle) {
                let start = cursor + found;
                let end = start + needle.len();
                if !text.is_char_boundary(start) || !text.is_char_boundary(end) {
                    return text.to_string();
                }
                out.push_str(&text[cursor..start]);
                out.push_str(MARK_OPEN);
                out.push_str(&text[start..end]);
                out.push_str(MARK_CLOSE);
                cursor = end;
            }
            out.push_str(&text[cursor..]);
            out
        }

        fn formatted_cob(doc: &cob::Document, q: &str) -> Option<Formatted> {
            if q.trim().is_empty() {
                return None;
            }
            let mut map = serde_json::Map::new();
            map.insert(
                "title".to_string(),
                serde_json::json!(Self::mark(&doc.title, q)),
            );
            map.insert(
                "description".to_string(),
                serde_json::json!(Self::mark(&doc.description, q)),
            );
            map.insert(
                "comments".to_string(),
                serde_json::json!(doc
                    .comments
                    .iter()
                    .map(|c| Self::mark(c, q))
                    .collect::<Vec<_>>()),
            );
            Some(Formatted::new(map))
        }

        fn formatted_release(doc: &release::Document, q: &str) -> Option<Formatted> {
            if q.trim().is_empty() {
                return None;
            }
            let mut map = serde_json::Map::new();
            if let Some(title) = doc.title.as_deref() {
                map.insert("title".to_string(), serde_json::json!(Self::mark(title, q)));
            }
            if let Some(tag) = doc.tag_name.as_deref() {
                map.insert("tagName".to_string(), serde_json::json!(Self::mark(tag, q)));
            }
            map.insert(
                "description".to_string(),
                serde_json::json!(Self::mark(&doc.description, q)),
            );
            map.insert(
                "artifactNames".to_string(),
                serde_json::json!(doc
                    .artifact_names
                    .iter()
                    .map(|n| Self::mark(n, q))
                    .collect::<Vec<_>>()),
            );
            Some(Formatted::new(map))
        }

        pub fn search_cobs(
            &self,
            kind: CobKind,
            rid: RepoId,
            q: &str,
            filter: CobFilter<'_>,
            offset: usize,
            limit: usize,
        ) -> Vec<Hit<cob::Document>> {
            self.list_cobs(kind, rid, filter.state, 0, usize::MAX)
                .into_iter()
                .filter(|d| filter.author.is_none_or(|a| d.author_did == a))
                .filter(|d| filter.assignee.is_none_or(|a| d.assignee_dids.contains(&a)))
                .filter(|d| filter.label.is_none_or(|l| d.labels.iter().any(|x| x == l)))
                .filter(|d| {
                    let fields = Self::cob_text_fields(d);
                    release::text_matches(q, fields.iter().map(String::as_str))
                })
                .skip(offset)
                .take(limit)
                .map(|doc| Hit {
                    formatted: Self::formatted_cob(&doc, q),
                    doc,
                })
                .collect()
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
        ) -> Vec<Hit<release::Document>> {
            self.list_releases(rid, view, 0, usize::MAX)
                .into_iter()
                .filter(|d| {
                    let fields = Self::release_text_fields(d);
                    release::text_matches(q, fields.iter().map(String::as_str))
                })
                .skip(offset)
                .take(limit)
                .map(|doc| Hit {
                    formatted: Self::formatted_release(&doc, q),
                    doc,
                })
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
            assert_eq!(hits[0].doc.cob_id, "aa");
            assert!(fake
                .search_releases(rid, "bin-bb", ReleaseView::default(), 0, 10)
                .is_empty());
        }

        fn cob_doc(
            cob_id: &str,
            timestamp: i64,
            state: &str,
            title: &str,
            description: &str,
            author: Did,
            assignees: Vec<Did>,
            labels: Vec<&str>,
        ) -> cob::Document {
            let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
            cob::Document {
                v: radicle_search::index::SCHEMA_VERSION,
                id: cob::doc_id(rid, cob_id),
                rid,
                cob_id: cob_id.to_string(),
                state: state.to_string(),
                timestamp,
                title: title.to_string(),
                description: description.to_string(),
                comments: vec!["follow-up comment".to_string()],
                dids: vec![],
                author_did: author,
                assignee_dids: assignees,
                labels: labels.into_iter().map(str::to_string).collect(),
                cob: "{}".to_string(),
            }
        }

        fn did(seed: u8) -> Did {
            use radicle::crypto::Signer as _;
            let key =
                radicle::crypto::SigningKey::from_seed(radicle::crypto::Seed::new([seed; 32]));
            Did::from(*key.public_key())
        }

        #[test]
        fn fake_cob_search_matches_text_within_the_state() {
            let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
            let fake = Fake {
                issues: vec![
                    cob_doc(
                        "aa",
                        1,
                        "open",
                        "Crash on start",
                        "segfault in main",
                        did(1),
                        vec![],
                        vec![],
                    ),
                    cob_doc(
                        "bb",
                        2,
                        "closed",
                        "Typo",
                        "fix the readme",
                        did(1),
                        vec![],
                        vec![],
                    ),
                ],
                ..Default::default()
            };
            let ids = |docs: Vec<Hit<cob::Document>>| {
                docs.into_iter().map(|d| d.doc.cob_id).collect::<Vec<_>>()
            };

            assert_eq!(
                ids(fake.search_cobs(
                    CobKind::Issues,
                    rid,
                    "SEGFAULT",
                    CobFilter::default(),
                    0,
                    10
                )),
                vec!["aa"]
            );
            assert_eq!(
                ids(fake.search_cobs(
                    CobKind::Issues,
                    rid,
                    "readme",
                    CobFilter {
                        state: Some("open"),
                        ..Default::default()
                    },
                    0,
                    10
                )),
                Vec::<String>::new()
            );
            assert_eq!(
                ids(fake.search_cobs(
                    CobKind::Issues,
                    rid,
                    "follow-up",
                    CobFilter::default(),
                    0,
                    10
                )),
                vec!["bb", "aa"]
            );
            assert_eq!(
                ids(fake.search_cobs(CobKind::Issues, rid, "", CobFilter::default(), 0, 10)),
                vec!["bb", "aa"]
            );
        }

        #[test]
        fn fake_cob_search_applies_author_assignee_and_label() {
            let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
            let alice = did(1);
            let bob = did(2);
            let fake = Fake {
                issues: vec![
                    cob_doc(
                        "aa",
                        1,
                        "open",
                        "Crash",
                        "segfault",
                        alice,
                        vec![bob],
                        vec!["bug"],
                    ),
                    cob_doc(
                        "bb",
                        2,
                        "open",
                        "Typo",
                        "readme",
                        bob,
                        vec![],
                        vec!["docs", "bug"],
                    ),
                ],
                ..Default::default()
            };
            let ids = |docs: Vec<Hit<cob::Document>>| {
                docs.into_iter().map(|d| d.doc.cob_id).collect::<Vec<_>>()
            };
            let by = |f: CobFilter<'_>| ids(fake.search_cobs(CobKind::Issues, rid, "", f, 0, 10));

            assert_eq!(
                by(CobFilter {
                    author: Some(alice),
                    ..Default::default()
                }),
                vec!["aa"]
            );
            assert_eq!(
                by(CobFilter {
                    assignee: Some(bob),
                    ..Default::default()
                }),
                vec!["aa"]
            );
            assert_eq!(
                by(CobFilter {
                    label: Some("bug"),
                    ..Default::default()
                }),
                vec!["bb", "aa"]
            );
            assert_eq!(
                by(CobFilter {
                    label: Some("docs"),
                    author: Some(alice),
                    ..Default::default()
                }),
                Vec::<String>::new()
            );
            assert_eq!(
                ids(fake.search_cobs(
                    CobKind::Issues,
                    rid,
                    "readme",
                    CobFilter {
                        label: Some("bug"),
                        ..Default::default()
                    },
                    0,
                    10
                )),
                vec!["bb"]
            );
        }

        #[test]
        fn fake_search_marks_matches_in_the_formatted_payload() {
            let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
            let fake = Fake {
                issues: vec![cob_doc(
                    "aa",
                    1,
                    "open",
                    "Crash on start",
                    "segfault in main",
                    did(1),
                    vec![],
                    vec!["bug"],
                )],
                ..Default::default()
            };

            let hits = fake.search_cobs(CobKind::Issues, rid, "CRASH", CobFilter::default(), 0, 10);
            assert_eq!(hits.len(), 1);
            let formatted = hits[0].formatted.as_ref().expect("formatted");
            assert_eq!(
                formatted.text("title"),
                Some("\u{E000}Crash\u{E001} on start")
            );
            assert_eq!(formatted.text("description"), Some("segfault in main"));

            let listed = fake.search_cobs(CobKind::Issues, rid, "", CobFilter::default(), 0, 10);
            assert!(listed[0].formatted.is_none());
        }

        #[test]
        fn fake_mark_never_slices_inside_a_character() {
            let tricky = "\u{212A}\u{0130}\u{0130}";
            assert_eq!(Fake::mark(tricky, "i"), tricky);
            assert_eq!(Fake::mark("İstanbul", "stan"), "İstanbul");
            assert_eq!(
                Fake::mark("Crash on start", "on"),
                format!("Crash {MARK_OPEN}on{MARK_CLOSE} start")
            );
        }
    }
}
