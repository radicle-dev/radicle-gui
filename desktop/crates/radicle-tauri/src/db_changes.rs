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
                .map(|(path, event)| Watched::new(path, event))
                .collect();
            loop {
                for watched in &mut watched {
                    if watched.changed() {
                        let _ = app.emit(watched.event, ());
                    }
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
    fn new(path: PathBuf, event: &'static str) -> Self {
        Self {
            path,
            event,
            db: None,
            last: None,
            failing: false,
        }
    }

    /// Whether the database changed since the previous check. A database
    /// that opens after failing counts as changed: `data_version` only
    /// compares within one connection, so what happened in between is
    /// unknown.
    fn changed(&mut self) -> bool {
        let opened = self.db.is_none();
        let version = match &self.db {
            Some(db) => db.data_version(),
            None => Sqlite::watcher(&self.path).and_then(|db| {
                let version = db.data_version();
                self.db = Some(db);
                version
            }),
        };
        match version {
            Ok(version) => {
                let changed = if opened {
                    self.failing
                } else {
                    self.last != Some(version)
                };
                self.last = Some(version);
                self.failing = false;
                changed
            }
            Err(e) => {
                if !self.failing {
                    log::warn!("Not able to watch for `{}`: {e}", self.event);
                }
                self.db = None;
                self.last = None;
                self.failing = true;
                false
            }
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use std::path::PathBuf;
    use std::str::FromStr;

    use radicle::identity::RepoId;
    use radicle::node::policy::Scope;
    use radicle::node::policy::store::Store;

    use super::Watched;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "radicle-tauri-db-changes-{name}-{}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn seed(store: &mut Store<radicle::node::policy::store::Write>, rid: &str) {
        store
            .seed(&RepoId::from_str(rid).unwrap(), Scope::All)
            .unwrap();
    }

    #[test]
    fn emits_on_changes_but_not_on_first_sight() {
        let dir = TempDir::new("changes");
        let path = dir.0.join("policies.db");
        let mut store = Store::open(&path).unwrap();
        let mut watched = Watched::new(path, "policies_changed");

        assert!(!watched.changed());
        assert!(!watched.changed());
        seed(&mut store, "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5");
        assert!(watched.changed());
        assert!(!watched.changed());
    }

    #[test]
    fn emits_once_when_a_missing_database_appears() {
        let dir = TempDir::new("missing");
        let path = dir.0.join("policies.db");
        let mut watched = Watched::new(path.clone(), "policies_changed");

        assert!(!watched.changed());
        assert!(!watched.changed());
        Store::open(&path).unwrap();
        assert!(watched.changed());
        assert!(!watched.changed());
    }

    #[test]
    fn emits_once_when_it_works_again_after_failing() {
        let dir = TempDir::new("failing");
        let path = dir.0.join("policies.db");
        std::fs::write(&path, b"not a database").unwrap();
        let mut watched = Watched::new(path.clone(), "policies_changed");

        assert!(!watched.changed());
        assert!(watched.failing);
        std::fs::remove_file(&path).unwrap();
        Store::open(&path).unwrap();
        assert!(watched.changed());
        assert!(!watched.changed());
    }
}
