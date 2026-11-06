use radicle::git;
use radicle::identity::{Did, RepoId};
use radicle_types::actor::{ActorInfo, ActorProfile, EnrollmentPreview};
use radicle_types::cobs::CobOptions;
use radicle_types::error::Error;
use radicle_types::traits::actor::Actor;

use crate::AppState;
use crate::commands::blocking;

#[tauri::command]
pub async fn actor(ctx: tauri::State<'_, AppState>) -> Result<Option<ActorInfo>, Error> {
    blocking(ctx, move |ctx| ctx.actor()).await
}

#[tauri::command]
pub async fn create_actor(
    ctx: tauri::State<'_, AppState>,
    profile: ActorProfile,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    blocking(ctx, move |ctx| ctx.create_actor(profile, opts)).await
}

#[tauri::command]
pub async fn update_actor_profile(
    ctx: tauri::State<'_, AppState>,
    profile: ActorProfile,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    blocking(ctx, move |ctx| ctx.update_actor_profile(profile, opts)).await
}

#[tauri::command]
pub async fn join_actor(ctx: tauri::State<'_, AppState>, rid: RepoId) -> Result<String, Error> {
    blocking(ctx, move |ctx| ctx.join_actor(rid)).await
}

#[tauri::command]
pub async fn decode_enrollment(
    ctx: tauri::State<'_, AppState>,
    code: String,
) -> Result<EnrollmentPreview, Error> {
    blocking(ctx, move |ctx| ctx.decode_enrollment(code)).await
}

#[tauri::command]
pub async fn approve_enrollment(
    ctx: tauri::State<'_, AppState>,
    code: String,
    controller: bool,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    blocking(ctx, move |ctx| {
        ctx.approve_enrollment(code, controller, opts)
    })
    .await
}

#[tauri::command]
pub async fn approve_actor_revision(
    ctx: tauri::State<'_, AppState>,
    id: git::Oid,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    blocking(ctx, move |ctx| ctx.approve_actor_revision(id, opts)).await
}

#[tauri::command]
pub async fn withdraw_actor_revision(
    ctx: tauri::State<'_, AppState>,
    id: git::Oid,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    blocking(ctx, move |ctx| ctx.withdraw_actor_revision(id, opts)).await
}

#[tauri::command]
pub async fn reject_actor_revision(
    ctx: tauri::State<'_, AppState>,
    id: git::Oid,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    blocking(ctx, move |ctx| ctx.reject_actor_revision(id, opts)).await
}

#[tauri::command]
pub async fn remove_actor_key(
    ctx: tauri::State<'_, AppState>,
    did: Did,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    blocking(ctx, move |ctx| ctx.remove_actor_key(did, opts)).await
}
