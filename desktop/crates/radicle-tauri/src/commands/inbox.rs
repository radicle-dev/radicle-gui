use radicle_types::AppState;
use radicle_types::domain::inbox::models::notification;
use radicle_types::domain::inbox::service::Service;
use radicle_types::error::Error;
use radicle_types::outbound::sqlite::Sqlite;
use radicle_types::traits::inbox::Inbox;

#[tauri::command]
pub fn list_notifications(
    ctx: tauri::State<AppState>,
    sqlite_service: tauri::State<Service<Sqlite>>,
    params: notification::RepoGroupParams,
) -> Result<notification::NotificationsByRepoList, Error> {
    ctx.list_notifications(&sqlite_service, params)
}

#[tauri::command]
pub fn notification_count(
    ctx: tauri::State<AppState>,
    inbox: tauri::State<Service<Sqlite>>,
) -> Result<usize, Error> {
    ctx.notification_count(&inbox)
}

#[tauri::command]
pub fn clear_notifications(
    ctx: tauri::State<AppState>,
    params: notification::SetStatusNotifications,
) -> Result<(), Error> {
    ctx.clear_notifications(params)
}
