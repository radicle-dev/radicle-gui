use radicle::git;
use radicle::identity::RepoId;
use radicle_types::cobs::job;
use radicle_types::error::Error;
use radicle_types::traits::job::Jobs;

use crate::AppState;
use crate::commands::blocking;

#[tauri::command]
pub async fn list_jobs(
    ctx: tauri::State<'_, AppState>,
    rid: RepoId,
    sha: git::Oid,
) -> Result<Vec<job::Job>, Error> {
    blocking(ctx, move |ctx| ctx.list_jobs(rid, sha)).await
}
