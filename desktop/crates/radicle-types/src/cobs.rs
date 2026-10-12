use radicle::git::Oid;
use radicle::prelude::RepoId;
use radicle::profile::Aliases;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use radicle::cob;
use radicle::identity;
use radicle::node::{Alias, AliasStore};

pub mod diff;
pub mod issue;
pub mod job;
pub mod release;
pub mod repo;
pub mod stream;
pub mod thread;

#[derive(ts_rs::TS, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
#[ts(export)]
#[ts(export_to = "cob/")]
pub enum CacheEvent {
    Started {
        #[ts(as = "String")]
        rid: RepoId,
    },
    Progress {
        #[ts(as = "String")]
        rid: RepoId,
        #[ts(as = "String")]
        oid: Oid,
        current: usize,
        total: usize,
    },
    Finished {
        #[ts(as = "String")]
        rid: RepoId,
    },
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct AliasSuggestion {
    #[ts(as = "String")]
    pub did: identity::Did,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub alias: Option<Alias>,
    pub followed: bool,
    #[serde(rename = "isSelf")]
    pub is_self: bool,
}

#[derive(Debug, Clone, Serialize, TS, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct Author {
    #[ts(as = "String")]
    did: identity::Did,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    alias: Option<Alias>,
}

impl Author {
    pub fn new(did: &identity::Did, aliases: &impl AliasStore) -> Self {
        Self {
            did: *did,
            alias: aliases.alias(did),
        }
    }

    pub fn did(&self) -> &identity::Did {
        &self.did
    }

    pub fn alias(&self) -> Option<&Alias> {
        self.alias.as_ref()
    }
}

pub trait FromRadicleAction<A> {
    fn from_radicle_action(value: A, aliases: &Aliases) -> Self;
}

/// Everything that can be done in the system is represented by an `Op`.
/// Operations are applied to an accumulator to yield a final state.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct Operation<A> {
    #[ts(as = "String")]
    pub id: cob::EntryId,
    pub actions: Vec<A>,
    pub author: Author,
    #[ts(type = "number")]
    pub timestamp: cob::Timestamp,
}

pub struct EmbedWithMimeType {
    pub content: Vec<u8>,
    pub mime_type: Option<String>,
}

impl EmbedWithMimeType {
    pub fn into_bytes(self) -> Vec<u8> {
        let mime_type = self.mime_type.unwrap_or_default();
        let mut bytes = Vec::with_capacity(mime_type.len() + 1 + self.content.len());
        bytes.extend_from_slice(mime_type.as_bytes());
        bytes.push(0);
        bytes.extend_from_slice(&self.content);
        bytes
    }
}

pub fn split_embed_upload(body: &[u8]) -> Option<(&str, &[u8])> {
    let end = body.iter().position(|&byte| byte == 0)?;
    let name = std::str::from_utf8(&body[..end]).ok()?;

    Some((name, &body[end + 1..]))
}

#[derive(TS, Serialize)]
#[doc = "A type alias for the TS type `never`."]
#[ts(export)]
#[ts(export_to = "cob/")]
pub enum Never {}

#[derive(TS, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct CobOptions {
    #[ts(as = "Option<bool>")]
    #[ts(optional)]
    announce: Option<bool>,
}

impl CobOptions {
    pub fn announce(&self) -> bool {
        self.announce.unwrap_or(true)
    }
}

#[derive(Serialize, Deserialize, TS, Debug, PartialEq, Clone)]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct PaginatedQuery<T> {
    pub cursor: usize,
    pub more: bool,
    pub content: T,
}

pub mod query {
    use serde::{Deserialize, Serialize};

    use radicle::issue;
    use radicle::patch;

    #[derive(Default, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub enum IssueStatus {
        Closed,
        #[default]
        Open,
        All,
    }

    impl IssueStatus {
        pub fn matches(&self, issue: &issue::State) -> bool {
            match self {
                Self::Open => matches!(issue, issue::State::Open),
                Self::Closed => matches!(issue, issue::State::Closed { .. }),
                Self::All => true,
            }
        }
    }

    #[derive(Default, Serialize, Deserialize, Clone)]
    #[serde(rename_all = "camelCase")]
    pub enum PatchStatus {
        #[default]
        Open,
        Draft,
        Archived,
        Merged,
    }

    impl From<patch::Status> for PatchStatus {
        fn from(value: patch::Status) -> Self {
            match value {
                patch::Status::Archived => Self::Archived,
                patch::Status::Draft => Self::Draft,
                patch::Status::Merged => Self::Merged,
                patch::Status::Open => Self::Open,
            }
        }
    }
    impl From<PatchStatus> for patch::Status {
        fn from(value: PatchStatus) -> Self {
            match value {
                PatchStatus::Archived => Self::Archived,
                PatchStatus::Draft => Self::Draft,
                PatchStatus::Merged => Self::Merged,
                PatchStatus::Open => Self::Open,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embed_into_bytes() {
        let embed = EmbedWithMimeType {
            content: vec![1, 0, 2],
            mime_type: Some("image/png".to_string()),
        };
        assert_eq!(embed.into_bytes(), b"image/png\0\x01\0\x02");

        let embed = EmbedWithMimeType {
            content: vec![1],
            mime_type: None,
        };
        assert_eq!(embed.into_bytes(), b"\0\x01");
    }

    #[test]
    fn split_embed_upload_at_first_nul() {
        let body = "a\u{202f}b.png\0"
            .bytes()
            .chain([1, 0, 2])
            .collect::<Vec<_>>();
        assert_eq!(
            split_embed_upload(&body),
            Some(("a\u{202f}b.png", &[1, 0, 2][..]))
        );
        assert_eq!(split_embed_upload(b"name\0"), Some(("name", &[][..])));
    }

    #[test]
    fn split_embed_upload_rejects_malformed_bodies() {
        assert_eq!(split_embed_upload(b"no separator"), None);
        assert_eq!(split_embed_upload(b"\xff\0content"), None);
    }
}
