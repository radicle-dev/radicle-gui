use radicle::git;
use radicle::node::AliasStore;
use serde::Serialize;
use ts_rs::TS;
use url::Url;

use crate::cobs;

#[derive(Clone, Serialize, TS, Debug)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Job {
    #[ts(as = "String")]
    pub job_id: radicle_job::JobId,
    #[ts(as = "String")]
    pub commit: git::Oid,
    pub runs: Vec<Run>,
}

impl PartialEq for Job {
    fn eq(&self, other: &Self) -> bool {
        self.job_id == other.job_id && self.commit == other.commit && self.runs == other.runs
    }
}

impl Job {
    pub fn new(id: radicle_job::JobId, job: &radicle_job::Job, aliases: &impl AliasStore) -> Self {
        Self {
            job_id: id,
            commit: *job.oid(),
            runs: job
                .runs()
                .iter()
                .flat_map(|(node_id, runs)| {
                    runs.into_iter().map(|(run_id, run)| Run {
                        run_id: run_id.to_string(),
                        node: cobs::Author::new(&(*node_id).into(), aliases),
                        status: (*run.status()).into(),
                        log: run.log().clone(),
                    })
                })
                .collect(),
        }
    }
}

#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct Run {
    pub run_id: String,
    pub node: cobs::Author,
    pub status: Status,
    #[ts(as = "String")]
    pub log: Url,
}

#[derive(Clone, Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub enum Status {
    Started,
    Failed,
    Succeeded,
}

impl From<radicle_job::Status> for Status {
    fn from(value: radicle_job::Status) -> Self {
        match value {
            radicle_job::Status::Started => Self::Started,
            radicle_job::Status::Finished(reason) => match reason {
                radicle_job::Reason::Failed => Self::Failed,
                radicle_job::Reason::Succeeded => Self::Succeeded,
            },
        }
    }
}
