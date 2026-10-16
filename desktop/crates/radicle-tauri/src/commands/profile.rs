use radicle::node::NodeId;
use radicle_types::cobs::{AliasSuggestion, FollowedNode};
use radicle_types::config::Config;
use radicle_types::error::Error;
use radicle_types::traits::Profile;

use crate::AppState;
use crate::commands::blocking;

#[tauri::command]
pub fn config(ctx: tauri::State<AppState>) -> Config {
    ctx.config()
}

#[tauri::command]
pub fn alias(ctx: tauri::State<AppState>, nid: NodeId) -> Option<radicle::node::Alias> {
    ctx.alias(nid)
}

#[tauri::command]
pub async fn search_aliases(
    ctx: tauri::State<'_, AppState>,
    query: Option<String>,
) -> Result<Vec<AliasSuggestion>, Error> {
    blocking(ctx, move |ctx| Ok(ctx.search_aliases(query))).await
}

#[tauri::command]
pub async fn following(ctx: tauri::State<'_, AppState>) -> Result<Vec<FollowedNode>, Error> {
    blocking(ctx, move |ctx| ctx.following()).await
}

#[tauri::command]
pub async fn follow(ctx: tauri::State<'_, AppState>, nid: NodeId) -> Result<(), Error> {
    blocking(ctx, move |ctx| ctx.follow(nid)).await
}

#[tauri::command]
pub async fn unfollow(ctx: tauri::State<'_, AppState>, nid: NodeId) -> Result<(), Error> {
    blocking(ctx, move |ctx| ctx.unfollow(nid)).await
}
