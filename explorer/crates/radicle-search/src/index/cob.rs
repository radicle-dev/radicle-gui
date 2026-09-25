use meilisearch_sdk::settings::{PaginationSetting, Settings};
use radicle::identity::{Did, RepoId};
use serde::{Deserialize, Serialize};

pub const SEARCHABLE: &[&str] = &["title", "description", "comments", "dids"];
pub const FILTERABLE: &[&str] = &[
    "rid",
    "state",
    "dids",
    "authorDid",
    "assigneeDids",
    "labels",
];
pub const SORTABLE: &[&str] = &["timestamp"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub v: u32,
    pub id: String,
    pub rid: RepoId,
    pub cob_id: String,
    pub state: String,
    pub timestamp: i64,
    pub title: String,
    pub description: String,
    pub comments: Vec<String>,
    pub dids: Vec<Did>,
    pub author_did: Did,
    pub assignee_dids: Vec<Did>,
    pub labels: Vec<String>,
    pub cob: String,
}

impl Document {
    pub const PRIMARY_KEY: &str = "id";
}

pub fn doc_id(rid: RepoId, oid: impl std::fmt::Display) -> String {
    format!("{}_{oid}", rid.canonical())
}

pub fn parse_doc_rid(id: &str) -> Option<RepoId> {
    let (rid, _oid) = id.split_once('_')?;
    RepoId::from_canonical(rid).ok()
}

pub fn settings() -> Settings {
    Settings::new()
        .with_searchable_attributes(SEARCHABLE)
        .with_filterable_attributes(FILTERABLE)
        .with_sortable_attributes(SORTABLE)
        .with_pagination(PaginationSetting {
            max_total_hits: super::MAX_TOTAL_HITS,
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::str::FromStr;

    #[test]
    fn doc_id_joins_rid_and_oid_with_underscore() {
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let id = doc_id(rid, "e8c676b9e3b42308dc9d218b70faa5408f8e58ca");
        assert_eq!(
            id,
            "z4FucBZHZMCsxTyQE1dfE2YR59Qbp_e8c676b9e3b42308dc9d218b70faa5408f8e58ca"
        );
    }

    #[test]
    fn parse_doc_rid_roundtrips() {
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let id = doc_id(rid, "e8c676b9e3b42308dc9d218b70faa5408f8e58ca");
        assert_eq!(parse_doc_rid(&id), Some(rid));
    }

    #[test]
    fn parse_doc_rid_rejects_garbage() {
        assert_eq!(parse_doc_rid("no-underscore"), None);
        assert_eq!(parse_doc_rid("notarid_deadbeef"), None);
    }

    #[test]
    fn document_serializes_cob_id_as_camel_case() {
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let doc = Document {
            v: crate::index::SCHEMA_VERSION,
            id: "z4FucBZHZMCsxTyQE1dfE2YR59Qbp_deadbeef".to_string(),
            rid,
            cob_id: "deadbeef".to_string(),
            state: "open".to_string(),
            timestamp: 1,
            title: "t".to_string(),
            description: "d".to_string(),
            comments: vec![],
            dids: vec![],
            author_did: radicle::identity::Did::from_str(
                "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5",
            )
            .unwrap(),
            assignee_dids: vec![],
            labels: vec!["bug".to_string()],
            cob: serde_json::json!({"marker": true}).to_string(),
        };

        assert_eq!(
            serde_json::to_value(&doc).unwrap(),
            serde_json::json!({
                "v": crate::index::SCHEMA_VERSION,
                "id": "z4FucBZHZMCsxTyQE1dfE2YR59Qbp_deadbeef",
                "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "cobId": "deadbeef",
                "state": "open",
                "timestamp": 1,
                "title": "t",
                "description": "d",
                "comments": [],
                "dids": [],
                "authorDid": "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5",
                "assigneeDids": [],
                "labels": ["bug"],
                "cob": "{\"marker\":true}",
            })
        );
    }

    fn document_with_cob(cob: serde_json::Value) -> Document {
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();

        Document {
            v: crate::index::SCHEMA_VERSION,
            id: doc_id(rid, "deadbeef"),
            rid,
            cob_id: "deadbeef".to_string(),
            state: "open".to_string(),
            timestamp: 1,
            title: "t".to_string(),
            description: "d".to_string(),
            comments: vec![],
            dids: vec![],
            author_did: radicle::identity::Did::from_str(
                "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5",
            )
            .unwrap(),
            assignee_dids: vec![
                radicle::identity::Did::from_str(
                    "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5",
                )
                .unwrap(),
            ],
            labels: vec!["bug".to_string(), "ui".to_string()],
            cob: cob.to_string(),
        }
    }

    fn field_paths(doc: &Document) -> BTreeSet<String> {
        fn walk(value: &serde_json::Value, prefix: &str, paths: &mut BTreeSet<String>) {
            match value {
                serde_json::Value::Object(fields) => {
                    for (name, value) in fields {
                        let path = if prefix.is_empty() {
                            name.clone()
                        } else {
                            format!("{prefix}.{name}")
                        };
                        paths.insert(path.clone());
                        walk(value, &path, paths);
                    }
                }
                serde_json::Value::Array(items) => {
                    for item in items {
                        walk(item, prefix, paths);
                    }
                }
                _ => {}
            }
        }

        let mut paths = BTreeSet::new();
        walk(&serde_json::to_value(doc).unwrap(), "", &mut paths);
        paths
    }

    #[test]
    fn field_paths_are_the_same_whatever_the_cob_payload() {
        let one = document_with_cob(serde_json::json!({
            "revisions": {"1ce41ab": {"discussion": {"comments": {"9f0e3ba": {"body": "x"}}}}}
        }));
        let other = document_with_cob(serde_json::json!({
            "revisions": {"7b25dcf": {"discussion": {"comments": {"c48a71d": {"body": "y"}}}}}
        }));

        assert_eq!(field_paths(&one), field_paths(&other));

        let paths = field_paths(&one);
        for key in ["authorDid", "assigneeDids", "labels"] {
            assert!(paths.contains(key), "{key} missing from {paths:?}");
        }
        assert_eq!(paths.len(), 14);
    }
}
