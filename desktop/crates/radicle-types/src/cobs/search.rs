use radicle::git::Oid;
use radicle::prelude::RepoId;
use serde::Serialize;
use ts_rs::TS;

/// An issue or patch whose title or ID matched a search, across every
/// repository in the COB cache.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct SearchResult {
    #[ts(as = "String")]
    pub rid: RepoId,
    #[ts(as = "String")]
    pub id: Oid,
    pub title: String,
    pub status: String,
}
