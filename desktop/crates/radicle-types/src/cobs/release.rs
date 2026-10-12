use std::collections::{BTreeMap, BTreeSet};

use radicle::cob;
use radicle::git;
use radicle::identity::Did;
use radicle::node::AliasStore;
use radicle::storage::git::Repository;
use serde::Serialize;
use ts_rs::TS;

use radicle_artifact::display::{CommitTitle, TagName};
use radicle_artifact_core::cid::{ArtifactKind, artifact_kind};

use crate::cobs;

/// A locally computed content id and size for a file or directory staged for
/// release, before it is registered on the COB.
#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub struct ArtifactDigest {
    pub cid: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
    /// Files this covers: 1 for a file, the walked count for a directory. Lets
    /// the app say what a directory is about to publish before it publishes it.
    #[ts(type = "number")]
    pub file_count: u64,
    /// Whether the path is a directory, which is registered as a single
    /// artifact named after the folder.
    pub directory: bool,
}

/// A place an artifact can be fetched from, contributed by a single node.
#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub struct Location {
    pub user: cobs::Author,
    pub url: String,
}

/// A node flagging an artifact, with the reason it gave.
#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub struct Redaction {
    pub user: cobs::Author,
    pub reason: String,
}

/// A single file published as part of a release, addressed by its content id.
#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub struct Artifact {
    pub cid: String,
    pub name: String,
    /// Whether the content is a folder rather than a single file.
    pub directory: bool,
    pub author: cobs::Author,
    /// Flattened across contributors: one entry per node/url pair.
    pub locations: Vec<Location>,
    pub attestations: Vec<cobs::Author>,
    pub redactions: Vec<Redaction>,
    /// Whether its author or a delegate redacted it, which hides it by default.
    pub redacted: bool,
    #[ts(type = "Record<string, unknown>")]
    pub metadata: BTreeMap<String, serde_json::Value>,
}

impl Artifact {
    pub fn new(
        cid: &radicle_artifact::Cid,
        artifact: &radicle_artifact::Artifact,
        delegates: &BTreeSet<Did>,
        aliases: &impl AliasStore,
    ) -> Self {
        Self {
            cid: cid.to_string(),
            name: artifact.name().to_string(),
            directory: matches!(artifact_kind(cid), Ok(ArtifactKind::Collection)),
            author: cobs::Author::new(artifact.author(), aliases),
            locations: artifact
                .locations()
                .iter()
                .flat_map(|(did, urls)| {
                    urls.iter().map(move |url| Location {
                        user: cobs::Author::new(did, aliases),
                        url: url.to_string(),
                    })
                })
                .collect(),
            attestations: artifact
                .attestations()
                .iter()
                .map(|did| cobs::Author::new(did, aliases))
                .collect(),
            redactions: artifact
                .redactions()
                .iter()
                .map(|(did, reason)| Redaction {
                    user: cobs::Author::new(did, aliases),
                    reason: reason.clone(),
                })
                .collect(),
            redacted: artifact.is_redacted_by_trusted(delegates),
            metadata: artifact.trusted_metadata(delegates),
        }
    }
}

/// Release counts bucketed by creator trust and artifact redaction. A redacted
/// release has every artifact redacted by a trusted party. A release with no
/// artifacts is not redacted.
#[derive(Clone, Copy, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub struct ReleaseCounts {
    #[ts(type = "number")]
    pub delegate: usize,
    #[ts(type = "number")]
    pub delegate_redacted: usize,
    #[ts(type = "number")]
    pub other: usize,
    #[ts(type = "number")]
    pub other_redacted: usize,
}

impl From<radicle_artifact::ReleaseCounts> for ReleaseCounts {
    fn from(counts: radicle_artifact::ReleaseCounts) -> Self {
        Self {
            delegate: counts.delegate,
            delegate_redacted: counts.delegate_redacted,
            other: counts.other,
            other_redacted: counts.other_redacted,
        }
    }
}

/// The two disjoint author scopes of the release view. No local user is
/// trusted, so trusted means delegates.
#[derive(Clone, Copy, Default, Serialize, serde::Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub enum ReleaseScope {
    #[default]
    Trusted,
    Untrusted,
}

/// Which side of the release view the caller asks for.
#[derive(Clone, Copy, Default, Serialize, serde::Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub struct ReleaseFilter {
    /// Show releases and artifacts by delegates, or by everyone else.
    pub scope: ReleaseScope,
    /// Include artifacts redacted by their author or a delegate.
    pub show_redacted: bool,
}

/// A release, keyed by a commit and optionally an annotated tag. The COB has
/// no title of its own: `title` and `tagName` are resolved from the tag or
/// commit message, and are absent when they cannot be read.
#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/release/")]
pub struct Release {
    #[ts(as = "String")]
    pub id: git::Oid,
    #[ts(as = "String")]
    pub oid: git::Oid,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub tag: Option<git::Oid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tag_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub title: Option<String>,
    #[ts(type = "number")]
    pub created_at: cob::Timestamp,
    pub creator: cobs::Author,
    pub artifacts: Vec<Artifact>,
}

impl Release {
    /// Build a release from its COB, with `artifacts` already narrowed to the
    /// ones visible under the caller's filter.
    pub fn new(
        id: radicle_artifact::ReleaseId,
        release: &radicle_artifact::Release,
        repo: &Repository,
        aliases: &impl AliasStore,
        artifacts: Vec<Artifact>,
    ) -> Self {
        let title = release
            .tag()
            .and_then(|tag| repo.title(tag))
            .or_else(|| repo.title(release.oid()));
        let tag_name = release.tag().and_then(|tag| repo.tag_name(tag));

        Self {
            id: id.oid(),
            oid: *release.oid(),
            tag: release.tag().copied(),
            tag_name,
            title,
            created_at: release.timestamp(),
            creator: cobs::Author::new(release.creator(), aliases),
            artifacts,
        }
    }
}
