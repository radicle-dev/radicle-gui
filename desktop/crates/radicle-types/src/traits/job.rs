use radicle::cob::store::access::ReadOnly;
use radicle::storage::ReadStorage;
use radicle::{git, identity};
use radicle_job::{Job, JobId, Jobs as JobsStore};

use crate::cobs::job;
use crate::error::Error;
use crate::traits::Profile;

pub trait Jobs: Profile {
    fn list_jobs(&self, rid: identity::RepoId, sha: git::Oid) -> Result<Vec<job::Job>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let aliases = &profile.aliases();

        let jobs = JobsStore::open(&repo, ReadOnly)?;
        let found_jobs: Result<Vec<(JobId, Job)>, _> = jobs.find_by_commit(sha)?.collect();

        Ok(found_jobs?
            .into_iter()
            .filter(|(_, job)| !job.runs().is_empty())
            .map(|(id, job)| job::Job::new(id, &job, aliases))
            .collect())
    }
}
