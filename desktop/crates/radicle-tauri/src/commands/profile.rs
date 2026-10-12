use radicle::node::NodeId;
use radicle_types::cobs::AliasSuggestion;
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
