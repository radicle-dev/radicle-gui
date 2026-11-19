use std::path::PathBuf;
use std::sync::Once;
use std::time::Duration;

use radicle_types::outbound::sqlite::Sqlite;
use tauri::{AppHandle, Emitter};

/// Tells the frontend when another process changes a database the app reads,
/// by emitting the event named with it. The node's events don't cover these:
/// the `rad` CLI or another instance of the app may clear notifications or
/// change seeding policies, and the node writes notifications as it fetches.
pub(crate) fn spawn(app: AppHandle, databases: Vec<(PathBuf, &'static str)>) {
    static WATCHING: Once = Once::new();
    WATCHING.call_once(|| {
        std::thread::spawn(move || {
            let mut watched: Vec<Watched> = databases
                .into_iter()
                .map(|(path, event)| Watched {
                    path,
                    event,
                    db: None,
                    last: None,
                    failing: false,
                })
                .collect();
            loop {
                for watched in &mut watched {
                    watched.check(&app);
                }
                std::thread::sleep(Duration::from_secs(2));
            }
        });
    });
}

struct Watched {
    path: PathBuf,
    event: &'static str,
    /// Opened on first use, and again after a failure, such as when the
    /// database doesn't exist yet.
    db: Option<Sqlite>,
    last: Option<i64>,
    failing: bool,
}

impl Watched {
    fn check(&mut self, app: &AppHandle) {
        let version = match &self.db {
            Some(db) => db.data_version(),
            None => Sqlite::reader(&self.path).and_then(|db| {
                let version = db.data_version();
                self.db = Some(db);
                version
            }),
        };
        match version {
            Ok(version) => {
                if self.last.is_some_and(|last| last != version) {
                    let _ = app.emit(self.event, ());
                }
                self.last = Some(version);
                self.failing = false;
            }
            // Logged once until it works again.
            Err(e) => {
                if !self.failing {
                    log::warn!("Not able to watch for `{}`: {e}", self.event);
                }
                self.db = None;
                self.failing = true;
            }
        }
    }
}
