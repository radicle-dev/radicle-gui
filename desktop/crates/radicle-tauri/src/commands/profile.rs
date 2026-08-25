use radicle::identity::Did;
use radicle::node::NodeId;
use radicle_types::cobs::AliasSuggestion;
use radicle_types::config::Config;
use radicle_types::domain::contribution::models::contribution::{
    ActivityItem, ContributionDay, RepoContribution,
};
use radicle_types::domain::contribution::service::Service;
use radicle_types::domain::contribution::traits::ContributionService;
use radicle_types::error::Error;
use radicle_types::outbound::sqlite::Sqlite;
use radicle_types::traits::Profile;
use radicle_types::traits::patch::Patches;
use radicle_types::user;

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
pub fn user(ctx: tauri::State<AppState>, nid: NodeId) -> Result<user::User, Error> {
    ctx.user(nid)
}

#[tauri::command]
pub fn user_contributions(
    contributions: tauri::State<Service<Sqlite>>,
    did: Did,
) -> Result<Vec<RepoContribution>, Error> {
    contributions
        .contributions_by_author(did)
        .map_err(Error::from)
}

#[tauri::command]
pub fn user_activity(
    ctx: tauri::State<AppState>,
    contributions: tauri::State<Service<Sqlite>>,
    did: Did,
    limit: Option<usize>,
) -> Result<Vec<ActivityItem>, Error> {
    let mut items = contributions.recent_activity_by_author(did, limit.unwrap_or(10))?;
    // Revision numbering is not in the cache; it comes from the patch itself.
    ctx.annotate_revision_positions(&mut items);

    Ok(items)
}

#[tauri::command]
pub fn user_calendar(
    contributions: tauri::State<Service<Sqlite>>,
    did: Did,
    days: Option<u32>,
) -> Result<Vec<ContributionDay>, Error> {
    contributions
        .contribution_calendar(did, days.unwrap_or(365))
        .map_err(Error::from)
}
