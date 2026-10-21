use std::collections::HashSet;

use super::*;

fn repositories(repos: impl IntoIterator<Item = RepoId>) -> HashSet<RepoId> {
    repos.into_iter().collect()
}

#[test]
fn seeding_new_repo() {
    let b = Bootstrap::new(HashSet::new());
    let repos = [seed(1, SeedingPolicy::IsSeeding)];
    let plan = b.plan(repos.into_iter());

    assert_eq!(plan.to_index, repositories([rid(1)]));
    assert!(plan.seeded.contains(&key(1)));
}

#[test]
fn seeding_previously_seeded() {
    let b = Bootstrap::new(HashSet::from([key(1)]));
    let repos = [seed(1, SeedingPolicy::IsSeeding)];
    let plan = b.plan(repos.into_iter());

    assert_eq!(plan.to_index, repositories([rid(1)]));
    assert!(plan.seeded.contains(&key(1)));
}

#[test]
fn not_seeding_new_repo() {
    let b = Bootstrap::new(HashSet::new());
    let repos = [seed(1, SeedingPolicy::NotSeeding)];
    let plan = b.plan(repos.into_iter());

    assert!(plan.to_index.is_empty());
    assert!(!plan.seeded.contains(&key(1)));
}

#[test]
fn not_seeding_drops_previously_seeded() {
    let b = Bootstrap::new(HashSet::from([key(1)]));
    let repos = [seed(1, SeedingPolicy::NotSeeding)];
    let plan = b.plan(repos.into_iter());

    assert!(plan.to_index.is_empty());
    assert!(
        !plan.seeded.contains(&key(1)),
        "un-seeded repo must be dropped from seeded set"
    );
}

#[test]
fn error_preserves_previously_seeded() {
    let b = Bootstrap::new(HashSet::from([key(1)]));
    let repos = [seed(1, SeedingPolicy::LookupFailure)];
    let plan = b.plan(repos.into_iter());

    assert!(
        plan.to_index.is_empty(),
        "should not re-index on transient failure"
    );
    assert!(
        plan.seeded.contains(&key(1)),
        "cache entry must be preserved on transient failure"
    );
}

#[test]
fn error_skips_unknown_repo() {
    let b = Bootstrap::new(HashSet::new());
    let repos = [seed(1, SeedingPolicy::LookupFailure)];
    let plan = b.plan(repos.into_iter());

    assert!(plan.to_index.is_empty());
    assert!(!plan.seeded.contains(&key(1)));
}

#[test]
fn empty_input() {
    let b = Bootstrap::new(HashSet::from([key(1)]));
    let repos: [RepoSeed; 0] = [];
    let plan = b.plan(repos.into_iter());

    assert!(plan.to_index.is_empty());
    assert!(plan.seeded.is_empty());
}

#[test]
fn mixed_policies() {
    let previous = HashSet::from([key(3)]);
    let b = Bootstrap::new(previous);
    let repos = [
        seed(1, SeedingPolicy::IsSeeding),
        seed(2, SeedingPolicy::NotSeeding),
        seed(3, SeedingPolicy::LookupFailure),
        seed(4, SeedingPolicy::IsSeeding),
    ];
    let plan = b.plan(repos.into_iter());

    assert_eq!(plan.to_index, repositories([rid(1), rid(4)]));
    assert!(plan.seeded.contains(&key(1)));
    assert!(!plan.seeded.contains(&key(2)));
    assert!(plan.seeded.contains(&key(3)));
    assert!(plan.seeded.contains(&key(4)));
}
