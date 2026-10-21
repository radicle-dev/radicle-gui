use anyhow::{Context, Result};
use radicle::Profile;
use radicle::identity::RepoId;
use radicle::node::routing::Store as _;
use radicle::prelude::Doc;
use radicle::storage::{ReadRepository, ReadStorage};
use radicle_surf::Repository as SurfRepository;

use crate::index::repo;

const ONE_YEAR_SECS: i64 = 52 * 7 * 24 * 60 * 60;

pub(super) fn document(
    profile: &Profile,
    db: &radicle::node::Database,
    rid: RepoId,
    doc: &Doc,
) -> Result<Option<repo::Document>> {
    let storage = &profile.storage;
    let repo = storage
        .repository(rid)
        .context(format!("opening {rid} from storage failed"))?;
    let seeding_count = db.count(&rid).unwrap_or_default() as u64;

    let activity = match repo_activity(&repo) {
        Ok(activity) => activity,
        Err(e) => {
            tracing::debug!("{rid}: head/activity unavailable ({e:#})");
            repo::Activity::empty()
        }
    };

    Ok(repo::Document::new(rid, doc, activity, seeding_count))
}

fn repo_activity(repo: &radicle::storage::git::Repository) -> Result<repo::Activity> {
    let surf = SurfRepository::open(repo.path())?;
    let head = surf.head()?;
    let head_commit = surf.commit(head)?;
    let head_time = Some(head_commit.committer.time.seconds());

    let cutoff = chrono::Utc::now().timestamp() - ONE_YEAR_SECS;
    let activity: Vec<i64> = surf
        .history(head)?
        .filter_map(|c| {
            let c = c.ok()?;
            let s = c.committer.time.seconds();
            if s > cutoff { Some(s) } else { None }
        })
        .collect();

    Ok(repo::Activity {
        head: Some(head),
        head_committer_time: head_time,
        activity_timestamps: activity,
    })
}
