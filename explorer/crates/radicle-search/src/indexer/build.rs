use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Context, Result};
use radicle::Profile;
use radicle::cob::issue::{Issue, IssueId};
use radicle::cob::patch::{Patch, PatchId};
use radicle::identity::{Did, RepoId};
use radicle::node::address::Store as AddressStore;
use radicle::node::routing::Store as _;
use radicle::node::{Alias, NodeId};
use radicle::prelude::Doc;
use radicle::storage::{ReadRepository, ReadStorage};
use radicle_surf::Repository as SurfRepository;

use crate::index::{cob, inventory, node, policy, repo};

const ONE_YEAR_SECS: i64 = 52 * 7 * 24 * 60 * 60;

pub(crate) fn document(
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

    let (issue_counts, patch_counts) = match cob_counts(profile, &repo) {
        Ok(counts) => counts,
        Err(e) => {
            tracing::warn!("{rid}: cob counts unavailable ({e:#}); using zeros");
            (repo::IssueCounts::default(), repo::PatchCounts::default())
        }
    };

    Ok(repo::Document::new(
        rid,
        doc,
        activity,
        seeding_count,
        issue_counts,
        patch_counts,
    ))
}

pub(crate) fn collect_dids(dids: impl IntoIterator<Item = Did>) -> Vec<Did> {
    let set: std::collections::BTreeSet<Did> = dids.into_iter().collect();
    set.into_iter().collect()
}

pub(crate) fn issue_document(rid: RepoId, id: &IssueId, issue: &Issue) -> Result<cob::Document> {
    let comments: Vec<String> = issue
        .comments()
        .map(|(_, comment)| comment.body().to_string())
        .collect();
    let dids = collect_dids(
        std::iter::once(*issue.author().id())
            .chain(issue.assignees().copied())
            .chain(issue.comments().flat_map(|(_, c)| {
                std::iter::once(Did::from(c.author()))
                    .chain(c.reactions().into_values().flatten().map(Did::from))
            })),
    );

    Ok(cob::Document {
        v: crate::index::SCHEMA_VERSION,
        id: cob::doc_id(rid, id),
        rid,
        cob_id: id.to_string(),
        state: issue.state().to_string(),
        timestamp: issue.timestamp().as_secs() as i64,
        title: issue.title().to_string(),
        description: issue.description().to_string(),
        comments,
        dids,
        author_did: *issue.author().id(),
        assignee_dids: collect_dids(issue.assignees().copied()),
        labels: issue.labels().map(|l| l.name().to_string()).collect(),
        cob: serde_json::to_string(issue).context("serializing issue")?,
    })
}

pub(crate) fn patch_state_str(state: &radicle::patch::State) -> &'static str {
    use radicle::patch::State;
    match state {
        State::Draft => "draft",
        State::Open { .. } => "open",
        State::Archived => "archived",
        State::Merged { .. } => "merged",
    }
}

pub(crate) fn patch_document(rid: RepoId, id: &PatchId, patch: &Patch) -> Result<cob::Document> {
    let mut comments: Vec<String> = Vec::new();
    let mut dids: Vec<Did> = vec![*patch.author().id()];
    dids.extend(patch.assignees());
    for (nid, _) in patch.merges() {
        dids.push(Did::from(*nid));
    }
    for (i, (revision_id, revision)) in patch.revisions().enumerate() {
        dids.push(*revision.author().id());
        if i > 0 {
            comments.push(revision.description().to_string());
        }
        for (_, comment) in revision.discussion().comments() {
            comments.push(comment.body().to_string());
            dids.push(Did::from(comment.author()));
            dids.extend(comment.reactions().into_values().flatten().map(Did::from));
        }
        for (_, review) in patch.reviews_of(revision_id) {
            dids.push(*review.author().id());
        }
        dids.extend(
            revision
                .reactions()
                .values()
                .flat_map(|reactions| reactions.iter().map(|(pk, _)| Did::from(*pk))),
        );
    }

    Ok(cob::Document {
        v: crate::index::SCHEMA_VERSION,
        id: cob::doc_id(rid, id),
        rid,
        cob_id: id.to_string(),
        state: patch_state_str(patch.state()).to_string(),
        timestamp: patch.timestamp().as_secs() as i64,
        title: patch.title().to_string(),
        description: patch.description().to_string(),
        comments,
        dids: collect_dids(dids),
        author_did: *patch.author().id(),
        assignee_dids: collect_dids(patch.assignees()),
        labels: patch.labels().map(|l| l.name().to_string()).collect(),
        cob: serde_json::to_string(patch).context("serializing patch")?,
    })
}

pub(crate) fn node_alias(follow_alias: Option<Alias>, announced: Option<Alias>) -> Option<String> {
    follow_alias.or(announced).map(|a| a.to_string())
}

pub(crate) fn node_documents(
    profile: &Profile,
    db: &radicle::node::Database,
    extra_nids: impl IntoIterator<Item = NodeId>,
) -> Result<Vec<node::Document>> {
    let mut follows: BTreeMap<NodeId, Option<Alias>> = BTreeMap::new();
    for policy in profile.policies()?.follow_policies()? {
        let policy = policy?;
        follows.insert(policy.nid, policy.alias);
    }

    let mut nids: BTreeSet<NodeId> = follows.keys().copied().collect();
    nids.insert(profile.public_key);
    nids.extend(extra_nids);
    for entry in AddressStore::entries(db)? {
        nids.insert(entry.node);
    }

    let mut docs = Vec::with_capacity(nids.len());
    for nid in nids {
        let announced = AddressStore::get(db, &nid)?;
        let alias = node_alias(
            follows.get(&nid).cloned().flatten(),
            announced.as_ref().map(|n| n.alias.clone()),
        );
        let agent = announced.map(|n| n.agent.to_string());
        docs.push(node::Document::new(nid, alias, agent));
    }
    Ok(docs)
}

pub(crate) fn policy_documents(profile: &Profile) -> Result<Vec<policy::Document>> {
    let policies = profile.policies()?;
    let mut docs = Vec::new();
    for seed_policy in policies.seed_policies()? {
        docs.push(policy::Document::new(seed_policy?));
    }
    Ok(docs)
}

pub(crate) fn inventory_documents(
    entries: impl Iterator<Item = (RepoId, NodeId)>,
) -> Vec<inventory::Document> {
    let mut by_node: BTreeMap<NodeId, Vec<RepoId>> = BTreeMap::new();
    for (rid, nid) in entries {
        by_node.entry(nid).or_default().push(rid);
    }
    by_node
        .into_iter()
        .map(|(nid, repos)| inventory::Document::new(nid, repos))
        .collect()
}

fn cob_counts(
    profile: &Profile,
    repo: &radicle::storage::git::Repository,
) -> Result<(repo::IssueCounts, repo::PatchCounts)> {
    use radicle::issue::cache::Issues as _;
    use radicle::patch::cache::Patches as _;

    let issues = profile.issues(repo)?.counts()?;
    let patches = profile.patches(repo)?.counts()?;
    Ok((
        repo::IssueCounts {
            open: issues.open,
            closed: issues.closed,
        },
        repo::PatchCounts {
            open: patches.open,
            draft: patches.draft,
            archived: patches.archived,
            merged: patches.merged,
        },
    ))
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

#[cfg(test)]
mod tests {
    use super::*;
    use radicle::issue::cache::Issues as _;
    use radicle::patch::cache::Patches as _;
    use std::str::FromStr;

    #[test]
    fn collect_dids_dedups_and_sorts() {
        let a = radicle::identity::Did::from_str(
            "did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi",
        )
        .unwrap();
        let dids = collect_dids([a, a]);
        assert_eq!(dids, vec![a]);
    }

    #[test]
    fn comment_reaction_authors_are_collectible() {
        use radicle::cob::thread::Comment;

        let author = "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi";
        let reactor = "z6MksFqXN3Yhqk8pTJdUGLwATkRfQvwZXPqR2qMEhbS9wzpT";
        let comment: Comment = serde_json::from_value(serde_json::json!({
            "author": author,
            "edits": [{"author": author, "timestamp": 0, "body": "hi", "embeds": []}],
            "reactions": [[reactor, "👍"]],
            "resolved": false,
        }))
        .unwrap();

        // Mirrors the reaction-to-did mapping added to issue_document and
        // patch_document, so a reactor who never comments still shows up in
        // the document's dids (and thus gets their alias resolved).
        let dids: Vec<Did> = comment
            .reactions()
            .into_values()
            .flatten()
            .map(Did::from)
            .collect();

        assert_eq!(
            dids,
            vec![Did::from_str(&format!("did:key:{reactor}")).unwrap()]
        );
    }

    #[test]
    fn patch_document_extracts_fields() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let repo = radicle::storage::ReadStorage::repository(&profile.storage, rid).unwrap();
        let patches = profile.patches(&repo).unwrap();
        let (id, patch) = patches.list().unwrap().next().unwrap().unwrap();

        let doc = patch_document(rid, &id, &patch).unwrap();

        assert_eq!(doc.state, "open");
        assert_eq!(doc.title, "A new hello world");
        assert_eq!(
            doc.description,
            "change hello world in README to something else"
        );
        assert!(!doc.dids.is_empty());
        assert_eq!(doc.author_did, Did::from(profile.public_key));
        assert!(doc.assignee_dids.is_empty());
        assert_eq!(doc.labels, vec!["bug".to_string()]);
        let roundtrip: radicle::patch::Patch = serde_json::from_str(&doc.cob).unwrap();
        assert_eq!(roundtrip.title(), patch.title());
    }

    #[test]
    fn issue_document_extracts_filter_fields() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let repo = radicle::storage::ReadStorage::repository(&profile.storage, rid).unwrap();
        let issues = profile.issues(&repo).unwrap();
        let (id, issue) = issues.list().unwrap().next().unwrap().unwrap();
        let me = Did::from(profile.public_key);

        let doc = issue_document(rid, &id, &issue).unwrap();

        assert_eq!(doc.author_did, me);
        assert_eq!(doc.assignee_dids, vec![me]);
        assert_eq!(doc.labels, vec!["bug".to_string()]);
    }

    #[test]
    fn patch_state_maps_all_variants() {
        use radicle::patch::State;
        assert_eq!(patch_state_str(&State::Draft), "draft");
        assert_eq!(patch_state_str(&State::Open { conflicts: vec![] }), "open");
        assert_eq!(patch_state_str(&State::Archived), "archived");
    }

    #[test]
    fn repo_document_includes_cob_counts() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let db = profile.database().unwrap();
        let doc_at = {
            let repo = radicle::storage::ReadStorage::repository(&profile.storage, rid).unwrap();
            radicle::storage::ReadRepository::identity_doc(&repo).unwrap()
        };

        let doc = document(&profile, &db, rid, &doc_at.doc).unwrap().unwrap();

        assert_eq!(doc.issue_counts.open, 1);
        assert_eq!(doc.issue_counts.closed, 0);
        assert_eq!(doc.patch_counts.open, 1);
        assert_eq!(doc.patch_counts.merged, 0);
        let json = serde_json::to_value(&doc).unwrap();
        assert_eq!(json["issueCounts"]["open"], 1);
        assert_eq!(json["patchCounts"]["open"], 1);
        assert_eq!(json["v"], 1);
    }

    #[test]
    fn issue_document_extracts_fields() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let repo = radicle::storage::ReadStorage::repository(&profile.storage, rid).unwrap();
        let issues = profile.issues(&repo).unwrap();
        let (id, issue) = issues.list().unwrap().next().unwrap().unwrap();

        let doc = issue_document(rid, &id, &issue).unwrap();

        assert_eq!(doc.v, crate::index::SCHEMA_VERSION);
        assert_eq!(doc.id, crate::index::cob::doc_id(rid, id));
        assert_eq!(doc.rid, rid);
        assert_eq!(doc.state, "open");
        assert_eq!(doc.title, "Issue #1");
        assert_eq!(doc.description, "Change 'hello world' to 'hello everyone'");
        assert!(doc.comments.iter().any(|c| c.contains("hello everyone")));
        assert!(!doc.dids.is_empty());
        assert!(doc.timestamp > 0);
        let roundtrip: radicle::issue::Issue = serde_json::from_str(&doc.cob).unwrap();
        assert_eq!(roundtrip.title(), issue.title());
    }

    #[test]
    fn node_alias_prefers_follow_alias() {
        let follow = radicle::node::Alias::new("local-name");
        let announced = radicle::node::Alias::new("announced");
        assert_eq!(
            node_alias(Some(follow), Some(announced.clone())),
            Some("local-name".to_string())
        );
        assert_eq!(
            node_alias(None, Some(announced)),
            Some("announced".to_string())
        );
        assert_eq!(node_alias(None, None), None);
    }

    #[test]
    fn inventory_documents_group_by_node() {
        use std::str::FromStr;
        let n1 =
            radicle::node::NodeId::from_str("z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi")
                .unwrap();
        let r1 = radicle::identity::RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let r2 = radicle::identity::RepoId::from_str("rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE").unwrap();

        let docs = inventory_documents([(r1, n1), (r2, n1)].into_iter());

        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].id, n1.to_string());
        assert_eq!(docs[0].repos.len(), 2);
    }

    #[test]
    fn fixture_produces_node_policy_and_inventory_docs() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let db = profile.database().unwrap();

        let nodes = node_documents(&profile, &db, std::iter::empty()).unwrap();
        assert!(
            nodes
                .iter()
                .any(|d| d.nid == profile.public_key && d.alias.as_deref() == Some("seed"))
        );

        let policies = policy_documents(&profile).unwrap();
        assert!(policies.iter().any(|d| d.rid == rid));
    }

    #[test]
    fn node_documents_includes_extra_nids_without_address_entries() {
        use radicle::crypto::{Seed, Signer, SigningKey};
        use radicle::node::{Features, Timestamp, UserAgent};

        let (_tmp, profile, _rid) = crate::test::fixture();
        let remote_signer = SigningKey::from_seed(Seed::new([0x11; 32]));
        let remote_nid = *remote_signer.public_key();
        let remote_alias = radicle::node::Alias::new("remote-peer");

        profile
            .database_mut()
            .unwrap()
            .init(
                &remote_nid,
                Features::SEED,
                &remote_alias,
                &UserAgent::default(),
                Timestamp::try_from(crate::test::TIMESTAMP + 1).unwrap(),
                [],
            )
            .unwrap();
        let db = profile.database().unwrap();

        let without_extra = node_documents(&profile, &db, std::iter::empty()).unwrap();
        assert!(!without_extra.iter().any(|d| d.nid == remote_nid));

        let with_extra = node_documents(&profile, &db, [remote_nid]).unwrap();
        assert!(
            with_extra
                .iter()
                .any(|d| d.nid == remote_nid && d.alias.as_deref() == Some("remote-peer"))
        );
    }
}
