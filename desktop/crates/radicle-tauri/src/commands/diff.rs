use radicle::git;
use radicle::identity;
use radicle_types as types;
use radicle_types::error::Error;
use radicle_types::traits::repo::Repo;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

#[tauri::command]
pub async fn get_diff(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    options: radicle_types::cobs::diff::DiffOptions,
) -> Result<types::diff::Diff, Error> {
    ctx.get_diff(rid, options)
}

#[tauri::command]
pub async fn get_diff_text(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    base: Option<git::Oid>,
    head: git::Oid,
    unified: Option<u32>,
    path: Option<String>,
) -> Result<String, Error> {
    ctx.get_diff_text(rid, base, head, unified, path)
}

#[tauri::command]
pub async fn save_diff_to_disk(
    app_handle: tauri::AppHandle,
    name: String,
    content: String,
) -> Result<(), Error> {
    let Some(path) = app_handle
        .dialog()
        .file()
        .set_file_name(name)
        .blocking_save_file()
    else {
        // User cancelled the save dialog.
        return Ok(());
    };
    let path = path.into_path()?;
    std::fs::write(path, content)?;

    Ok(())
}
