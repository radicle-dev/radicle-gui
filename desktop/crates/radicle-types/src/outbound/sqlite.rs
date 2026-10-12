use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;
use std::time;

use radicle::issue::{Issue, IssueId};
use radicle::patch::{Patch, PatchId, Status};
use radicle::{git, identity};
use sqlite as sql;

use crate::domain::inbox::models::notification;
use crate::domain::inbox::traits::InboxStorage;
use crate::domain::issue::models::issue::{ListIssuesError, Status as IssueStatus};
use crate::domain::issue::traits::IssueStorage;
use crate::domain::patch::models::patch::{CountsError, ListPatchesError, PatchCounts, State};
use crate::domain::patch::traits::PatchStorage;
use crate::error::Error;

#[derive(Clone)]
pub struct Sqlite {
    pub db: Arc<sql::ConnectionThreadSafe>,
}

impl Sqlite {
    /// How long to wait for the database lock to be released before failing a read.
    const DB_READ_TIMEOUT: time::Duration = time::Duration::from_secs(3);

    pub fn reader<P: AsRef<Path>>(path: P) -> Result<Self, Error> {
        let mut db = sql::Connection::open_thread_safe_with_flags(
            path,
            sqlite::OpenFlags::new().with_read_only(),
        )?;
        db.set_busy_timeout(Self::DB_READ_TIMEOUT.as_millis() as usize)?;

        Ok(Self { db: Arc::new(db) })
    }
}

impl PatchStorage for Sqlite {
    fn counts(&self, rid: identity::RepoId) -> Result<PatchCounts, CountsError> {
        let mut stmt = self.db.prepare(
            "SELECT
                 patch->'$.state' AS state,
                 COUNT(*) AS count
             FROM patches
             WHERE repo = ?1
             GROUP BY patch->'$.state.status'",
        )?;
        stmt.bind((1, &rid))?;

        stmt.into_iter()
            .try_fold(PatchCounts::default(), |mut counts, row| {
                let row = row?;
                let count = row.read::<i64, _>("count") as usize;
                let status = serde_json::from_str::<State>(row.read::<&str, _>("state"))
                    .map_err(|err| CountsError::Unknown(err.into()))?;
                match status {
                    State::Draft => counts.draft += count,
                    State::Open { .. } => counts.open += count,
                    State::Archived => counts.archived += count,
                    State::Merged { .. } => counts.merged += count,
                }
                Ok(counts)
            })
    }

    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, ListPatchesError> {
        let mut stmt = self.db.prepare(
            "SELECT id, patch, (
                 SELECT MIN(JSON_EXTRACT(revision.value, '$.timestamp'))
                 FROM JSON_EACH(JSON_EXTRACT(p.patch, '$.revisions')) AS revision
             ) AS last_revision_timestamp
             FROM patches AS p
             WHERE repo = ?1
             ORDER BY last_revision_timestamp DESC, id DESC;
             ",
        )?;
        stmt.bind((1, &rid))?;
        Ok(stmt.into_iter().filter_map(|row| {
            let row = row.ok()?;
            let id = PatchId::from_str(row.read::<&str, _>("id")).ok()?;
            let patch = serde_json::from_str::<Patch>(row.read::<&str, _>("patch")).ok()?;
            Some((id, patch))
        }))
    }

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: Status,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, ListPatchesError> {
        // Merged patches sort by the earliest merge of the merged revision.
        // `merges` also keeps delegates' merges of other revisions, so those
        // are skipped. With a delegate threshold of 1 this is when the patch
        // became merged. With a higher threshold the patch only became merged
        // at the threshold-th merge, which we don't compute, so it sorts at
        // the first delegate's merge, however long the others took.
        let sort_key = if status == Status::Merged {
            "SELECT MIN(JSON_EXTRACT(merge.value, '$.timestamp'))
             FROM JSON_EACH(JSON_EXTRACT(p.patch, '$.merges')) AS merge
             WHERE JSON_EXTRACT(merge.value, '$.revision') = p.patch->>'$.state.revision'
             AND JSON_EXTRACT(merge.value, '$.commit') = p.patch->>'$.state.commit'"
        } else {
            "SELECT MIN(JSON_EXTRACT(revision.value, '$.timestamp'))
             FROM JSON_EACH(JSON_EXTRACT(p.patch, '$.revisions')) AS revision"
        };
        let mut stmt = self.db.prepare(format!(
            "SELECT id, patch, ({sort_key}) AS sort_timestamp
             FROM patches AS p
             WHERE repo = ?1
             AND patch->>'$.state.status' = ?2
             ORDER BY sort_timestamp DESC, id DESC;
             "
        ))?;
        stmt.bind((1, &rid))?;
        stmt.bind((2, sql::Value::String(status.to_string())))?;
        Ok(stmt.into_iter().filter_map(|row| {
            let row = row.ok()?;
            let id = PatchId::from_str(row.read::<&str, _>("id")).ok()?;
            let patch = serde_json::from_str::<Patch>(row.read::<&str, _>("patch")).ok()?;
            Some((id, patch))
        }))
    }
}

impl Sqlite {
    /// Issues for `rid`, newest first, optionally filtered by state. Single
    /// home of the issue-listing SQL; `list`/`list_by_status` differ only in
    /// the status predicate. The sort key is the root comment's timestamp
    /// (the comment without a `replyTo`) — the issue's creation time — not
    /// the minimum across replies, whose author-supplied clocks could
    /// otherwise sink an issue below its real position.
    fn issues_by(
        &self,
        rid: identity::RepoId,
        status: Option<IssueStatus>,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, ListIssuesError> {
        let filter = if status.is_some() {
            "AND issue->>'$.state.status' = ?2"
        } else {
            ""
        };
        let mut stmt = self.db.prepare(format!(
            "SELECT id, issue, (
                 SELECT MIN(JSON_EXTRACT(comment.value, '$.edits[0].timestamp'))
                 FROM JSON_EACH(JSON_EXTRACT(i.issue, '$.thread.comments')) AS comment
                 WHERE JSON_EXTRACT(comment.value, '$.replyTo') IS NULL
             ) AS created_timestamp
             FROM issues AS i
             WHERE repo = ?1
             {filter}
             ORDER BY created_timestamp DESC, id DESC;
             "
        ))?;
        stmt.bind((1, &rid))?;
        if let Some(status) = status {
            stmt.bind((2, status.as_str()))?;
        }
        Ok(stmt.into_iter().filter_map(|row| {
            let row = row.ok()?;
            let id = IssueId::from_str(row.read::<&str, _>("id")).ok()?;
            let issue = serde_json::from_str::<Issue>(row.read::<&str, _>("issue")).ok()?;
            Some((id, issue))
        }))
    }
}

impl IssueStorage for Sqlite {
    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, ListIssuesError> {
        self.issues_by(rid, None)
    }

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: IssueStatus,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, ListIssuesError> {
        self.issues_by(rid, Some(status))
    }
}

impl InboxStorage for Sqlite {
    fn counts_by_repo(
        &self,
    ) -> Result<
        impl Iterator<Item = Result<notification::CountByRepo, notification::ListNotificationsError>>,
        notification::ListNotificationsError,
    > {
        let stmt = self.db.prepare(
            "SELECT COUNT(DISTINCT substr(ref, 66)) count, ref, repo
                 FROM `repository-notifications`
                 WHERE new NOT NULL AND (ref LIKE '%cobs/xyz.radicle.patch%' OR ref LIKE '%cobs/xyz.radicle.issue%')
                 GROUP BY repo",
        )?;

        Ok(stmt.into_iter().map(|row| {
            let row = row?;
            let count = row.try_read::<i64, _>("count")? as usize;
            let repo = row.try_read::<identity::RepoId, _>("repo")?;

            Ok((repo, count))
        }))
    }

    fn notification_count(&self) -> Result<usize, notification::ListNotificationsError> {
        let stmt = self.db.prepare(
            "SELECT COUNT(DISTINCT substr(ref, 66)) as count
             FROM `repository-notifications`
             WHERE new NOT NULL AND (ref LIKE '%cobs/xyz.radicle.patch%' OR ref LIKE '%cobs/xyz.radicle.issue%')",
        )?;

        match stmt.into_iter().next() {
            Some(Ok(row)) => Ok(row.try_read::<i64, _>("count")? as usize),
            _ => Ok(0),
        }
    }

    fn repo_group(
        &self,
        params: notification::RepoGroupParams,
    ) -> Result<
        Vec<(identity::RepoId, notification::RepoGroup)>,
        notification::ListNotificationsError,
    > {
        let repos_clause = match &params.repos {
            Some(repos) if !repos.is_empty() => {
                let placeholders: Vec<String> =
                    (1..=repos.len()).map(|i| format!("?{}", i)).collect();
                format!("AND repo IN ({})", placeholders.join(","))
            }
            _ => String::from(""),
        };

        let query = format!(
            "SELECT repo, ref, substr(ref, 66) ref_without_namespace,
                json_group_array(
                    json_object(
                        'row_id', rowid,
                        'timestamp', timestamp,
                        'remote', substr(ref, 17, 48),
                        'old', old,
                        'new', new
                    )
                ) as value,
                MAX(timestamp) AS latest_timestamp
            FROM 'repository-notifications'
            WHERE new NOT NULL
              AND (ref LIKE '%cobs/xyz.radicle.patch%'
                   OR ref LIKE '%cobs/xyz.radicle.issue%')
            {}
            GROUP BY repo, ref_without_namespace
            ORDER BY latest_timestamp DESC",
            repos_clause
        );

        let mut stmt = self.db.prepare(&query)?;

        if let Some(repos) = &params.repos
            && !repos.is_empty()
        {
            for (i, repo) in repos.iter().enumerate() {
                stmt.bind((i + 1, repo))?;
            }
        }

        let mut result: Vec<(identity::RepoId, notification::RepoGroup)> = Vec::new();
        let mut current_repo: Option<identity::RepoId> = None;
        let mut current_group: notification::RepoGroup = Vec::new();

        for row_result in stmt.into_iter() {
            let row = row_result?;
            let repo_id = row.try_read::<identity::RepoId, _>("repo")?;
            let refstr = row.try_read::<&str, _>("ref")?;
            let value = row.try_read::<&str, _>("value")?;
            let items = serde_json::from_str::<Vec<notification::NotificationRow>>(value)?;
            let (_, reference) = git::parse_ref::<String>(refstr)?;

            if let Some(current) = current_repo {
                if current != repo_id {
                    result.push((current, std::mem::take(&mut current_group)));
                    current_repo = Some(repo_id);
                }
            } else {
                current_repo = Some(repo_id);
            }

            current_group.push((reference.to_owned(), items));
        }

        if let Some(repo) = current_repo
            && !current_group.is_empty()
        {
            result.push((repo, current_group));
        }

        Ok(result)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::str::FromStr;
    use std::sync::Arc;

    use radicle::identity::RepoId;
    use radicle::patch::{PatchId, Status};
    use serde_json::json;
    use sqlite as sql;

    use crate::domain::patch::traits::PatchStorage;

    use super::Sqlite;

    const RID: &str = "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe";
    const NID: &str = "z6MktULudTtAsAhRegYPiZ6631RV3viv12qd4GQF8z1xB22S";
    const COMMIT: &str = "52b0a6dfb600be4e8fe61d70ca40cead71fb03a8";
    const FIRST: &str = "1111111111111111111111111111111111111111";
    const SECOND: &str = "2222222222222222222222222222222222222222";
    const THIRD: &str = "3333333333333333333333333333333333333333";
    const OTHER_NID: &str = "z6MkpaATbhkGbSMysNomYTFVvKG5bnNKYZ2cCamfoHzX9SnL";

    fn patch(id: &str, status: &str, created: u64, merged: u64) -> serde_json::Value {
        let state = if status == "merged" {
            json!({ "status": "merged", "revision": id, "commit": COMMIT })
        } else {
            json!({ "status": status, "conflicts": [] })
        };
        json!({
            "title": "Patch",
            "author": { "id": format!("did:key:{NID}") },
            "state": state,
            "target": "delegates",
            "labels": [],
            "merges": {
                NID: { "revision": id, "commit": COMMIT, "timestamp": merged }
            },
            "revisions": {
                id: {
                    "id": id,
                    "author": { "id": format!("did:key:{NID}") },
                    "description": [
                        { "author": NID, "timestamp": created, "body": "", "embeds": [] }
                    ],
                    "base": COMMIT,
                    "oid": COMMIT,
                    "discussion": { "comments": {}, "timeline": [] },
                    "reviews": {},
                    "timestamp": created,
                    "resolves": [],
                    "reactions": []
                }
            },
            "assignees": [],
            "timeline": [id],
            "reviews": {}
        })
    }

    fn db(patches: &[(&str, serde_json::Value)]) -> Sqlite {
        let db = sql::Connection::open_thread_safe(":memory:").unwrap();
        db.execute("CREATE TABLE patches (id TEXT PRIMARY KEY, repo TEXT, patch TEXT)")
            .unwrap();
        for (id, patch) in patches {
            let mut stmt = db
                .prepare("INSERT INTO patches (id, repo, patch) VALUES (?1, ?2, ?3)")
                .unwrap();
            stmt.bind((1, *id)).unwrap();
            stmt.bind((2, RID)).unwrap();
            stmt.bind((3, patch.to_string().as_str())).unwrap();
            stmt.next().unwrap();
        }
        Sqlite { db: Arc::new(db) }
    }

    fn ids(db: &Sqlite, status: Status) -> Vec<PatchId> {
        db.list_by_status(RepoId::from_str(RID).unwrap(), status)
            .unwrap()
            .map(|(id, _)| id)
            .collect()
    }

    #[test]
    fn merged_patches_sort_by_merge_time() {
        let db = db(&[
            (FIRST, patch(FIRST, "merged", 1000, 4000)),
            (SECOND, patch(SECOND, "merged", 2000, 3000)),
        ]);

        assert_eq!(
            ids(&db, Status::Merged),
            [
                PatchId::from_str(FIRST).unwrap(),
                PatchId::from_str(SECOND).unwrap()
            ]
        );
    }

    #[test]
    fn merged_patches_ignore_merges_of_other_revisions() {
        let mut first = patch(FIRST, "merged", 1000, 4000);
        first["merges"][OTHER_NID] = json!({
            "revision": THIRD,
            "commit": COMMIT,
            "timestamp": 500
        });
        let db = db(&[
            (FIRST, first),
            (SECOND, patch(SECOND, "merged", 2000, 3000)),
        ]);

        assert_eq!(
            ids(&db, Status::Merged),
            [
                PatchId::from_str(FIRST).unwrap(),
                PatchId::from_str(SECOND).unwrap()
            ]
        );
    }

    #[test]
    fn open_patches_sort_by_creation_time() {
        let db = db(&[
            (FIRST, patch(FIRST, "open", 1000, 4000)),
            (SECOND, patch(SECOND, "open", 2000, 3000)),
        ]);

        assert_eq!(
            ids(&db, Status::Open),
            [
                PatchId::from_str(SECOND).unwrap(),
                PatchId::from_str(FIRST).unwrap()
            ]
        );
    }
}
