use std::collections::HashSet;

use super::*;

#[test]
fn orphan_ids_returns_index_only_entries() {
    let current: HashSet<String> = ["a".to_string(), "b".to_string()].into();
    let in_index: HashSet<String> = ["b".to_string(), "c".to_string()].into();
    let mut orphans = orphan_ids(&current, &in_index);
    orphans.sort();
    assert_eq!(orphans, vec!["c".to_string()]);
}

#[test]
fn orphan_ids_drops_a_cob_removed_from_a_still_seeded_repo() {
    // Regression: cob orphan cleanup used to be rid-granular only, so a
    // single issue/patch removed from a repo that's still seeded was never
    // reconciled. `orphan_ids` (now reused for cob indexes too) diffs by
    // document id, so it catches this case as well as a fully unseeded rid.
    use std::str::FromStr;
    let rid = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
    let still_open = crate::index::cob::doc_id(rid, "e8c676b9e3b42308dc9d218b70faa5408f8e58ca");
    let redacted = crate::index::cob::doc_id(rid, "a1b2c3d4e5f6071829304a5b6c7d8e9f00112233");

    // Freshly built from the still-seeded repo: only the surviving issue.
    let current: HashSet<String> = [still_open.clone()].into();
    // What's still in the index from before the redaction.
    let in_index: HashSet<String> = [still_open, redacted.clone()].into();

    assert_eq!(orphan_ids(&current, &in_index), vec![redacted]);
}
