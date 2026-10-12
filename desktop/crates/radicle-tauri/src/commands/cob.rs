use std::path::PathBuf;

use radicle::git;
use radicle::identity;
use radicle_types as types;
use radicle_types::error::Error;
use radicle_types::traits::thread::Thread;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

pub mod issue;
pub mod job;
pub mod patch;
pub mod release;

#[tauri::command]
pub async fn get_embed(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    name: Option<String>,
    oid: git::Oid,
) -> Result<tauri::ipc::Response, Error> {
    let embed = ctx.get_embed(rid, name, oid)?;

    Ok(tauri::ipc::Response::new(embed.into_bytes()))
}

#[tauri::command]
pub async fn save_embed_by_path(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    path: PathBuf,
) -> Result<git::Oid, Error> {
    ctx.save_embed_by_path(rid, path)
}

#[tauri::command]
pub async fn save_embed_by_bytes(
    ctx: tauri::State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> Result<git::Oid, Error> {
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err(Error::SaveEmbedError);
    };
    let rid = request
        .headers()
        .get("rid")
        .and_then(|rid| rid.to_str().ok())
        .and_then(|rid| rid.parse().ok())
        .ok_or(Error::SaveEmbedError)?;
    let (name, bytes) = types::cobs::split_embed_upload(body).ok_or(Error::SaveEmbedError)?;

    ctx.save_embed_by_bytes(rid, name, bytes)
}

#[tauri::command]
pub async fn save_embed_to_disk(
    app_handle: tauri::AppHandle,
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    oid: git::Oid,
    name: String,
) -> Result<(), Error> {
    let Some(path) = app_handle
        .dialog()
        .file()
        .set_file_name(name)
        .blocking_save_file()
    else {
        return Err(Error::SaveEmbedError);
    };
    let path = path.into_path()?;

    ctx.save_embed_to_disk(rid, oid, path)
}
