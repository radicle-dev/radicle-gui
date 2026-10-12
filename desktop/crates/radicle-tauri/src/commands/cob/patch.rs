use radicle::patch::{ReviewId, TYPENAME};
use radicle::storage::{ReadRepository as _, ReadStorage};
use radicle::{git, identity};

use radicle_types as types;
use radicle_types::cobs;
use radicle_types::domain::patch::models;
use radicle_types::domain::patch::service::Service;
use radicle_types::domain::patch::traits::PatchService;
use radicle_types::error::Error;
use radicle_types::outbound::sqlite::Sqlite;
use radicle_types::traits::Profile;
use radicle_types::traits::cobs::Cobs;
use radicle_types::traits::patch::Patches;
use radicle_types::traits::patch::PatchesMut;

use crate::AppState;

#[tauri::command]
pub async fn list_patches(
    ctx: tauri::State<'_, AppState>,
    sqlite_service: tauri::State<'_, Service<Sqlite>>,
    rid: identity::RepoId,
    status: Option<types::cobs::query::PatchStatus>,
    skip: Option<usize>,
    // None: return all patches, `skip` is ignored.
    take: Option<usize>,
) -> Result<types::cobs::PaginatedQuery<Vec<models::patch::Patch>>, Error> {
    let profile = ctx.profile();
    let aliases = profile.aliases();
    let doc = profile.storage.repository(rid)?.identity_doc()?;

    Ok(sqlite_service.list_paginated(rid, status, skip, take, &doc, &aliases)?)
}

#[tauri::command]
pub fn patch_by_id(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    id: git::Oid,
) -> Result<Option<models::patch::Patch>, Error> {
    ctx.get_patch(rid, id)
}

#[tauri::command]
pub fn revisions_by_patch(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    id: git::Oid,
) -> Result<Option<Vec<models::patch::Revision>>, Error> {
    ctx.revisions_by_patch(rid, id)
}

#[tauri::command]
pub fn edit_patch(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    cob_id: git::Oid,
    action: models::patch::Action,
    opts: cobs::CobOptions,
) -> Result<models::patch::Patch, Error> {
    ctx.edit_patch(rid, cob_id, action, opts)
}

#[tauri::command]
pub fn delete_patch(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    cob_id: git::Oid,
    opts: cobs::CobOptions,
) -> Result<(), Error> {
    ctx.delete_patch(rid, cob_id, opts)
}

#[tauri::command]
pub fn create_patch_review(
    ctx: tauri::State<AppState>,
    args: models::patch::CreateReviewArgs,
) -> Result<ReviewId, Error> {
    ctx.create_patch_review(args)
}

#[tauri::command]
pub fn activity_by_patch(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    id: git::Oid,
) -> Result<Vec<types::cobs::Operation<models::patch::Action>>, Error> {
    ctx.activity_by_id(rid, &TYPENAME, id)
}

#[tauri::command]
pub async fn rebuild_patch_cache(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    on_event: tauri::ipc::Channel<cobs::CacheEvent>,
) -> Result<(), Error> {
    ctx.rebuild_patch_cache(rid, |event| on_event.send(event).map_err(Error::from))
}
