use radicle::git;
use radicle::identity;

use radicle_types as types;
use radicle_types::error::Error;
use radicle_types::traits::artifact_node::ArtifactNode;
use radicle_types::traits::release::{ReleaseFilter, Releases};
use radicle_types::traits::release_mut::ReleasesMut;

use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;
use crate::commands::blocking;

#[tauri::command]
pub(crate) async fn list_releases(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    filter: Option<ReleaseFilter>,
    skip: Option<usize>,
    // None: return all releases, `skip` is ignored.
    take: Option<usize>,
) -> Result<types::cobs::PaginatedQuery<Vec<types::cobs::release::Release>>, Error> {
    blocking(ctx, move |ctx| ctx.list_releases(rid, filter, skip, take)).await
}

#[tauri::command]
pub(crate) async fn release_by_id(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    id: git::Oid,
) -> Result<Option<types::cobs::release::Release>, Error> {
    blocking(ctx, move |ctx| ctx.release_by_id(rid, id)).await
}

#[tauri::command]
pub(crate) async fn release_counts(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
) -> Result<types::cobs::release::ReleaseCounts, Error> {
    blocking(ctx, move |ctx| ctx.release_counts(rid)).await
}

#[tauri::command]
pub async fn compute_artifact_cid(
    ctx: tauri::State<'_, AppState>,
    path: std::path::PathBuf,
) -> Result<types::cobs::release::ArtifactDigest, Error> {
    blocking(ctx, move |ctx| ctx.compute_artifact_cid(path)).await
}

#[tauri::command]
pub async fn create_or_open_release(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    oid: git::Oid,
    tag: Option<git::Oid>,
) -> Result<String, Error> {
    blocking(ctx, move |ctx| ctx.create_or_open_release(rid, oid, tag)).await
}

#[tauri::command]
pub async fn register_artifact(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    name: String,
    size_bytes: u64,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| {
        ctx.register_artifact(rid, release_id, cid, name, size_bytes)
    })
    .await
}

#[tauri::command]
pub async fn attest_artifact(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    path: std::path::PathBuf,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| {
        ctx.attest_artifact(rid, release_id, cid, path)
    })
    .await
}

#[tauri::command]
pub async fn set_artifact_metadata(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    key: String,
    value: serde_json::Value,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| {
        ctx.set_artifact_metadata(rid, release_id, cid, key, value)
    })
    .await
}

#[tauri::command]
pub async fn remove_artifact_metadata(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    key: String,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| {
        ctx.remove_artifact_metadata(rid, release_id, cid, key)
    })
    .await
}

#[tauri::command]
pub async fn add_artifact_location(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    url: String,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| ctx.add_location(rid, release_id, cid, url)).await
}

#[tauri::command]
pub async fn remove_artifact_location(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    url: String,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| {
        ctx.remove_location(rid, release_id, cid, url)
    })
    .await
}

#[tauri::command]
pub async fn redact_artifact(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    reason: String,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| {
        ctx.redact_and_unseed_artifact(rid, release_id, cid, reason)
    })
    .await
}

/// Pick one or more files to attach to a release. Returns an empty list when
/// the user cancels. The blocking dialog runs off the main thread, which the
/// plugin requires.
#[tauri::command]
pub async fn pick_artifact_files(app: tauri::AppHandle) -> Result<Vec<std::path::PathBuf>, Error> {
    let paths = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .blocking_pick_files()
            .unwrap_or_default()
    })
    .await?;

    Ok(paths
        .into_iter()
        .filter_map(|path| path.into_path().ok())
        .collect())
}

/// Pick a single directory to attach as a collection artifact.
#[tauri::command]
pub async fn pick_artifact_directory(
    app: tauri::AppHandle,
) -> Result<Option<std::path::PathBuf>, Error> {
    let path =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
            .await?;

    Ok(path.and_then(|path| path.into_path().ok()))
}

/// Whether the local artifact node is running. A node that is down is not an
/// error here: the UI shows setup guidance instead of stats.
#[tauri::command]
pub async fn artifact_node_running(ctx: tauri::State<'_, AppState>) -> Result<bool, Error> {
    blocking(ctx, |ctx| Ok(ctx.artifact_node_running())).await
}

/// Which artifact binaries are installed, so a node that is down can be told
/// apart from one that was never installed. Off the main thread, since the
/// CLI's version comes from running it.
#[tauri::command]
pub async fn artifact_binaries() -> Result<radicle_types::binaries::ArtifactBinaries, Error> {
    Ok(tauri::async_runtime::spawn_blocking(radicle_types::binaries::artifact_binaries).await?)
}

#[tauri::command]
pub async fn artifact_node_status(
    ctx: tauri::State<'_, AppState>,
) -> Result<types::artifact::ArtifactNodeStatus, Error> {
    blocking(ctx, |ctx| ctx.artifact_node_status()).await
}

/// Content ids the node seeds under this release. The release view asks once
/// and matches its rows against the result.
#[tauri::command]
pub async fn seeded_artifacts(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
) -> Result<Vec<String>, Error> {
    blocking(ctx, move |ctx| ctx.seeded_artifacts(rid, release_id)).await
}

#[tauri::command]
pub async fn seed_artifact(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    source_path: std::path::PathBuf,
) -> Result<String, Error> {
    blocking(ctx, move |ctx| {
        ctx.seed_artifact(rid, release_id, cid, source_path)
    })
    .await
}

#[tauri::command]
pub async fn unseed_artifact(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| ctx.unseed_artifact(rid, release_id, cid)).await
}

/// Download an artifact, forwarding the node's progress frames to the
/// frontend as `artifact_progress` events keyed by content id.
///
/// With `save_as`, the user picks where to save it in the OS save dialog,
/// seeded with that name, and the path never reaches the webview. Without it,
/// the artifact is only fetched into the node's store. Returns `false` when
/// the user cancels the dialog.
#[tauri::command]
pub async fn download_artifact(
    app: tauri::AppHandle,
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
    cid: String,
    save_as: Option<String>,
    seed: bool,
) -> Result<bool, Error> {
    let dest = match save_as {
        Some(name) => {
            let dialog = app.clone();
            let Some(dest) = tauri::async_runtime::spawn_blocking(move || {
                dialog
                    .dialog()
                    .file()
                    .set_file_name(name)
                    .blocking_save_file()
            })
            .await?
            else {
                return Ok(false);
            };
            Some(dest.into_path()?)
        }
        None => None,
    };

    blocking(ctx, move |ctx| {
        ctx.download_artifact(
            rid,
            release_id,
            cid.clone(),
            dest.as_deref(),
            seed,
            |progress| {
                let _ = app.emit(
                    "artifact_progress",
                    types::artifact::ArtifactProgress::new(&cid, progress),
                );
            },
        )
    })
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn delete_release(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    release_id: String,
) -> Result<(), Error> {
    blocking(ctx, move |ctx| {
        ctx.delete_and_unseed_release(rid, release_id)
    })
    .await
}
