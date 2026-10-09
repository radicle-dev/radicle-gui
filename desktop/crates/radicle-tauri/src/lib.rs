mod commands;

use radicle_types::AppState;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

use commands::{auth, cob, diff, identity, inbox, profile, repo, startup, thread};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Raise the open-file limit, matching heartwood's binaries (which all
    // default to 4096). Listing a repo's refs for the peer selector resolves
    // every remote's signed refs through libgit2, opening a descriptor per
    // packfile it reads. Radicle storage can hold thousands of packfiles, so
    // under the low default limit (e.g. a Finder-launched bundle) these reads
    // exhaust descriptors and objects in the unopened packs spuriously fail.
    if let Err(e) = radicle::io::set_file_limit(4096) {
        log::warn!("Unable to set open file limit: {e}");
    }

    // Launched from the desktop there is nowhere for stdout to go, so the logs
    // belong in a file instead. `TERM` is what tells the two cases apart: it
    // survives the pipes that `npm run tauri dev` puts between the app and the
    // terminal, which `std::io::IsTerminal` on our own stdout would not.
    let terminal = std::env::var_os("TERM").is_some();
    // A dev build gets its own identifier, so it can run next to an installed
    // release without the single-instance plugin handing over to it.
    let mut context = tauri::generate_context!();
    if tauri::is_dev() {
        let config = context.config_mut();
        config.identifier = format!("{}.dev", config.identifier);
    }
    // A `rad:` link opened while the app runs starts a second instance, which
    // hands the link to this one and exits; the deep-link plugin delivers it.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .target(Target::new(if terminal {
                    TargetKind::Stdout
                } else {
                    TargetKind::LogDir { file_name: None }
                }))
                .build(),
        );

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            register_rad_scheme(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::authenticate,
            auth::init,
            cob::get_embed,
            cob::issue::activity_by_issue,
            cob::issue::comment_threads_by_issue_id,
            cob::issue::delete_issue,
            cob::issue::create_issue,
            cob::issue::edit_issue,
            cob::issue::issue_by_id,
            cob::issue::list_issues,
            cob::issue::rebuild_issue_cache,
            cob::job::list_jobs,
            cob::patch::activity_by_patch,
            cob::patch::delete_patch,
            cob::patch::edit_patch,
            cob::patch::list_patches,
            cob::patch::patch_by_id,
            cob::patch::create_patch_review,
            cob::patch::rebuild_patch_cache,
            cob::patch::revisions_by_patch,
            cob::release::list_releases,
            cob::release::release_by_id,
            cob::release::release_counts,
            cob::release::compute_artifact_cid,
            cob::release::create_or_open_release,
            cob::release::register_artifact,
            cob::release::attest_artifact,
            cob::release::set_artifact_metadata,
            cob::release::remove_artifact_metadata,
            cob::release::add_artifact_location,
            cob::release::remove_artifact_location,
            cob::release::redact_artifact,
            cob::release::delete_release,
            cob::release::pick_artifact_files,
            cob::release::pick_artifact_directory,
            cob::release::artifact_node_running,
            cob::release::artifact_binaries,
            cob::release::artifact_node_status,
            cob::release::seeded_artifacts,
            cob::release::seed_artifact,
            cob::release::unseed_artifact,
            cob::release::download_artifact,
            cob::save_embed_by_bytes,
            cob::save_embed_by_path,
            cob::save_embed_to_disk,
            diff::get_diff,
            diff::get_diff_text,
            diff::save_diff_to_disk,
            repo::get_commit_diff,
            identity::identity_by_repo,
            inbox::clear_notifications,
            inbox::notification_count,
            inbox::list_notifications,
            profile::alias,
            profile::config,
            profile::search_aliases,
            profile::set_preferred_seeds,
            profile::set_public_explorer,
            repo::clean,
            repo::diff_stats,
            repo::list_commits,
            repo::list_canonical_tags,
            repo::list_repo_commits,
            repo::list_repo_refs,
            repo::list_repos,
            repo::list_repos_summary,
            repo::repo_by_id,
            repo::repo_commit_count,
            repo::repo_commit,
            repo::repo_commits_by_prefix,
            repo::repo_split_tree_path,
            repo::repo_count,
            repo::repo_readme,
            repo::repo_tree,
            repo::repo_blob,
            repo::repo_blob_bytes,
            repo::seed,
            repo::seeded_not_replicated,
            repo::unseed,
            startup::startup,
            startup::version,
            startup::check_radicle_cli,
            startup::git_info,
            thread::create_issue_comment,
            thread::create_patch_comment,
        ])
        .run(context)
        .expect("error while running tauri application");
}

// Installers register the scheme; an AppImage has to do it at runtime. It
// must never keep the app from starting, nor take the scheme from another
// handler, such as an installed package or one the user chose.
#[cfg(target_os = "linux")]
fn register_rad_scheme(app: &tauri::App) {
    use tauri_plugin_deep_link::DeepLinkExt;

    if app.env().appimage.is_none() || !rad_scheme_unclaimed() {
        return;
    }
    if let Err(e) = app.deep_link().register_all() {
        log::warn!("Unable to register the rad: scheme: {e}");
    }
}

#[cfg(not(target_os = "linux"))]
fn register_rad_scheme(_app: &tauri::App) {}

// The scheme is ours to claim when no handler is set, or when the handler is
// the one an AppImage registered before, which may point to an old path.
#[cfg(target_os = "linux")]
fn rad_scheme_unclaimed() -> bool {
    let Ok(exe) = tauri::utils::platform::current_exe() else {
        return false;
    };
    let Some(exe) = exe.file_name() else {
        return false;
    };
    let Ok(output) = std::process::Command::new("xdg-mime")
        .args(["query", "default", "x-scheme-handler/rad"])
        .output()
    else {
        return false;
    };
    let handler = String::from_utf8_lossy(&output.stdout);
    let handler = handler.trim();
    handler.is_empty() || handler == format!("{}-handler.desktop", exe.to_string_lossy())
}
