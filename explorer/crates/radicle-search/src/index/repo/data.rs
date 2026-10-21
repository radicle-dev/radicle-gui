use std::fmt;

use radicle::{
    git,
    identity::doc,
    prelude::{Doc, RepoId},
};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de};

/// The primary key for the index backend.
///
/// It is derived from a [`RepoId`], and renders to the RID without the `rad:`
/// prefix. This is due to document IDs only allowing characters in the set
/// `[a-zA-Z0-9_-]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DocumentKey(RepoId);

impl fmt::Display for DocumentKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0.canonical())
    }
}

impl DocumentKey {
    pub fn new(rid: RepoId) -> Self {
        Self(rid)
    }
}

/// Serialize using the prefix-less canonical form so the value is a valid
/// Meilisearch document id. The derived impl would forward to [`RepoId`]'s,
/// which emits the `rad:` prefix and is rejected by Meilisearch.
impl Serialize for DocumentKey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_str(&self.0.canonical())
    }
}

impl<'de> Deserialize<'de> for DocumentKey {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        RepoId::from_canonical(&s)
            .map(Self)
            .map_err(de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: DocumentKey,
    pub rid: RepoId,
    pub name: String,
    pub description: String,
    pub default_branch: git::fmt::RefString,
    pub delegates: doc::Delegates,
    pub seeding_count: u64,
    #[serde(flatten)]
    pub activity: Activity,
}

impl Document {
    pub(crate) const PRIMARY_KEY: &str = "id";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub head: Option<git::Oid>,
    pub head_committer_time: Option<i64>,
    pub activity_timestamps: Vec<i64>,
}

impl Activity {
    pub fn empty() -> Self {
        Self {
            head: None,
            head_committer_time: None,
            activity_timestamps: Vec::new(),
        }
    }
}

impl Document {
    /// Construct a new [`RepoDocument`] for the given [`RepoId`], [`Doc`],
    /// [`Activity`], and seeding count.
    ///
    /// If the [`Doc::visibility`] is not public or the [`Doc::project`] fails
    /// to resolve, then `None` is returned.
    pub(crate) fn new(
        rid: RepoId,
        doc: &Doc,
        activity: Activity,
        seeding_count: u64,
    ) -> Option<Self> {
        if !doc.visibility().is_public() {
            return None;
        }

        let project = match doc.project() {
            Ok(p) => p,
            Err(e) => {
                tracing::debug!("{rid}: no project payload ({e})");
                return None;
            }
        };

        Some(Self {
            id: DocumentKey::new(rid),
            rid,
            name: project.name().to_string(),
            description: project.description().to_string(),
            default_branch: project.default_branch().clone(),
            delegates: doc.delegates().clone(),
            seeding_count,
            activity,
        })
    }
}
