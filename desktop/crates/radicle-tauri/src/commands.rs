pub mod auth;
pub mod cob;
pub mod diff;
pub mod identity;
pub mod inbox;
pub mod profile;
pub mod repo;
pub mod startup;
pub mod thread;

use radicle_types::AppState;
use radicle_types::error::Error;

/// Run a blocking, synchronous port method on the async runtime's blocking
/// pool instead of a worker thread. The port methods do blocking libgit2/COB
/// work; running them inline on an `async` command would pin a runtime worker
/// for the call's full duration and let a slow read (e.g. listing refs or
/// jobs) stall every other command queued behind it. Cloning `AppState` is
/// cheap — it only clones the `Profile` (paths and keys, not open handles).
pub(crate) async fn blocking<T, F>(ctx: tauri::State<'_, AppState>, f: F) -> Result<T, Error>
where
    F: FnOnce(AppState) -> Result<T, Error> + Send + 'static,
    T: Send + 'static,
{
    let state = (*ctx).clone();
    tauri::async_runtime::spawn_blocking(move || f(state)).await?
}
