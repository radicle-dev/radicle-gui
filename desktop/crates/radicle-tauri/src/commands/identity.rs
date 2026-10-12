use radicle::identity::RepoId;
use radicle_types as types;
use radicle_types::error::Error;
use radicle_types::traits::identity::Identity;

use crate::AppState;
use crate::commands::blocking;

#[tauri::command]
pub async fn identity_by_repo(
    ctx: tauri::State<'_, AppState>,
    rid: RepoId,
) -> Result<types::identity::Identity, Error> {
    blocking(ctx, move |ctx| ctx.identity_by_repo(rid)).await
}
