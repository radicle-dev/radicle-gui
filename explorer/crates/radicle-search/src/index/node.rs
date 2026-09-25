use meilisearch_sdk::settings::Settings;
use radicle::node::NodeId;
use serde::{Deserialize, Serialize};

use crate::index::SCHEMA_VERSION;

pub const SEARCHABLE: &[&str] = &["alias"];
pub const FILTERABLE: &[&str] = &["nid"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub v: u32,
    pub id: String,
    pub nid: NodeId,
    pub alias: Option<String>,
    pub agent: Option<String>,
}

impl Document {
    pub const PRIMARY_KEY: &str = "id";

    pub fn new(nid: NodeId, alias: Option<String>, agent: Option<String>) -> Self {
        Self {
            v: SCHEMA_VERSION,
            id: nid.to_string(),
            nid,
            alias,
            agent,
        }
    }
}

pub fn settings() -> Settings {
    Settings::new()
        .with_searchable_attributes(SEARCHABLE)
        .with_filterable_attributes(FILTERABLE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn node_document_serializes_to_spec_shape() {
        let nid =
            radicle::node::NodeId::from_str("z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi")
                .unwrap();
        let doc = Document::new(
            nid,
            Some("seed".to_string()),
            Some("/radicle:1.2.0/".to_string()),
        );
        assert_eq!(
            serde_json::to_value(&doc).unwrap(),
            serde_json::json!({
                "v": 1,
                "id": "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi",
                "nid": "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi",
                "alias": "seed",
                "agent": "/radicle:1.2.0/",
            })
        );
    }
}
