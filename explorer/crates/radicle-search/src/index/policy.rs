use meilisearch_sdk::settings::Settings;
use radicle::identity::RepoId;
use radicle::node::policy::{SeedPolicy, SeedingPolicy};
use serde::{Deserialize, Serialize};

use crate::index::SCHEMA_VERSION;
use crate::index::repo::DocumentKey;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub v: u32,
    pub id: DocumentKey,
    pub rid: RepoId,
    #[serde(flatten)]
    pub policy: SeedingPolicy,
}

impl Document {
    pub const PRIMARY_KEY: &str = "id";

    pub fn new(policy: SeedPolicy) -> Self {
        Self {
            v: SCHEMA_VERSION,
            id: DocumentKey::new(policy.rid),
            rid: policy.rid,
            policy: policy.policy,
        }
    }
}

pub fn settings() -> Settings {
    Settings::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use radicle::node::policy::{Scope, SeedPolicy, SeedingPolicy};
    use std::str::FromStr;

    fn rid() -> radicle::identity::RepoId {
        radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap()
    }

    #[test]
    fn allow_policy_document_serializes_flat() {
        let doc = Document::new(SeedPolicy {
            rid: rid(),
            policy: SeedingPolicy::Allow { scope: Scope::All },
        });
        assert_eq!(
            serde_json::to_value(&doc).unwrap(),
            serde_json::json!({
                "v": 1,
                "id": "z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "policy": "allow",
                "scope": "all",
            })
        );
    }

    #[test]
    fn block_policy_document_serializes_flat() {
        let doc = Document::new(SeedPolicy {
            rid: rid(),
            policy: SeedingPolicy::Block,
        });
        assert_eq!(
            serde_json::to_value(&doc).unwrap(),
            serde_json::json!({
                "v": 1,
                "id": "z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "policy": "block",
            })
        );
    }

    #[test]
    fn allow_policy_document_deserializes_from_flat_json() {
        let doc: Document = serde_json::from_value(serde_json::json!({
            "v": 1,
            "id": "z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
            "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
            "policy": "allow",
            "scope": "all",
        }))
        .unwrap();

        assert_eq!(doc.v, 1);
        assert_eq!(doc.rid, rid());
        assert_eq!(doc.id, DocumentKey::new(rid()));
        assert!(matches!(
            doc.policy,
            SeedingPolicy::Allow { scope: Scope::All }
        ));
    }
}
