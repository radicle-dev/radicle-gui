use base64::{Engine, prelude::BASE64_STANDARD};
use radicle::git::Oid;
use serde::Serialize;
use ts_rs::TS;

use crate::repo::Commit;
use crate::traits::repo::MAX_BLOB_SIZE;

#[derive(TS, Serialize)]
#[ts(export)]
#[ts(export_to = "source/")]
#[serde(rename_all = "camelCase")]
pub struct Blob {
    #[ts(as = "String")]
    id: Oid,
    binary: bool,
    commit: Commit,
    mime_type: String,
    content: String,
}

impl Blob {
    /// Build a blob from its raw bytes and the commit that last touched it.
    ///
    /// Resolving the last commit is the caller's responsibility so it can pick
    /// a fast strategy (e.g. the commit-graph) instead of an expensive history
    /// walk on large repositories.
    pub fn new(id: Oid, is_binary: bool, commit: Commit, content: &[u8]) -> Self {
        let mime_type = infer::get(content)
            .map(|i| i.mime_type().to_string())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        let content = match content.len() {
            s if s > MAX_BLOB_SIZE && is_binary => {
                String::from("Payload too large, content has been truncated")
            }
            _ => match std::str::from_utf8(content) {
                Ok(s) => s.to_owned(),
                Err(_) => BASE64_STANDARD.encode(content),
            },
        };

        Blob {
            id,
            binary: is_binary,
            commit,
            content,
            mime_type,
        }
    }
}
