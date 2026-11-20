use radicle::cob::store::access::ReadOnly;
use radicle::identity;
use radicle::storage::ReadStorage;
use radicle_job::{Job, JobId, Jobs as JobsStore};

use crate::cobs::job;
use crate::error::Error;
use crate::traits::Profile;

pub trait Jobs: Profile {
    /// Every job of the repository that has runs. Finding one commit's jobs
    /// scans them all anyway, so views share one scan and pick their commits.
    fn list_jobs(&self, rid: identity::RepoId) -> Result<Vec<job::Job>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let aliases = &profile.aliases();

        let jobs = JobsStore::open(&repo, ReadOnly)?;
        let found_jobs: Result<Vec<(JobId, Job)>, _> = jobs
            .all()?
            .map(|job| job.map(|(id, job)| (JobId::from(id), job)))
            .collect();

        Ok(found_jobs?
            .into_iter()
            .filter(|(_, job)| !job.runs().is_empty())
            .map(|(id, job)| job::Job::new(id, &job, aliases))
            .collect())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::convert::Infallible;

    use radicle::cob::store::access::WriteAs;
    use radicle::cob::{self, Contents, Create, Entry, Evaluate, Version};
    use radicle::crypto::{Seed, SigningKey};
    use radicle::git::Oid;
    use radicle::storage::ReadStorage;
    use radicle::test::fixtures;
    use radicle_job::{Jobs as JobsStore, TYPENAME};

    use crate::traits::job::Jobs;
    use crate::{AppState, test};

    /// Accepts any contents, to write a job that the job store can't load.
    struct Raw;

    impl<R> Evaluate<R> for Raw {
        type Error = Infallible;

        fn init(_: &Entry, _: &R) -> Result<Self, Self::Error> {
            Ok(Raw)
        }

        fn apply<'a, I: Iterator<Item = (&'a Oid, &'a Entry)>>(
            &mut self,
            _: &Entry,
            _: I,
            _: &R,
        ) -> Result<(), Self::Error> {
            Ok(())
        }
    }

    #[test]
    fn list_jobs_skips_jobs_that_cannot_be_loaded() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("working"), &profile.storage, &signer).unwrap();
        let repo = profile.storage.repository(rid).unwrap();

        let mut jobs = JobsStore::open(&repo, WriteAs::new(&signer)).unwrap();
        let mut job = jobs.create(head.into()).unwrap();
        job.run(
            serde_json::from_str("\"67e55044-10b1-426f-9247-bb680e5fe0c8\"").unwrap(),
            "https://ci.example/1".parse().unwrap(),
        )
        .unwrap();
        let id = job.id;

        cob::create::<Raw, _>(
            &repo,
            &signer,
            None,
            vec![],
            &profile.public_key,
            Create {
                contents: Contents::new(b"not a job action".to_vec()),
                type_name: TYPENAME.clone(),
                message: "Broken job".to_string(),
                embeds: vec![],
                version: Version::default(),
            },
        )
        .unwrap();

        let state = AppState { profile };
        let listed = state.list_jobs(rid).unwrap();
        assert_eq!(
            listed.iter().map(|job| job.job_id).collect::<Vec<_>>(),
            vec![id]
        );
    }
}
