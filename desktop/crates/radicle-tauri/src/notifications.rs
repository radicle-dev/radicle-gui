use std::sync::Once;
use std::time::Duration;

use radicle_types::outbound::sqlite::Sqlite;
use tauri::{AppHandle, Emitter};

/// Tells the frontend when another process changes the notifications, such as
/// the `rad` CLI or another instance of the app clearing some. The node's
/// events only cover notifications it adds while fetching.
pub(crate) fn spawn(app: AppHandle, db: Sqlite) {
    static WATCHING: Once = Once::new();
    WATCHING.call_once(|| {
        std::thread::spawn(move || {
            let mut last = None;
            let mut failing = false;
            loop {
                match db.data_version() {
                    Ok(version) => {
                        if last.is_some_and(|last| last != version) {
                            let _ = app.emit("notifications_changed", ());
                        }
                        last = Some(version);
                        failing = false;
                    }
                    // Logged once until it works again.
                    Err(e) => {
                        if !failing {
                            log::warn!("Not able to watch the notifications: {e}");
                        }
                        failing = true;
                    }
                }
                std::thread::sleep(Duration::from_secs(2));
            }
        });
    });
}
