use std::collections::{BTreeMap, BTreeSet};

use radicle_surf as surf;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use radicle::node::Alias;
use radicle::{git, identity, issue, node, patch};

use crate::cobs::Author;
use crate::error;

#[derive(Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct TreePath {
    pub revision: String,
    pub path: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct RepoSummary {
    #[ts(as = "String")]
    pub rid: identity::RepoId,
    pub name: String,
    pub private: bool,
    /// False for a repository that is in storage but not seeded, which
    /// `rad ls --all` shows as "local".
    pub seeding: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct RepoCount {
    pub total: usize,
    pub contributor: usize,
    pub delegate: usize,
    pub private: usize,
    pub seeding: usize,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct RepoInfo {
    pub payloads: SupportedPayloads,
    pub delegates: Vec<Author>,
    pub threshold: usize,
    pub visibility: Visibility,
    #[ts(as = "String")]
    pub rid: identity::RepoId,
    /// How many nodes on the network are known to seed this repository.
    pub seeding: usize,
    /// Whether the local node seeds this repository. When false the repository
    /// is only in local storage, which `rad ls --all` shows as "local".
    pub seeded: bool,
    #[ts(type = "number")]
    pub last_commit_timestamp: i64,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Readme {
    #[ts(as = "String")]
    pub id: surf::Oid,
    pub binary: bool,
    pub commit: Commit,
    pub mime_type: String,
    pub content: String,
    pub path: String,
}

#[derive(Default, Serialize, TS)]
#[serde(rename_all = "camelCase", tag = "type")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub enum Visibility {
    /// Anyone and everyone.
    #[default]
    Public,
    /// Delegates plus the allowed DIDs.
    Private {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[ts(as = "Option<Vec<Author>>", optional)]
        allow: Vec<Author>,
    },
}

impl Visibility {
    pub fn new(visibility: &identity::Visibility, aliases: &impl node::AliasStore) -> Self {
        match visibility {
            identity::Visibility::Public => Self::Public,
            identity::Visibility::Private { allow } => Self::Private {
                allow: allow.iter().map(|did| Author::new(did, aliases)).collect(),
            },
        }
    }
}

impl From<Visibility> for identity::Visibility {
    fn from(value: Visibility) -> Self {
        match value {
            Visibility::Private { allow } => {
                let did_set = allow
                    .iter()
                    .map(|author| *author.did())
                    .collect::<BTreeSet<identity::Did>>();
                Self::Private { allow: did_set }
            }
            Visibility::Public => Self::Public,
        }
    }
}

#[derive(Serialize, TS)]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct SupportedPayloads {
    #[serde(rename = "xyz.radicle.project")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project: Option<ProjectPayload>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct ProjectPayload {
    data: ProjectPayloadData,
    meta: ProjectPayloadMeta,
}

impl ProjectPayload {
    pub fn new(data: ProjectPayloadData, meta: ProjectPayloadMeta) -> Self {
        Self { data, meta }
    }

    pub fn name(&self) -> &str {
        &self.data.name
    }
}

impl TryFrom<identity::doc::Payload> for ProjectPayloadData {
    type Error = error::Error;

    fn try_from(value: identity::doc::Payload) -> Result<Self, Self::Error> {
        serde_json::from_value::<Self>((*value).clone()).map_err(Into::into)
    }
}

#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct ProjectPayloadData {
    pub default_branch: String,
    pub description: String,
    pub name: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct ProjectPayloadMeta {
    #[ts(as = "String")]
    pub head: git::Oid,
    #[ts(type = "{ open: number, closed: number }")]
    pub issues: issue::IssueCounts,
    #[ts(type = "{ open: number, draft: number, archived: number, merged: number }")]
    pub patches: patch::PatchCounts,
}

#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Commit {
    #[ts(as = "String")]
    pub id: git::Oid,
    #[ts(type = "{ name: string; email: string; time: number; }")]
    pub author: surf::Author,
    #[ts(type = "{ name: string; email: string; time: number; }")]
    pub committer: surf::Author,
    pub message: String,
    pub summary: String,
    #[ts(as = "Vec<String>")]
    pub parents: Vec<git::Oid>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Tagger {
    pub name: String,
    pub email: String,
    /// Tagger time. Seconds since epoch.
    #[ts(type = "number")]
    pub timestamp: i64,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Tag {
    #[ts(as = "String")]
    pub oid: git::Oid,
    /// Oid of the annotated tag object itself, as opposed to the commit it
    /// peels to. Absent for lightweight tags. A release records this so it can
    /// resolve its own title and tag name.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub tag_oid: Option<git::Oid>,
    /// Tagger time for annotated tags, otherwise the commit time of the
    /// tagged commit. Seconds since epoch.
    #[ts(type = "number")]
    pub timestamp: i64,
    /// Tagger of an annotated tag. Absent for lightweight tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tagger: Option<Tagger>,
    /// Message of an annotated tag. Absent for lightweight tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub message: Option<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Remote {
    #[ts(as = "String")]
    pub id: node::NodeId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub alias: Option<Alias>,
    pub delegate: bool,
    #[ts(as = "BTreeMap<String, String>")]
    pub branches: BTreeMap<String, git::Oid>,
    pub tags: BTreeMap<String, Tag>,
}

#[derive(Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Canonical {
    #[ts(as = "BTreeMap<String, String>")]
    pub branches: BTreeMap<String, git::Oid>,
    pub tags: BTreeMap<String, Tag>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct RepoRefs {
    pub canonical: Canonical,
    pub remotes: Vec<Remote>,
}

impl From<surf::Commit> for Commit {
    fn from(value: surf::Commit) -> Self {
        Self {
            id: value.id,
            author: value.author,
            committer: value.committer,
            message: value.message,
            summary: value.summary,
            parents: value.parents,
        }
    }
}
