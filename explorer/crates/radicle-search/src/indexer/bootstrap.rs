#[cfg(test)]
mod test;

use std::collections::HashSet;

use radicle::identity::RepoId;

use crate::index::repo::DocumentKey;

/// One entry per public repository found in storage.
#[derive(Clone, Copy, Debug)]
pub(crate) struct RepoSeed {
    /// The identifier of the repository.
    pub rid: RepoId,
    /// The determined policy of the given repository.
    pub seeding_policy: SeedingPolicy,
}

#[derive(Clone, Copy, Debug)]
/// Result of determining the seeding policy of a repository.
pub(crate) enum SeedingPolicy {
    /// The repository is being seeded.
    IsSeeding,
    /// The repository is not being seeded.
    NotSeeding,
    /// Could not determine the seeding policy of the repository.
    LookupFailure,
}

/// Output of [`Bootstrap::plan`].
#[derive(Debug, Default)]
pub(crate) struct BootstrapPlan {
    /// Repos whose documents should be built and upserted.
    pub to_index: HashSet<RepoId>,
    /// The new seeded set, including preserved entries from prior state.
    pub seeded: HashSet<DocumentKey>,
}

impl BootstrapPlan {
    fn index(&mut self, rid: RepoId) {
        self.to_index.insert(rid);
    }

    fn seed(&mut self, key: DocumentKey) {
        self.seeded.insert(key);
    }
}

/// [`Bootstrap`] handles the decision of whether incoming [`RepoSeed`]s should
/// be indexed, and computes the new seeded set.
pub(crate) struct Bootstrap {
    previous_seeded: HashSet<DocumentKey>,
}

impl Bootstrap {
    /// Construct a new [`Bootstrap`] from a previously seeded set of [`DocumentKey`]s.
    pub fn new(previous_seeded: HashSet<DocumentKey>) -> Self {
        Self { previous_seeded }
    }

    /// Decide which repos to index based on seeding policy results.
    ///
    /// For each [`RepoSeed`]:
    /// - If it is [`SeedingPolicy::IsSeeding`] then it is marked for indexing and as
    ///   part of the seeded set.
    /// - If it is [`SeedingPolicy::NotSeeding`] then it is not marked for
    ///   either indexing nor the seeded set.
    /// - If it is [`SeedingPolicy::LookupFailure`] then it preserves whether it
    ///   was in the previously seeded set.
    pub fn plan(self, repos: impl Iterator<Item = RepoSeed>) -> BootstrapPlan {
        repos.fold(BootstrapPlan::default(), |mut plan, repo| {
            let key = DocumentKey::new(repo.rid);
            match repo.seeding_policy {
                SeedingPolicy::IsSeeding => {
                    plan.index(repo.rid);
                    plan.seed(key);
                }
                SeedingPolicy::NotSeeding => {}
                SeedingPolicy::LookupFailure => {
                    if self.previous_seeded.contains(&key) {
                        plan.seed(key);
                    }
                }
            }
            plan
        })
    }
}

/// Compute orphan document keys to delete from the index.
///
/// Returns keys present in `in_index` but absent from `seeded`.
pub(crate) fn orphans(
    seeded: HashSet<DocumentKey>,
    in_index: &HashSet<DocumentKey>,
) -> Vec<DocumentKey> {
    in_index.difference(&seeded).copied().collect()
}
