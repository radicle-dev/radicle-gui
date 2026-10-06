use radicle::cob::ObjectId;
use radicle::identity::RepoId;
use radicle_types as types;
use radicle_types::cobs::board::{Board, Card, Column, PatchLink};
use radicle_types::error::Error;
use radicle_types::traits::board::Boards;

use crate::AppState;

#[tauri::command]
pub fn list_boards(ctx: tauri::State<AppState>, rid: RepoId) -> Result<Vec<Board>, Error> {
    ctx.list_boards(rid)
}

#[tauri::command]
pub fn create_board(
    ctx: tauri::State<AppState>,
    rid: RepoId,
    name: String,
    opts: types::cobs::CobOptions,
) -> Result<Board, Error> {
    ctx.create_board(rid, name, opts)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn move_card(
    ctx: tauri::State<AppState>,
    rid: RepoId,
    board: ObjectId,
    card: Card,
    column: String,
    before: Option<String>,
    after: Option<String>,
    opts: types::cobs::CobOptions,
) -> Result<Board, Error> {
    ctx.move_card(rid, board, card, column, before, after, opts)
}

#[tauri::command]
pub fn remove_card(
    ctx: tauri::State<AppState>,
    rid: RepoId,
    board: ObjectId,
    card: Card,
    opts: types::cobs::CobOptions,
) -> Result<Board, Error> {
    ctx.remove_card(rid, board, card, opts)
}

#[tauri::command]
pub fn board_links(ctx: tauri::State<AppState>, rid: RepoId) -> Result<Vec<PatchLink>, Error> {
    ctx.board_links(rid)
}

#[tauri::command]
pub fn rename_board(
    ctx: tauri::State<AppState>,
    rid: RepoId,
    board: ObjectId,
    name: String,
    opts: types::cobs::CobOptions,
) -> Result<Board, Error> {
    ctx.rename_board(rid, board, name, opts)
}

#[tauri::command]
pub fn set_board_columns(
    ctx: tauri::State<AppState>,
    rid: RepoId,
    board: ObjectId,
    columns: Vec<Column>,
    opts: types::cobs::CobOptions,
) -> Result<Board, Error> {
    ctx.set_board_columns(rid, board, columns, opts)
}
