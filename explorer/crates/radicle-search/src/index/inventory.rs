use meilisearch_sdk::settings::Settings;
use radicle::identity::RepoId;
use radicle::node::NodeId;
use serde::{Deserialize, Serialize};

use crate::index::SCHEMA_VERSION;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub v: u32,
    pub id: String,
    pub repos: Vec<RepoId>,
}

impl Document {
    pub const PRIMARY_KEY: &str = "id";

    pub fn new(nid: NodeId, mut repos: Vec<RepoId>) -> Self {
        repos.sort();
        Self {
            v: SCHEMA_VERSION,
            id: nid.to_string(),
            repos,
        }
    }
}

pub fn settings() -> Settings {
    Settings::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn inventory_document_serializes_to_spec_shape() {
        let nid =
            radicle::node::NodeId::from_str("z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi")
                .unwrap();
        let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let doc = Document::new(nid, vec![rid]);
        assert_eq!(
            serde_json::to_value(&doc).unwrap(),
            serde_json::json!({
                "v": 1,
                "id": "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi",
                "repos": ["rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp"],
            })
        );
    }
}
