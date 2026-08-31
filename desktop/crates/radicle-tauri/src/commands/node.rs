use radicle::identity::RepoId;
use radicle_types as types;
use radicle_types::error::Error;
use radicle_types::traits::node::Node;

use crate::AppState;
use crate::commands::blocking;

#[tauri::command]
pub async fn node_status(
    ctx: tauri::State<'_, AppState>,
) -> Result<types::node::NodeStatus, Error> {
    blocking(ctx, |ctx| ctx.node_status()).await
}

#[tauri::command]
pub async fn repo_sync_status(
    ctx: tauri::State<'_, AppState>,
    rid: RepoId,
) -> Result<types::node::RepoSyncStatus, Error> {
    blocking(ctx, move |ctx| ctx.repo_sync_status(rid)).await
}

#[tauri::command]
pub async fn announce_repo(ctx: tauri::State<'_, AppState>, rid: RepoId) -> Result<(), Error> {
    blocking(ctx, move |ctx| ctx.announce_repo(rid)).await
}
