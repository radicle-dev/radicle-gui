use radicle::identity::RepoId;
use radicle_types as types;
use radicle_types::error::Error;
use radicle_types::traits::identity::{Identity, IdentityMut};

use crate::AppState;
use crate::commands::blocking;

#[tauri::command]
pub async fn identity_by_repo(
    ctx: tauri::State<'_, AppState>,
    rid: RepoId,
) -> Result<types::identity::Identity, Error> {
    blocking(ctx, move |ctx| ctx.identity_by_repo(rid)).await
}

#[tauri::command]
pub async fn update_visibility(
    ctx: tauri::State<'_, AppState>,
    rid: RepoId,
    private: bool,
    opts: types::cobs::CobOptions,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| ctx.update_visibility(rid, private, opts)).await
}
