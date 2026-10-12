use tauri::{AppHandle, Emitter, Manager};

use radicle::cob::cache::COBS_DB_FILE;
use radicle::node::{Handle, NOTIFICATIONS_DB_FILE, Node};

use radicle_types::binaries::GitInfo;
use radicle_types::config::{Config, Version};
use radicle_types::error::Error;
use radicle_types::traits::Profile;
use radicle_types::traits::artifact_node::ArtifactNode;
use radicle_types::{AppState, domain};

#[tauri::command]
pub(crate) fn version(app: AppHandle) -> Result<Version, Error> {
    Ok(Version {
        version: app.config().version.clone().unwrap_or("unknown".into()),
        head: env!("GIT_HEAD").to_string(),
    })
}

#[tauri::command]
pub(crate) fn check_radicle_cli(ctx: tauri::State<AppState>) -> Result<(), Error> {
    radicle_types::binaries::check_radicle_cli(&ctx.profile())
}

#[tauri::command]
pub(crate) fn git_info() -> GitInfo {
    radicle_types::binaries::git_info()
}

#[tauri::command]
pub(crate) fn startup(app: AppHandle) -> Result<Config, Error> {
    let profile = radicle::Profile::load()?;
    let state = AppState { profile };
    state.check_cobs_cache()?;
    let profile = &state.profile;

    let inbox_db = radicle_types::outbound::sqlite::Sqlite::reader(
        profile.node().join(NOTIFICATIONS_DB_FILE),
    )?;
    let cobs_db =
        radicle_types::outbound::sqlite::Sqlite::reader(profile.cobs().join(COBS_DB_FILE))?;

    let inbox_service = domain::inbox::service::Service::new(inbox_db);
    let patch_service = domain::patch::service::Service::new(cobs_db.clone());
    let issue_service = domain::issue::service::Service::new(cobs_db);

    let node_handle = app.app_handle().clone();

    let node = Node::new(profile.home().socket_from_env());

    app.manage(inbox_service);
    app.manage(patch_service);
    app.manage(issue_service);

    // Both probes are blocking socket calls, so they get their own thread. The
    // radicle node's event goes out first, so a slow artifact node can't
    // delay it.
    let probe_state = state.clone();
    std::thread::spawn(move || {
        loop {
            let _ = node_handle.emit("node_running", node.is_running());
            let _ = node_handle.emit("artifact_node_running", probe_state.artifact_node_running());
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });

    app.manage(state.clone());

    Ok(state.config())
}
