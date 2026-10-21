mod orphans;
mod plan;

use radicle::git::Oid;
use radicle::identity::RepoId;

use super::*;

fn rid(seed: u8) -> RepoId {
    RepoId::from(Oid::from_sha1([seed; 20]))
}

fn key(seed: u8) -> DocumentKey {
    DocumentKey::new(rid(seed))
}

fn seed(seed: u8, seeding_policy: SeedingPolicy) -> RepoSeed {
    RepoSeed {
        rid: rid(seed),
        seeding_policy,
    }
}
