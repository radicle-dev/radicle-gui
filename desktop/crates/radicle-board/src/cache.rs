//! A SQLite cache of evaluated boards. Heartwood only caches its own
//! object types, so without it every read replays every board's history.
//!
//! A board's state is a function of its tips: an operation's commit has the
//! identity document, card root and proof it checks as parents, so they
//! replicate with it and never change. A row is current while its token,
//! made of the sorted tips and the format versions, matches the references.
//! A changed board is evaluated whole: operations are ordered by timestamp,
//! so a fetched one can sort before those already applied.
//!
//! The node fetches other peers' operations in the background and doesn't
//! know about this cache, so reads check freshness against the references
//! rather than trusting a hook. A read refreshes stale rows and prunes
//! boards whose references are gone.

use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;

use radicle::git::Oid;
use radicle::identity::RepoId;
use sqlite as sql;

use crate::{Board, BoardId, VERSION};

/// Changes to the evaluator's rules change what a board evaluates to, so
/// every such change must bump this: rows with an older token are then
/// evaluated again on read.
const FORMAT: u32 = 5;

const DB_FILE: &str = "boards.db";

const DB_TIMEOUT: Duration = Duration::from_secs(6);

const MIGRATIONS: &[&str] = &["CREATE TABLE IF NOT EXISTS boards (
        id TEXT NOT NULL,
        repo TEXT NOT NULL,
        head TEXT NOT NULL,
        board TEXT NOT NULL,
        PRIMARY KEY (repo, id)
    ) STRICT;"];

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("sqlite: {0}")]
    Sql(#[from] sql::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("parse: {0}")]
    Parse(String),
    #[error("no rows returned")]
    NoRows,
}

/// The cache database within a profile's COBs directory.
pub fn db_path(cobs: impl AsRef<Path>) -> PathBuf {
    cobs.as_ref().join(DB_FILE)
}

/// The freshness token of a board at `tips`.
pub fn head_token<'a>(tips: impl IntoIterator<Item = &'a Oid>) -> String {
    let mut tips: Vec<String> = tips.into_iter().map(Oid::to_string).collect();
    tips.sort();
    format!("v{FORMAT}.{VERSION}:{}", tips.join(","))
}

/// A cached board: its token and its JSON.
pub struct Row {
    pub head: String,
    pub board: String,
}

pub struct Store {
    db: sql::ConnectionThreadSafe,
}

impl Store {
    /// Opens the cache at `path`, creating and migrating it as needed.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, Error> {
        let mut db = sql::Connection::open_thread_safe(path)?;
        db.set_busy_timeout(DB_TIMEOUT.as_millis() as usize)?;
        // Both are harmless no-ops for in-memory databases.
        let _ = db.execute("PRAGMA journal_mode = WAL");
        let _ = db.execute("PRAGMA synchronous = NORMAL");
        let store = Self { db };
        store.migrate()?;

        Ok(store)
    }

    fn migrate(&self) -> Result<(), Error> {
        transaction(&self.db, |db| {
            let mut version = user_version(db)?;
            while version < MIGRATIONS.len() {
                db.execute(MIGRATIONS[version])?;
                db.execute(format!("PRAGMA user_version = {}", version + 1))?;
                version += 1;
            }
            Ok(())
        })
    }

    pub fn update(
        &self,
        repo: &RepoId,
        id: &BoardId,
        head: &str,
        board: &Board,
    ) -> Result<(), Error> {
        let board = serde_json::to_string(board)?;
        transaction(&self.db, |db| {
            let mut stmt = db.prepare(
                "INSERT INTO boards (id, repo, head, board) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT (repo, id) DO UPDATE SET head = ?3, board = ?4",
            )?;
            stmt.bind((1, id.to_string().as_str()))?;
            stmt.bind((2, repo.to_string().as_str()))?;
            stmt.bind((3, head))?;
            stmt.bind((4, board.as_str()))?;
            stmt.next()?;
            Ok(())
        })
    }

    pub fn remove(&self, repo: &RepoId, id: &BoardId) -> Result<(), Error> {
        transaction(&self.db, |db| {
            let mut stmt = db.prepare("DELETE FROM boards WHERE repo = ?1 AND id = ?2")?;
            stmt.bind((1, repo.to_string().as_str()))?;
            stmt.bind((2, id.to_string().as_str()))?;
            stmt.next()?;
            Ok(())
        })
    }

    pub fn get(&self, repo: &RepoId, id: &BoardId) -> Result<Option<Row>, Error> {
        let mut stmt = self
            .db
            .prepare("SELECT head, board FROM boards WHERE repo = ?1 AND id = ?2")?;
        stmt.bind((1, repo.to_string().as_str()))?;
        stmt.bind((2, id.to_string().as_str()))?;
        match stmt.into_iter().next().transpose()? {
            None => Ok(None),
            Some(row) => Ok(Some(Row {
                head: row.try_read::<&str, _>("head")?.to_string(),
                board: row.try_read::<&str, _>("board")?.to_string(),
            })),
        }
    }

    pub fn rows(&self, repo: &RepoId) -> Result<Vec<(BoardId, Row)>, Error> {
        let mut stmt = self
            .db
            .prepare("SELECT id, head, board FROM boards WHERE repo = ?1")?;
        stmt.bind((1, repo.to_string().as_str()))?;
        let mut rows = Vec::new();
        for row in stmt.into_iter() {
            let row = row?;
            let id = BoardId::from_str(row.try_read::<&str, _>("id")?)
                .map_err(|e| Error::Parse(format!("board id: {e}")))?;
            rows.push((
                id,
                Row {
                    head: row.try_read::<&str, _>("head")?.to_string(),
                    board: row.try_read::<&str, _>("board")?.to_string(),
                },
            ));
        }

        Ok(rows)
    }
}

/// Runs `f` in a write transaction, taking the write lock up front so that
/// two processes can't deadlock upgrading theirs.
fn transaction<T>(
    db: &sql::ConnectionThreadSafe,
    f: impl FnOnce(&sql::ConnectionThreadSafe) -> Result<T, Error>,
) -> Result<T, Error> {
    db.execute("BEGIN IMMEDIATE")?;
    match f(db) {
        Ok(value) => {
            db.execute("COMMIT")?;
            Ok(value)
        }
        Err(err) => {
            let _ = db.execute("ROLLBACK");
            Err(err)
        }
    }
}

fn user_version(db: &sql::ConnectionThreadSafe) -> Result<usize, Error> {
    let version = db
        .prepare("PRAGMA user_version")?
        .into_iter()
        .next()
        .ok_or(Error::NoRows)??
        .read::<i64, _>(0);

    Ok(version as usize)
}
