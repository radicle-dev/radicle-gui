use std::collections::HashSet;

use super::*;

#[test]
fn in_sync() {
    let seeded = HashSet::from([key(1), key(2)]);
    let in_index = HashSet::from([key(1), key(2)]);
    assert!(orphans(seeded, &in_index).is_empty());
}

#[test]
fn detects_removed_repo() {
    let seeded = HashSet::from([key(1)]);
    let in_index = HashSet::from([key(1), key(2)]);
    assert_eq!(orphans(seeded, &in_index), vec![key(2)]);
}

#[test]
fn empty_index() {
    let seeded = HashSet::from([key(1)]);
    let in_index = HashSet::new();
    assert!(orphans(seeded, &in_index).is_empty());
}

#[test]
fn all_orphaned() {
    let seeded = HashSet::new();
    let in_index = HashSet::from([key(1), key(2)]);
    let mut result = orphans(seeded, &in_index);
    result.sort_by_key(|k| format!("{k}"));
    let mut expected = vec![key(1), key(2)];
    expected.sort_by_key(|k| format!("{k}"));
    assert_eq!(result, expected);
}

#[test]
fn both_empty() {
    assert!(orphans(HashSet::new(), &HashSet::new()).is_empty());
}

#[test]
fn disjoint_sets() {
    let seeded = HashSet::from([key(1)]);
    let in_index = HashSet::from([key(2)]);
    assert_eq!(orphans(seeded, &in_index), vec![key(2)]);
}
