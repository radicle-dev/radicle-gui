use radicle::identity;

use radicle_types as types;
use radicle_types::error::Error;
use radicle_types::traits::thread::Thread;

use crate::AppState;

#[tauri::command]
pub fn create_issue_comment(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    new: types::cobs::thread::NewIssueComment,
    opts: types::cobs::CobOptions,
) -> Result<types::cobs::thread::Comment<types::cobs::Never>, Error> {
    ctx.create_issue_comment(rid, new, opts)
}

#[tauri::command]
pub fn create_patch_comment(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    new: types::cobs::thread::NewPatchComment,
    opts: types::cobs::CobOptions,
) -> Result<types::cobs::thread::Comment<types::cobs::thread::CodeLocation>, Error> {
    ctx.create_patch_comment(rid, new, opts)
}
