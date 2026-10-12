use radicle::git::Oid;
use radicle_surf as surf;
use serde::Serialize;
use ts_rs::TS;

#[derive(TS, Serialize)]
#[ts(export)]
#[ts(export_to = "source/")]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    #[ts(as = "String")]
    pub id: Oid,
    #[ts(type = "{ name: string; email: string; time: number; }")]
    pub author: surf::Author,
    #[ts(type = "{ name: string; email: string; time: number; }")]
    pub committer: surf::Author,
    pub message: String,
    pub summary: String,
    #[ts(as = "Vec<String>")]
    pub parents: Vec<Oid>,
}

impl From<surf::Commit> for Commit {
    fn from(commit: surf::Commit) -> Self {
        Commit {
            id: commit.id,
            author: commit.author,
            committer: commit.committer,
            message: commit.message.to_string(),
            summary: commit.summary.to_string(),
            parents: commit.parents,
        }
    }
}
