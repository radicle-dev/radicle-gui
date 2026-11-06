use radicle::cob::Title;
use radicle::crypto::{PublicKey, Seed, Signer as _, SigningKey};
use radicle::identity::{Did, Identity, RepoId};
use radicle::storage::{
    ReadRepository, ReadStorage, RemoteRepository as _, SignRepository, WriteRepository as _,
    WriteStorage,
};

use std::str::FromStr as _;

use radicle::identity::doc::PayloadId;

use super::Actor;
use crate::actor;
use crate::actor::{ActorProfile, Enrollment};
use crate::cobs::CobOptions;
use crate::error::Error;
use crate::{AppState, test};

fn quiet() -> CobOptions {
    serde_json::from_value(serde_json::json!({ "announce": false })).unwrap()
}

fn named(display_name: &str) -> ActorProfile {
    serde_json::from_value(serde_json::json!({ "version": 1, "displayName": display_name }))
        .unwrap()
}

/// An app whose key, of seed `0xff`, made the actor alice.
fn actor_state() -> (tempfile::TempDir, AppState, RepoId) {
    let tmp = tempfile::tempdir().unwrap();
    let state = AppState {
        profile: test::profile(&tmp.path().join("home"), [0xff; 32]),
    };
    let rid = state.create_actor(named("alice"), quiet()).unwrap().rid;
    (tmp, state, rid)
}

fn key(seed: u8) -> SigningKey {
    SigningKey::from_seed(Seed::new([seed; 32]))
}

fn oid(repo: &radicle::storage::git::Repository, name: &str) -> Option<radicle::git::raw::Oid> {
    repo.backend.refname_to_id(name).ok()
}

#[test]
fn a_failed_signing_leaves_both_branches_as_they_were() {
    let (_tmp, state, rid) = actor_state();
    let repo = state.profile.storage.repository(rid).unwrap();
    let key = state.profile.public_key;
    let local = format!("refs/namespaces/{key}/refs/heads/main");
    let canonical = "refs/heads/main";
    let before = (oid(&repo, &local), oid(&repo, canonical));

    // Git refuses to write a ref whose lock file exists, so signing fails.
    let lock = repo
        .path()
        .join(format!("refs/namespaces/{key}/refs/rad/sigrefs.lock"));
    std::fs::create_dir_all(lock.parent().unwrap()).unwrap();
    std::fs::write(&lock, "").unwrap();

    assert!(state.update_actor_profile(named("bob"), quiet()).is_err());
    assert_eq!((oid(&repo, &local), oid(&repo, canonical)), before);
    let shown = state.actor().unwrap().unwrap().profile.unwrap();
    assert_eq!(shown.display_name, "alice");

    std::fs::remove_file(&lock).unwrap();
    let saved = state.update_actor_profile(named("bob"), quiet()).unwrap();
    assert_eq!(saved.profile.unwrap().display_name, "bob");
}

#[test]
fn a_key_that_cannot_publish_alone_writes_only_its_own_branch() {
    let (_tmp, state, rid) = actor_state();
    // A second controller and a threshold of two: the canonical branch
    // has no quorum until the other key carries the same commit.
    share_with(&state, rid, &key(0xee), 2);
    let repo = state.profile.storage.repository(rid).unwrap();
    let key = state.profile.public_key;
    let local = format!("refs/namespaces/{key}/refs/heads/main");
    let canonical = "refs/heads/main";
    let before = (oid(&repo, &local), oid(&repo, canonical));

    state.update_actor_profile(named("bob"), quiet()).unwrap();

    assert_ne!(
        oid(&repo, &local),
        before.0,
        "the edit is on the local branch"
    );
    assert_eq!(
        oid(&repo, canonical),
        before.1,
        "the canonical branch stays put"
    );
    let refs = repo.remote(&key).unwrap().refs;
    assert_eq!(
        refs.get(&radicle::git::fmt::qualified!("refs/heads/main")),
        oid(&repo, &local).map(Into::into),
        "the edit is signed"
    );
}

/// The identity COB of the local key, as its namespace holds it.
fn local_cob(repo: &radicle::storage::git::Repository, key: &PublicKey) -> Option<String> {
    repo.backend
        .references_glob(&format!("refs/namespaces/{key}/refs/cobs/xyz.radicle.id/*"))
        .unwrap()
        .next()
        .and_then(|r| r.ok()?.target())
        .map(|oid| oid.to_string())
}

/// The identity COB of the local key, as its signed refs vouch for it.
fn signed_cob(repo: &radicle::storage::git::Repository, key: &PublicKey) -> Option<String> {
    repo.remote(key)
        .unwrap()
        .refs
        .iter()
        .find(|(name, _)| name.starts_with("refs/cobs/xyz.radicle.id/"))
        .map(|(_, oid)| oid.to_string())
}

#[test]
fn a_retry_signs_a_vote_the_store_could_not() {
    let (_tmp, state, rid) = actor_state();
    // Two controllers: the enrollment stays open with this key's vote on it.
    share_with(&state, rid, &key(0xee), 2);
    let joining = key(0xdd);
    let code = code(&state, &joining);
    let repo = state.profile.storage.repository(rid).unwrap();
    let key = state.profile.public_key;

    // The store writes the vote, then fails to sign the refs: the vote is
    // in the identity, and no peer can see it.
    let lock = repo
        .path()
        .join(format!("refs/namespaces/{key}/refs/rad/sigrefs.lock"));
    std::fs::create_dir_all(lock.parent().unwrap()).unwrap();
    std::fs::write(&lock, "").unwrap();
    assert!(
        state
            .approve_enrollment(code.clone(), true, quiet())
            .is_err()
    );
    assert_ne!(signed_cob(&repo, &key), local_cob(&repo, &key));
    std::fs::remove_file(&lock).unwrap();

    // The retry finds the vote cast already and publishes it.
    let info = state.approve_enrollment(code, true, quiet()).unwrap();
    assert_eq!(info.pending.len(), 1);
    assert!(info.pending[0].accepted.contains(&Did::from(key)));
    assert_eq!(signed_cob(&repo, &key), local_cob(&repo, &key));
}

#[test]
fn a_failed_canonical_move_undoes_the_edit() {
    let (_tmp, state, rid) = actor_state();
    // Two controllers under a threshold of one: this key moves the
    // canonical branch alone, and a failure to is not a split.
    share_with(&state, rid, &key(0xee), 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    let key = state.profile.public_key;
    let local = format!("refs/namespaces/{key}/refs/heads/main");
    let canonical = "refs/heads/main";
    let before = (oid(&repo, &local), oid(&repo, canonical));

    let lock = repo.path().join("refs/heads/main.lock");
    std::fs::write(&lock, "").unwrap();
    let refused = state
        .update_actor_profile(named("bob"), quiet())
        .unwrap_err();
    assert!(
        !matches!(refused, Error::Actor(actor::Error::Diverged)),
        "a locked ref is no split: {refused}"
    );
    assert_eq!((oid(&repo, &local), oid(&repo, canonical)), before);

    std::fs::remove_file(&lock).unwrap();
    let saved = state.update_actor_profile(named("bob"), quiet()).unwrap();
    assert_eq!(saved.profile.unwrap().display_name, "bob");
}

/// The consent of `joining` to the local actor as it is now.
fn code(state: &AppState, joining: &SigningKey) -> String {
    let actor = state.actor().unwrap().unwrap();
    let repo = state.profile.storage.repository(actor.rid).unwrap();
    Enrollment::sign(actor.rid, repo.identity().unwrap().current, joining).encode()
}

#[test]
fn a_withdrawn_enrollment_does_not_break_the_next_binding() {
    let (_tmp, state, rid) = actor_state();

    // A second controller, so the next enrollments wait for its vote.
    let other = key(0xee);
    let code_of_other = code(&state, &other);
    state
        .approve_enrollment(code_of_other, true, quiet())
        .unwrap();

    // An enrollment proposed and withdrawn leaves its proposal and the
    // withdrawal in the identity's history, beside the accepted chain.
    let withdrawn = key(0x11);
    let pending = state
        .approve_enrollment(code(&state, &withdrawn), true, quiet())
        .unwrap()
        .pending;
    state
        .withdraw_actor_revision(pending[0].id, quiet())
        .unwrap();

    let joining = key(0x22);
    let pending = state
        .approve_enrollment(code(&state, &joining), true, quiet())
        .unwrap()
        .pending;
    {
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        Identity::load_mut(&repo, &other)
            .unwrap()
            .accept(&pending[0].id)
            .unwrap();
        repo.set_identity_head().unwrap();
    }

    let actor = state.actor().unwrap().unwrap();
    let bound = actor
        .keys
        .iter()
        .filter(|key| key.bound)
        .map(|key| key.did)
        .collect::<Vec<_>>();
    assert!(bound.contains(&Did::from(*joining.public_key())));
    assert!(bound.contains(&Did::from(*other.public_key())));
    assert!(!bound.contains(&Did::from(*withdrawn.public_key())));
    assert!(actor.pending.is_empty());
}

/// Copies `from` into `to`, so a second app can hold a repository the first
/// made without a node between them.
fn copy_dir(from: &std::path::Path, to: &std::path::Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

#[test]
fn a_key_joins_an_actor_it_holds_a_copy_of_and_nothing_else() {
    let (tmp, state, rid) = actor_state();
    let joining = key(0xee);
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };

    // The key that made the actor has one, whatever repository it names.
    let refused = state.join_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::Exists(existing)) if existing == rid));

    // Without a copy there is nothing to consent to; a block the user set is
    // named over the missing copy.
    let refused = other.join_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::NotFetched(r)) if r == rid));
    other
        .profile
        .policies_mut()
        .unwrap()
        .set_seed_policy(&rid, radicle::node::policy::Policy::Block)
        .unwrap();
    let refused = other.join_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::Blocked(r)) if r == rid));

    let repo_path = radicle::storage::git::paths::repository(&state.profile.storage, &rid);
    copy_dir(
        &repo_path,
        &radicle::storage::git::paths::repository(&other.profile.storage, &rid),
    );
    let code = other.join_actor(rid).unwrap();
    let enrollment = Enrollment::decode(&code).unwrap();
    assert_eq!(enrollment.did, Did::from(*joining.public_key()));

    // The code is the one the actor's controller can approve.
    let actor = state.approve_enrollment(code, false, quiet()).unwrap();
    assert!(
        actor
            .keys
            .iter()
            .any(|key| key.did == Did::from(*joining.public_key()) && key.bound)
    );

    // A retired actor is no longer one a key can join.
    let signer = key(0xff);
    {
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        let mut identity = Identity::load_mut(&repo, &signer).unwrap();
        let doc = identity
            .doc()
            .clone()
            .with_edits(|raw| {
                let payload = raw
                    .payload
                    .get_mut(&PayloadId::from_str("dev.radicle.actor").unwrap())
                    .unwrap()
                    .as_object_mut()
                    .unwrap();
                payload.insert("retired".into(), true.into());
            })
            .unwrap();
        identity
            .update(Title::new("Retire").unwrap(), "", &doc)
            .unwrap();
        repo.set_identity_head().unwrap();
        repo.sign_refs(&signer).unwrap();
    }
    let third = AppState {
        profile: test::profile(&tmp.path().join("third"), [0xdd; 32]),
    };
    copy_dir(
        &repo_path,
        &radicle::storage::git::paths::repository(&third.profile.storage, &rid),
    );
    let refused = third.join_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::NotJoinable(r)) if r == rid));
}

#[test]
fn only_the_proposer_withdraws_and_the_others_reject() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();

    // The other controller proposes the next enrollment.
    let joining = key(0x22);
    let enrollment = Enrollment::decode(&code(&state, &joining)).unwrap();
    {
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        let mut identity = Identity::load_mut(&repo, &other).unwrap();
        let doc = crate::actor::enrolled_doc(identity.doc(), &enrollment, true).unwrap();
        identity
            .update(Title::new("Enroll key").unwrap(), "", &doc)
            .unwrap();
    }
    let id = state.actor().unwrap().unwrap().pending[0].id;

    assert!(matches!(
        state.withdraw_actor_revision(id, quiet()),
        Err(Error::Actor(actor::Error::NotAuthor))
    ));
    let after = state.reject_actor_revision(id, quiet()).unwrap();
    assert!(after.pending.iter().all(|open| open.id != id));
    assert!(
        !after
            .keys
            .iter()
            .any(|key| key.did == Did::from(*joining.public_key()))
    );
}

#[test]
fn a_payload_from_a_newer_app_is_never_signed() {
    let (_tmp, state, rid) = actor_state();
    let signer = key(0xff);
    {
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        let mut identity = Identity::load_mut(&repo, &signer).unwrap();
        let doc = identity
            .doc()
            .clone()
            .with_edits(|raw| {
                let payload = raw
                    .payload
                    .get_mut(&PayloadId::from_str("dev.radicle.actor").unwrap())
                    .unwrap()
                    .as_object_mut()
                    .unwrap();
                payload.insert("version".into(), 2.into());
            })
            .unwrap();
        identity
            .update(Title::new("A newer payload").unwrap(), "", &doc)
            .unwrap();
        repo.sign_refs(&signer).unwrap();
        repo.set_identity_head().unwrap();
    }
    assert!(state.actor().unwrap().unwrap().payload_newer);

    let joining = key(0x22);
    let refused = state.approve_enrollment(code(&state, &joining), true, quiet());
    assert!(matches!(
        refused,
        Err(Error::Actor(actor::Error::PayloadNewer))
    ));
    assert!(state.actor().unwrap().unwrap().pending.is_empty());

    // A code for another actor says so first, whatever this key may do.
    let elsewhere = RepoId::from_str("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5").unwrap();
    let repo = state.profile.storage.repository(rid).unwrap();
    let parent = repo.identity().unwrap().current;
    let foreign = Enrollment::sign(elsewhere, parent, &joining).encode();
    assert!(matches!(
        state.decode_enrollment(foreign),
        Err(Error::Actor(actor::Error::WrongActor(other))) if other == elsewhere
    ));
}

/// Makes `other` a second controller, under `threshold` for profile edits:
/// two, and an edit by the local key only proposes.
fn share_with(state: &AppState, rid: RepoId, other: &SigningKey, threshold: usize) {
    let signer = key(0xff);
    let repo = state.profile.storage.repository_mut(rid).unwrap();
    let mut identity = Identity::load_mut(&repo, &signer).unwrap();
    let mut doc = identity.doc().clone().edit();
    doc.delegate(Did::from(*other.public_key()));
    doc.threshold = threshold;
    identity
        .update(
            Title::new("Add a controller").unwrap(),
            "",
            &doc.verified().unwrap(),
        )
        .unwrap();
    repo.sign_refs(&signer).unwrap();
    repo.set_identity_head().unwrap();
}

#[test]
fn a_name_whose_repository_is_in_storage_is_refused() {
    let (_tmp, state, rid) = actor_state();
    // The actor retires, so the key has none; its repository stays.
    let signer = key(0xff);
    {
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        let mut identity = Identity::load_mut(&repo, &signer).unwrap();
        let doc = identity
            .doc()
            .clone()
            .with_edits(|raw| {
                let payload = raw
                    .payload
                    .get_mut(&PayloadId::from_str("dev.radicle.actor").unwrap())
                    .unwrap()
                    .as_object_mut()
                    .unwrap();
                payload.insert("retired".into(), true.into());
            })
            .unwrap();
        identity
            .update(Title::new("Retire").unwrap(), "", &doc)
            .unwrap();
        repo.set_identity_head().unwrap();
        repo.sign_refs(&signer).unwrap();
    }
    assert!(state.actor().unwrap().is_none());

    // The same name gives the same document, so the same repository id.
    let again = state.create_actor(named("alice"), quiet()).unwrap_err();
    assert!(matches!(again, Error::Actor(actor::Error::NameTaken(ref name)) if name == "alice"));
    assert!(state.actor().unwrap().is_none());

    let other = state.create_actor(named("alice2"), quiet()).unwrap();
    assert_ne!(other.rid, rid);
}

/// The identity change `doc`, proposed by `author`.
fn propose(state: &AppState, rid: RepoId, author: &SigningKey, doc: &radicle::identity::Doc) {
    let repo = state.profile.storage.repository_mut(rid).unwrap();
    Identity::load_mut(&repo, author)
        .unwrap()
        .update(Title::new("Enroll key").unwrap(), "", doc)
        .unwrap();
}

#[test]
fn a_code_never_signs_a_change_that_does_more_than_enroll() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();

    // The other controller proposes the enrollment and slips in a
    // controller of its own.
    let joining = key(0x22);
    let code_of_joining = code(&state, &joining);
    let enrollment = Enrollment::decode(&code_of_joining).unwrap();
    let head = state.profile.storage.repository(rid).unwrap();
    let head = head.identity_doc().unwrap().doc;
    let mut doc = crate::actor::enrolled_doc(&head, &enrollment, true)
        .unwrap()
        .edit();
    let intruder = Did::from(*key(0x33).public_key());
    doc.delegate(intruder);
    propose(&state, rid, &other, &doc.verified().unwrap());

    let after = state
        .approve_enrollment(code_of_joining, true, quiet())
        .unwrap();
    let local = Did::from(state.profile.public_key);
    let foreign = after
        .pending
        .iter()
        .find(|open| open.author != local)
        .unwrap();
    assert!(!foreign.accepted.contains(&local));
    assert!(after.pending.iter().any(|open| open.author == local));
    assert!(!after.keys.iter().any(|key| key.did == intruder));
}

#[test]
fn a_code_signs_the_same_enrollment_only_with_the_same_role() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();
    let local = Did::from(state.profile.public_key);
    // The other controller proposes the enrollment of `joining` as a
    // controller, and the local key approves its code.
    let enroll = |joining: &SigningKey, controller: bool| {
        let code_of_joining = code(&state, joining);
        let enrollment = Enrollment::decode(&code_of_joining).unwrap();
        let repo = state.profile.storage.repository(rid).unwrap();
        let head = repo.identity_doc().unwrap().doc;
        propose(
            &state,
            rid,
            &other,
            &crate::actor::enrolled_doc(&head, &enrollment, true).unwrap(),
        );
        state
            .approve_enrollment(code_of_joining, controller, quiet())
            .unwrap()
    };

    // With the same role, the vote applies the other controller's change.
    let joining = key(0x22);
    let joined = enroll(&joining, true);
    let enrolled = joined
        .keys
        .iter()
        .find(|key| key.did == Did::from(*joining.public_key()))
        .unwrap();
    assert!(enrolled.bound && enrolled.controller);
    assert!(joined.pending.is_empty());

    // Without the controller role, it is another change.
    let apart = enroll(&key(0x33), false);
    assert_eq!(apart.pending.len(), 2);
    assert!(
        apart
            .pending
            .iter()
            .all(|open| (open.author == local) == open.accepted.contains(&local))
    );
}

#[test]
fn a_change_beyond_the_keys_is_never_approved() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();

    let head = state.profile.storage.repository(rid).unwrap();
    let mut doc = head.identity_doc().unwrap().doc.edit();
    doc.threshold = 2;
    propose(&state, rid, &other, &doc.verified().unwrap());

    let open = state.actor().unwrap().unwrap().pending.remove(0);
    assert!(open.unreadable);
    assert!(matches!(
        state.approve_actor_revision(open.id, quiet()),
        Err(Error::Actor(actor::Error::RevisionUnreadable))
    ));
}

#[test]
fn a_key_votes_once_on_a_change() {
    let (_tmp, state, _) = actor_state();
    state
        .approve_enrollment(code(&state, &key(0xee)), true, quiet())
        .unwrap();
    let pending = state
        .approve_enrollment(code(&state, &key(0x22)), true, quiet())
        .unwrap()
        .pending;

    assert!(matches!(
        state.reject_actor_revision(pending[0].id, quiet()),
        Err(Error::Actor(actor::Error::AlreadyVoted))
    ));
}

#[test]
fn a_change_to_a_keys_entry_the_app_does_not_show_is_never_approved() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();

    // An entry with no valid consent binds nothing, so nothing shows it.
    let stranger = Did::from(*key(0x33).public_key());
    let head = state.profile.storage.repository(rid).unwrap();
    let doc = head
        .identity_doc()
        .unwrap()
        .doc
        .with_edits(|raw| {
            raw.payload
                .get_mut(&PayloadId::from_str("dev.radicle.actor").unwrap())
                .unwrap()
                .as_object_mut()
                .unwrap()
                .get_mut("keys")
                .unwrap()
                .as_object_mut()
                .unwrap()
                .insert(stranger.to_string(), "z1".into());
        })
        .unwrap();
    propose(&state, rid, &other, &doc);

    let open = state.actor().unwrap().unwrap().pending.remove(0);
    assert!(open.added.is_empty() && open.removed.is_empty());
    assert!(open.unreadable);
}

#[test]
fn a_revoke_refuses_this_key_and_a_key_the_actor_does_not_have() {
    let (_tmp, state, _) = actor_state();
    let local = Did::from(state.profile.public_key);
    let stranger = Did::from(*key(0x33).public_key());

    assert!(matches!(
        state.remove_actor_key(local, quiet()),
        Err(Error::Actor(actor::Error::RemoveSelf))
    ));
    assert!(matches!(
        state.remove_actor_key(stranger, quiet()),
        Err(Error::Actor(actor::Error::KeyNotFound(did))) if did == stranger
    ));
}

#[test]
fn a_revoke_lowers_the_threshold_to_the_controllers_left_and_says_so() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 2);

    let after = state
        .remove_actor_key(Did::from(*other.public_key()), quiet())
        .unwrap();
    let open = &after.pending[0];
    assert_eq!(open.removed, vec![Did::from(*other.public_key())]);
    assert_eq!(open.threshold, Some(1));
    assert!(!open.unreadable);
}

#[test]
fn a_revoke_signs_the_same_removal_by_another_controller() {
    let (_tmp, state, rid) = actor_state();
    let leaving = key(0x22);
    state
        .approve_enrollment(code(&state, &leaving), false, quiet())
        .unwrap();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();

    let leaving = Did::from(*leaving.public_key());
    let head = state.profile.storage.repository(rid).unwrap();
    let head = head.identity_doc().unwrap().doc;
    propose(
        &state,
        rid,
        &other,
        &crate::actor::removed_doc(&head, &leaving).unwrap(),
    );

    let after = state.remove_actor_key(leaving, quiet()).unwrap();
    assert!(after.pending.is_empty());
    assert!(!after.keys.iter().any(|key| key.did == leaving));
}

#[test]
fn the_founding_key_is_revoked_like_any_other() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();

    let founding = Did::from(state.profile.public_key);
    let head = state.profile.storage.repository(rid).unwrap();
    let head = head.identity_doc().unwrap().doc;
    propose(
        &state,
        rid,
        &other,
        &crate::actor::removed_doc(&head, &founding).unwrap(),
    );
    let id = state.actor().unwrap().unwrap().pending[0].id;
    // The founding key's vote applies it: the actor stands, without it.
    let after = state.approve_actor_revision(id, quiet()).unwrap();
    let keys = after.keys.iter().map(|key| key.did).collect::<Vec<_>>();
    assert_eq!(keys, vec![Did::from(*other.public_key())]);
    assert!(state.actor().unwrap().is_none());
}

#[test]
fn a_preview_shows_the_key_of_a_code_and_writes_nothing() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();
    let repo = state.profile.storage.repository(rid).unwrap();
    let before = repo.identity().unwrap().current;

    let joining = key(0x22);
    let preview = state.decode_enrollment(code(&state, &joining)).unwrap();
    assert_eq!(preview.did, Did::from(*joining.public_key()));
    assert_eq!(repo.identity().unwrap().current, before);
    assert!(state.actor().unwrap().unwrap().pending.is_empty());

    assert!(matches!(
        state.decode_enrollment(code(&state, &other)),
        Err(Error::Actor(actor::Error::AlreadyBound))
    ));
}

#[test]
fn a_preview_refuses_a_key_the_payload_has_no_room_for() {
    let (_tmp, state, rid) = actor_state();
    let signer = key(0xff);
    {
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        let mut identity = Identity::load_mut(&repo, &signer).unwrap();
        let doc = identity
            .doc()
            .clone()
            .with_edits(|raw| {
                let keys = raw
                    .payload
                    .get_mut(&PayloadId::from_str("dev.radicle.actor").unwrap())
                    .unwrap()
                    .as_object_mut()
                    .unwrap()
                    .get_mut("keys")
                    .unwrap()
                    .as_object_mut()
                    .unwrap();
                for n in keys.len()..255 {
                    let mut seed = [0xaa; 32];
                    seed[0] = n as u8;
                    let filler = SigningKey::from_seed(Seed::new(seed));
                    keys.insert(Did::from(*filler.public_key()).to_string(), "z1".into());
                }
            })
            .unwrap();
        identity
            .update(Title::new("Fill the keys").unwrap(), "", &doc)
            .unwrap();
        repo.sign_refs(&signer).unwrap();
        repo.set_identity_head().unwrap();
    }

    let joining = key(0x22);
    assert!(matches!(
        state.decode_enrollment(code(&state, &joining)),
        Err(Error::Actor(crate::actor::Error::Full))
    ));
}

#[test]
fn a_key_that_rejected_a_change_cannot_approve_it() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    // Three controllers, so one rejection leaves the change open.
    {
        let signer = key(0xff);
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        let mut identity = Identity::load_mut(&repo, &signer).unwrap();
        let mut doc = identity.doc().clone().edit();
        doc.delegate(Did::from(*other.public_key()));
        doc.delegate(Did::from(*key(0x33).public_key()));
        doc.threshold = 2;
        identity
            .update(
                Title::new("Add controllers").unwrap(),
                "",
                &doc.verified().unwrap(),
            )
            .unwrap();
        repo.sign_refs(&signer).unwrap();
        repo.set_identity_head().unwrap();
    }
    let code_of_joining = code(&state, &key(0x22));
    let enrollment = Enrollment::decode(&code_of_joining).unwrap();
    let head = state.profile.storage.repository(rid).unwrap();
    let head = head.identity_doc().unwrap().doc;
    let doc = crate::actor::enrolled_doc(&head, &enrollment, true).unwrap();
    propose(&state, rid, &other, &doc);
    let open = state.actor().unwrap().unwrap().pending[0].id;

    let after = state.reject_actor_revision(open, quiet()).unwrap();
    assert_eq!(
        after.pending[0].rejected,
        vec![Did::from(state.profile.public_key)],
        "the rejection shows on the open change"
    );
    let result = state.approve_actor_revision(open, quiet());
    assert!(
        matches!(result, Err(Error::Actor(actor::Error::AlreadyVoted))),
        "{result:?}"
    );
    // The same code co-signs that change, which is the same verdict.
    let result = state.approve_enrollment(code_of_joining, true, quiet());
    assert!(
        matches!(result, Err(Error::Actor(actor::Error::AlreadyVoted))),
        "{result:?}"
    );
}

#[test]
fn a_preview_says_when_the_key_already_controls_the_actor() {
    let (_tmp, state, rid) = actor_state();
    let recovery = key(0xee);
    share_with(&state, rid, &recovery, 2);
    let preview = state.decode_enrollment(code(&state, &recovery)).unwrap();
    assert!(preview.controller);
    let preview = state.decode_enrollment(code(&state, &key(0x22))).unwrap();
    assert!(!preview.controller);
}

#[test]
fn a_key_with_an_accepted_change_cannot_approve_a_sibling() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 2);
    // The local key's own change: its accept is on record.
    let own = state
        .approve_enrollment(code(&state, &key(0x22)), true, quiet())
        .unwrap()
        .pending[0]
        .id;
    let result = state.approve_actor_revision(own, quiet());
    assert!(
        matches!(result, Err(Error::Actor(actor::Error::AlreadyVoted))),
        "{result:?}"
    );

    // The other controller proposes a sibling at the same version.
    let enrollment = Enrollment::decode(&code(&state, &key(0x33))).unwrap();
    let head = state.profile.storage.repository(rid).unwrap();
    let head = head.identity_doc().unwrap().doc;
    let doc = crate::actor::enrolled_doc(&head, &enrollment, true).unwrap();
    propose(&state, rid, &other, &doc);
    let local = Did::from(state.profile.public_key);
    let sibling = state
        .actor()
        .unwrap()
        .unwrap()
        .pending
        .into_iter()
        .find(|open| open.author != local)
        .unwrap()
        .id;
    let result = state.approve_actor_revision(sibling, quiet());
    assert!(
        matches!(result, Err(Error::Actor(actor::Error::VotedElsewhere))),
        "{result:?}"
    );
    // Nor propose a third change beside them.
    let result = state.approve_enrollment(code(&state, &key(0x44)), true, quiet());
    assert!(
        matches!(result, Err(Error::Actor(actor::Error::VotedElsewhere))),
        "{result:?}"
    );
}

#[test]
fn restoring_the_canonical_profile_takes_back_an_edit() {
    let (_tmp, state, rid) = actor_state();
    share_with(&state, rid, &key(0xee), 2);
    let repo = state.profile.storage.repository(rid).unwrap();
    let key = state.profile.public_key;
    let local = format!("refs/namespaces/{key}/refs/heads/main");
    let canonical = oid(&repo, "refs/heads/main");
    let original = state.actor().unwrap().unwrap().profile.unwrap();

    state.update_actor_profile(named("bob"), quiet()).unwrap();
    assert_ne!(
        oid(&repo, &local),
        canonical,
        "the edit is on the local branch"
    );

    state.update_actor_profile(original, quiet()).unwrap();
    assert_eq!(
        oid(&repo, &local),
        canonical,
        "the branch is back on the canonical head"
    );
    let refs = repo.remote(&key).unwrap().refs;
    assert_eq!(
        refs.get(&radicle::git::fmt::qualified!("refs/heads/main")),
        canonical.map(Into::into),
        "the move is signed"
    );
}
