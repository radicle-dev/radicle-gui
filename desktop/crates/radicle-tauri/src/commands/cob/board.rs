use radicle::cob::ObjectId;
use radicle::identity::RepoId;
use radicle_types as types;
use radicle_types::cobs::board::{Board, BoardUpdate, Card, CardMove, Column, PatchLink};
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

// Writing signs refs and announces to the node, which would block the main
// thread, and with it the window, for as long as that takes.
#[tauri::command(async)]
pub fn update_board(
    ctx: tauri::State<AppState>,
    rid: RepoId,
    board: ObjectId,
    moves: Vec<CardMove>,
    removes: Vec<Card>,
    opts: types::cobs::CobOptions,
) -> Result<BoardUpdate, Error> {
    ctx.update_board(rid, board, moves, removes, opts)
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
