use radicle::git;
use radicle::identity;

use radicle::issue::TYPENAME;
use radicle_types as types;
use radicle_types::domain::issue::service::Service;
use radicle_types::domain::issue::traits::IssueService;
use radicle_types::error::Error;
use radicle_types::outbound::sqlite::Sqlite;
use radicle_types::traits::Profile;
use radicle_types::traits::cobs::Cobs;
use radicle_types::traits::issue::Issues;
use radicle_types::traits::issue::IssuesMut;

use crate::AppState;

#[tauri::command]
pub fn create_issue(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    new: types::cobs::issue::NewIssue,
    opts: types::cobs::CobOptions,
) -> Result<types::cobs::issue::Issue, Error> {
    ctx.create_issue(rid, new, opts)
}

#[tauri::command]
pub fn edit_issue(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    cob_id: git::Oid,
    action: types::cobs::issue::Action,
    opts: types::cobs::CobOptions,
) -> Result<types::cobs::issue::Issue, Error> {
    ctx.edit_issue(rid, cob_id, action, opts)
}

#[tauri::command]
pub fn delete_issue(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    cob_id: git::Oid,
    opts: types::cobs::CobOptions,
) -> Result<(), Error> {
    ctx.delete_issue(rid, cob_id, opts)
}

#[tauri::command]
pub(crate) async fn list_issues(
    ctx: tauri::State<'_, AppState>,
    issue_service: tauri::State<'_, Service<Sqlite>>,
    rid: identity::RepoId,
    status: Option<types::cobs::query::IssueStatus>,
    skip: Option<usize>,
    // None: return all issues, `skip` is ignored.
    take: Option<usize>,
) -> Result<types::cobs::PaginatedQuery<Vec<types::cobs::issue::Issue>>, Error> {
    let profile = ctx.profile();
    let aliases = profile.aliases();

    Ok(issue_service.list_paginated(rid, status.unwrap_or_default(), skip, take, &aliases)?)
}

#[tauri::command]
pub(crate) fn issue_by_id(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    id: git::Oid,
) -> Result<Option<types::cobs::issue::Issue>, Error> {
    ctx.issue_by_id(rid, id)
}

#[tauri::command]
pub(crate) fn comment_threads_by_issue_id(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    id: git::Oid,
) -> Result<Option<Vec<types::cobs::thread::Thread>>, Error> {
    ctx.comment_threads_by_issue_id(rid, id)
}

#[tauri::command]
pub fn activity_by_issue(
    ctx: tauri::State<AppState>,
    rid: identity::RepoId,
    id: git::Oid,
) -> Result<Vec<types::cobs::Operation<types::cobs::issue::Action>>, Error> {
    ctx.activity_by_id(rid, &TYPENAME, id)
}

#[tauri::command]
pub async fn rebuild_issue_cache(
    ctx: tauri::State<'_, AppState>,
    rid: identity::RepoId,
    on_event: tauri::ipc::Channel<types::cobs::CacheEvent>,
) -> Result<(), Error> {
    ctx.rebuild_issue_cache(rid, |event| on_event.send(event).map_err(Error::from))
}
