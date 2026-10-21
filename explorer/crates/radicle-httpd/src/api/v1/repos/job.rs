use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use url::Url;
use uuid::Uuid;

use radicle::git::Oid;
use radicle::identity::{Did, RepoId};
use radicle::node::{Alias, AliasStore};
use radicle_job::JobId;

use crate::api::error::Error as ApiError;
use crate::api::Context;
use crate::axum_extra::Path;

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    job_id: JobId,
    commit: Oid,
    runs: Vec<Run>,
}

impl Job {
    fn new(id: JobId, job: &radicle_job::Job, aliases: &impl AliasStore) -> Self {
        let runs = job
            .runs()
            .iter()
            .flat_map(|(node_id, runs)| {
                let did: Did = node_id.into();
                let alias = aliases.alias(&did);

                runs.iter().map(move |(run_id, run)| Run {
                    run_id: *run_id,
                    node: JobAuthor {
                        id: did,
                        alias: alias.clone(),
                    },
                    status: (*run.status()).into(),
                    log: run.log().clone(),
                })
            })
            .collect();

        Self {
            job_id: id,
            commit: *job.oid(),
            runs,
        }
    }
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct JobAuthor {
    id: Did,
    #[serde(skip_serializing_if = "Option::is_none")]
    alias: Option<Alias>,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Run {
    run_id: Uuid,
    node: JobAuthor,
    status: Status,
    log: Url,
}

#[derive(Clone, Copy, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
enum Status {
    Started,
    Failed,
    Succeeded,
}

impl From<radicle_job::Status> for Status {
    fn from(value: radicle_job::Status) -> Self {
        match value {
            radicle_job::Status::Started => Self::Started,
            radicle_job::Status::Finished(radicle_job::Reason::Failed) => Self::Failed,
            radicle_job::Status::Finished(radicle_job::Reason::Succeeded) => Self::Succeeded,
        }
    }
}

pub trait FindJobs {
    fn find_by_commit(&self, oid: Oid) -> Result<Vec<(JobId, radicle_job::Job)>, ApiError>;

    fn jobs_by_commit<A: AliasStore>(
        &self,
        commit: Oid,
        aliases: &A,
    ) -> Result<Vec<Job>, ApiError> {
        let mut jobs: Vec<Job> = self
            .find_by_commit(commit)?
            .into_iter()
            .filter(|(_, job)| !job.runs().is_empty())
            .map(|(id, job)| Job::new(id, &job, aliases))
            .collect();
        jobs.sort_by_key(|job| job.job_id);

        Ok(jobs)
    }
}

pub struct JobsSource<'a> {
    ctx: &'a Context,
    rid: RepoId,
}

impl FindJobs for JobsSource<'_> {
    fn find_by_commit(&self, oid: Oid) -> Result<Vec<(JobId, radicle_job::Job)>, ApiError> {
        let (repo, _) = self.ctx.repo(self.rid)?;
        let store = radicle_job::Jobs::open(&repo, radicle::cob::store::access::ReadOnly)?;
        let iter = radicle_job::Jobs::find_by_commit(&store, oid)?;

        Ok(iter.collect::<Result<_, _>>()?)
    }
}

/// Get jobs for a commit.
/// `GET /repos/:rid/jobs/:sha`
pub async fn handler(
    State(ctx): State<Context>,
    Path((rid, sha)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let jobs = crate::api::blocking(move || {
        let aliases = ctx.profile.aliases();
        JobsSource { ctx: &ctx, rid }.jobs_by_commit(sha, &aliases)
    })
    .await?;

    Ok::<_, ApiError>(Json(jobs))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::str::FromStr;

    use radicle::node::NodeId;

    use super::*;

    /// A [`FindJobs`] implementation backed by an in-memory list of jobs.
    struct StubJobs(Vec<(JobId, radicle_job::Job)>);

    impl FindJobs for StubJobs {
        fn find_by_commit(&self, _oid: Oid) -> Result<Vec<(JobId, radicle_job::Job)>, ApiError> {
            Ok(self.0.clone())
        }
    }

    fn job(job_id: &str, with_run: bool) -> (JobId, radicle_job::Job) {
        let oid = "e8c676b9e3b42308dc9d218b70faa5408f8e58ca";
        let runs = if with_run {
            serde_json::json!({
                "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi": {
                    "f1ad9c19-6f9c-4f1a-9a9e-1d0d3e7c1c2f": {
                        "status": "Started",
                        "log": "https://example.com/log",
                        "timestamp": 0,
                    }
                }
            })
        } else {
            serde_json::json!({})
        };
        let job: radicle_job::Job =
            serde_json::from_value(serde_json::json!({ "oid": oid, "runs": runs })).unwrap();

        (JobId::from_str(job_id).unwrap(), job)
    }

    #[test]
    fn jobs_without_runs_are_excluded() {
        let commit = Oid::from_str("e8c676b9e3b42308dc9d218b70faa5408f8e58ca").unwrap();
        let aliases: HashMap<NodeId, Alias> = HashMap::new();
        let source = StubJobs(vec![
            job("e8c676b9e3b42308dc9d218b70faa5408f8e58ca", false),
            job("a1b2c3d4e5f6071829304a5b6c7d8e9f00112233", true),
        ]);

        let jobs = source.jobs_by_commit(commit, &aliases).unwrap();

        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].runs.len(), 1);
    }
}
