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
use crate::traits::Profile;
use crate::traits::repo::Repo;
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
    let rid = state
        .create_actor(named("alice"), Default::default(), quiet())
        .unwrap()
        .rid;
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

    assert!(
        state
            .update_actor_profile(named("bob"), Default::default(), quiet())
            .is_err()
    );
    assert_eq!((oid(&repo, &local), oid(&repo, canonical)), before);
    let shown = state.actor().unwrap().unwrap().profile.unwrap();
    assert_eq!(shown.display_name, "alice");

    std::fs::remove_file(&lock).unwrap();
    let saved = state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
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

    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();

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
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap_err();
    assert!(
        !matches!(refused, Error::Actor(actor::Error::Diverged)),
        "a locked ref is no split: {refused}"
    );
    assert_eq!((oid(&repo, &local), oid(&repo, canonical)), before);

    std::fs::remove_file(&lock).unwrap();
    let saved = state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
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
fn the_actor_to_join_is_shown_before_anything_is_signed() {
    let (tmp, state, rid) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };

    // The refusals are the join's own.
    let refused = state.joinable_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::Exists(existing)) if existing == rid));
    let refused = other.joinable_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::NotFetched(r)) if r == rid));

    copy_dir(
        &radicle::storage::git::paths::repository(&state.profile.storage, &rid),
        &radicle::storage::git::paths::repository(&other.profile.storage, &rid),
    );
    let repo = other.profile.storage.repository(rid).unwrap();
    let refs = |repo: &radicle::storage::git::Repository| {
        repo.backend
            .references()
            .unwrap()
            .map(|reference| {
                let reference = reference.unwrap();
                (reference.name().unwrap().to_owned(), reference.target())
            })
            .collect::<Vec<_>>()
    };
    let before = refs(&repo);

    let shown = other.joinable_actor(rid).unwrap();
    assert_eq!(shown.rid, rid);
    assert_eq!(shown.profile.unwrap().display_name, "alice");
    assert_eq!(shown.keys.len(), 1);
    assert_eq!(shown.keys[0].did, state.profile.did());
    assert_eq!(refs(&repo), before, "showing the actor writes nothing");
}

/// Moves `repo`'s default branch onto a commit that names a profile file
/// whose contents never arrived.
fn lose_profile_file(repo: &radicle::storage::git::Repository) {
    let absent = radicle::git::raw::Oid::from_str(&"1".repeat(40)).unwrap();
    let odb = repo.backend.odb().unwrap();
    let entry = |mode: &str, name: &str, oid: radicle::git::raw::Oid| {
        [format!("{mode} {name}\0").as_bytes(), oid.as_bytes()].concat()
    };
    let folder = odb
        .write(
            radicle::git::raw::ObjectType::Tree,
            &entry("100644", "profile.json", absent),
        )
        .unwrap();
    let root = odb
        .write(
            radicle::git::raw::ObjectType::Tree,
            &entry("40000", ".radicle", folder),
        )
        .unwrap();
    let parent = repo
        .backend
        .find_commit(oid(repo, "refs/heads/main").unwrap())
        .unwrap();
    let signature = repo.backend.signature().unwrap();
    let broken = repo
        .backend
        .commit(
            None,
            &signature,
            &signature,
            "Edit",
            &repo.backend.find_tree(root).unwrap(),
            &[&parent],
        )
        .unwrap();
    repo.backend
        .reference("refs/heads/main", broken, true, "fetch")
        .unwrap();
}

#[test]
fn a_profile_file_that_cannot_be_read_stops_the_page_but_not_the_preview() {
    let (tmp, state, rid) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };
    copy_dir(
        &radicle::storage::git::paths::repository(&state.profile.storage, &rid),
        &radicle::storage::git::paths::repository(&other.profile.storage, &rid),
    );

    // The join needs only the identity, so the preview must not ask for more.
    lose_profile_file(&other.profile.storage.repository(rid).unwrap());
    other.join_actor(rid).unwrap();
    let shown = other.joinable_actor(rid).unwrap();
    assert!(shown.profile.is_none());
    assert!(shown.profile_unreadable);
    assert_eq!(shown.keys.len(), 1);

    // The key's own page offers to save over the file, so there a failed
    // read is an error and never an empty form.
    lose_profile_file(&state.profile.storage.repository(rid).unwrap());
    assert!(state.actor().is_err());
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

/// Sets `field` of the actor payload of `rid` to `value`, as another app would.
fn write_payload_field(state: &AppState, rid: RepoId, field: &str, value: serde_json::Value) {
    write_payload_field_as(state, rid, &key(0xff), field, value);
}

/// As `write_payload_field`, signed by `signer`, the actor's one controller.
fn write_payload_field_as(
    state: &AppState,
    rid: RepoId,
    signer: &SigningKey,
    field: &str,
    value: serde_json::Value,
) {
    let repo = state.profile.storage.repository_mut(rid).unwrap();
    let mut identity = Identity::load_mut(&repo, signer).unwrap();
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
            payload.insert(field.into(), value);
        })
        .unwrap();
    identity
        .update(Title::new("Another app's payload").unwrap(), "", &doc)
        .unwrap();
    repo.sign_refs(signer).unwrap();
    repo.set_identity_head().unwrap();
}

#[test]
fn a_newer_actor_this_version_cannot_place_is_not_given_a_sibling() {
    let fields = [
        ("type", serde_json::Value::from("team")),
        ("retired", "no".into()),
        ("supersededBy", 7.into()),
        // The bindings in a form of the newer version's own.
        ("keys", serde_json::json!([])),
    ];
    for (field, value) in fields {
        let (_tmp, state, rid) = actor_state();
        write_payload_field(&state, rid, "version", 2.into());
        assert!(state.actor().unwrap().unwrap().payload_newer);

        write_payload_field(&state, rid, field, value);

        let refused = |result: Result<(), Error>| matches!(result, Err(Error::Actor(actor::Error::ActorNewer(found))) if found == rid);
        assert!(refused(state.actor().map(|_| ())), "{field}");
        assert!(
            refused(
                state
                    .create_actor(named("bob"), Default::default(), quiet())
                    .map(|_| ())
            ),
            "{field}"
        );
        assert!(refused(state.join_actor(rid).map(|_| ())), "{field}");
    }
}

#[test]
fn a_newer_actor_this_version_cannot_place_does_not_hide_the_profile() {
    let (tmp, state, rid) = actor_state();
    let founder = key(0xee);
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };

    // A second actor binds the key as well, in a payload of a newer version
    // with a kind this one does not know.
    let second = other
        .create_actor(named("team"), Default::default(), quiet())
        .unwrap()
        .rid;
    let repo = other.profile.storage.repository(second).unwrap();
    let code = Enrollment::sign(second, repo.identity().unwrap().current, &key(0xff)).encode();
    other.approve_enrollment(code, false, quiet()).unwrap();
    write_payload_field_as(&other, second, &founder, "version", 2.into());
    write_payload_field_as(&other, second, &founder, "type", "team".into());
    copy_dir(
        &radicle::storage::git::paths::repository(&other.profile.storage, &second),
        &radicle::storage::git::paths::repository(&state.profile.storage, &second),
    );

    assert_eq!(state.actor().unwrap().unwrap().rid, rid);
}

#[test]
fn a_payload_with_a_field_its_version_does_not_define_is_never_signed() {
    let (_tmp, state, rid) = actor_state();
    write_payload_field(&state, rid, "mood", "unknown".into());

    // Still the key's actor, so nothing offers to create another.
    let actor = state.actor().unwrap().unwrap();
    assert_eq!(actor.rid, rid);
    assert!(actor.payload_newer);

    let refused = state.approve_enrollment(code(&state, &key(0x22)), true, quiet());
    assert!(matches!(
        refused,
        Err(Error::Actor(actor::Error::PayloadNewer))
    ));
}

#[test]
fn a_payload_from_a_newer_app_is_never_signed() {
    let (_tmp, state, rid) = actor_state();
    write_payload_field(&state, rid, "version", 2.into());
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
    let again = state
        .create_actor(named("alice"), Default::default(), quiet())
        .unwrap_err();
    assert!(matches!(again, Error::Actor(actor::Error::NameTaken(ref name)) if name == "alice"));
    assert!(state.actor().unwrap().is_none());

    let other = state
        .create_actor(named("alice2"), Default::default(), quiet())
        .unwrap();
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

    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    assert_ne!(
        oid(&repo, &local),
        canonical,
        "the edit is on the local branch"
    );

    state
        .update_actor_profile(original, Default::default(), quiet())
        .unwrap();
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

/// The app in `state`, where something else acts in the middle of one call:
/// `meanwhile` runs once, at the `at`th time the call reads the profile.
struct Interrupted<'a> {
    state: &'a AppState,
    at: usize,
    reads: std::cell::Cell<usize>,
    meanwhile: std::cell::RefCell<Option<Box<dyn FnOnce() + 'a>>>,
}

impl<'a> Interrupted<'a> {
    fn new(state: &'a AppState, at: usize, meanwhile: impl FnOnce() + 'a) -> Self {
        Self {
            state,
            at,
            reads: std::cell::Cell::new(0),
            meanwhile: std::cell::RefCell::new(Some(Box::new(meanwhile))),
        }
    }

    /// Whether `meanwhile` ran.
    fn interrupted(&self) -> bool {
        self.meanwhile.borrow().is_none()
    }
}

impl Profile for Interrupted<'_> {
    fn profile(&self) -> radicle::Profile {
        self.reads.set(self.reads.get() + 1);
        if self.reads.get() == self.at
            && let Some(meanwhile) = self.meanwhile.take()
        {
            meanwhile();
        }
        self.state.profile.clone()
    }
}

impl Repo for Interrupted<'_> {}
impl Actor for Interrupted<'_> {}

fn did_of(key: &SigningKey) -> Did {
    Did::from(*key.public_key())
}

/// Runs `round` with `meanwhile` set off at each read of the profile in turn,
/// until a call ends before that read comes. `round` gets the app and says
/// whether `meanwhile` ran. A call that reads the profile too few times to
/// be interrupted at several points is no test of anything.
fn at_every_read(mut round: impl FnMut(usize) -> bool) {
    let mut at = 1;
    while round(at) {
        at += 1;
    }
    assert!(at > 3, "interrupted at {} reads only", at - 1);
}

#[test]
fn a_change_that_lands_during_an_approval_survives_it() {
    at_every_read(|at| {
        let (_tmp, state, _rid) = actor_state();
        let (first, second) = (key(0xcc), key(0xdd));
        let app = Interrupted::new(&state, at, || {
            state
                .approve_enrollment(code(&state, &first), false, quiet())
                .unwrap();
        });

        let result = app.approve_enrollment(code(&state, &second), false, quiet());

        let actor = state.actor().unwrap().unwrap();
        let bound = |key: &SigningKey| actor.keys.iter().any(|k| k.did == did_of(key) && k.bound);
        if app.interrupted() {
            assert!(bound(&first), "read {at}: the other change is undone");
        }
        match result {
            Ok(_) => assert!(bound(&second), "read {at}: reported as done, not bound"),
            // Only a new code helps, so the error must say so.
            Err(e) => assert!(
                matches!(e, Error::Actor(actor::Error::Stale)),
                "read {at}: {e}"
            ),
        }
        app.interrupted()
    });
}

#[test]
fn a_change_that_lands_during_a_removal_survives_it() {
    at_every_read(|at| {
        let (_tmp, state, _rid) = actor_state();
        let (first, second) = (key(0xcc), key(0xdd));
        state
            .approve_enrollment(code(&state, &second), false, quiet())
            .unwrap();
        let app = Interrupted::new(&state, at, || {
            state
                .approve_enrollment(code(&state, &first), false, quiet())
                .unwrap();
        });

        let result = app.remove_actor_key(did_of(&second), quiet());

        let actor = state.actor().unwrap().unwrap();
        let listed = |key: &SigningKey| actor.keys.iter().any(|k| k.did == did_of(key));
        if app.interrupted() {
            assert!(listed(&first), "read {at}: the other change is undone");
        }
        match result {
            Ok(_) => assert!(!listed(&second), "read {at}: reported as done, still there"),
            Err(e) => assert!(
                matches!(e, Error::Actor(actor::Error::Moved)),
                "read {at}: {e}"
            ),
        }
        app.interrupted()
    });
}

#[test]
fn a_field_that_lands_during_a_removal_is_never_signed() {
    at_every_read(|at| {
        let (_tmp, state, rid) = actor_state();
        let leaving = did_of(&key(0xdd)).to_string();
        state
            .approve_enrollment(code(&state, &key(0xdd)), false, quiet())
            .unwrap();
        let app = Interrupted::new(&state, at, || {
            write_payload_field(&state, rid, "mood", "unknown".into());
        });

        let result = app.remove_actor_key(did_of(&key(0xdd)), quiet());

        // The revision that removed the key, if any, holds no field this
        // version does not define: the field came after it, never before.
        let repo = state.profile.storage.repository(rid).unwrap();
        let id = PayloadId::from_str("dev.radicle.actor").unwrap();
        let removing = actor::identity_history(&repo)
            .unwrap()
            .into_iter()
            .map(|revision| (**revision.doc.payload().get(&id).unwrap()).clone())
            .skip_while(|payload| payload["keys"].get(&leaving).is_none())
            .find(|payload| payload["keys"].get(&leaving).is_none());
        match (&result, removing) {
            (Ok(_), Some(payload)) => {
                assert!(
                    payload.get("mood").is_none(),
                    "read {at}: signed with the field"
                )
            }
            (Err(Error::Actor(actor::Error::Moved | actor::Error::PayloadNewer)), None) => {}
            (result, removing) => panic!("read {at}: {result:?} with {removing:?}"),
        }
        app.interrupted()
    });
}

/// The open change in which `author`, the other of two controllers, enrolls
/// a key.
fn enrollment_by(
    state: &AppState,
    rid: RepoId,
    author: &SigningKey,
    joining: &SigningKey,
) -> radicle::git::Oid {
    share_with(state, rid, author, 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    let enrollment = Enrollment::sign(rid, repo.identity().unwrap().current, joining);
    let doc = actor::enrolled_doc(&repo.identity_doc().unwrap().doc, &enrollment, false).unwrap();
    propose(state, rid, author, &doc);

    state.actor().unwrap().unwrap().pending[0].id
}

/// Withdraws the open change `id` as `author`.
fn withdraw(state: &AppState, rid: RepoId, author: &SigningKey, id: radicle::git::Oid) {
    let repo = state.profile.storage.repository_mut(rid).unwrap();
    Identity::load_mut(&repo, author)
        .unwrap()
        .redact(id)
        .unwrap();
}

#[test]
fn a_change_withdrawn_during_its_approval_is_not_reported_as_approved() {
    at_every_read(|at| {
        let (_tmp, state, rid) = actor_state();
        let (other, joining) = (key(0xee), key(0xdd));
        let local = Did::from(state.profile.public_key);
        let id = enrollment_by(&state, rid, &other, &joining);
        let app = Interrupted::new(&state, at, || withdraw(&state, rid, &other, id));

        let result = app.approve_actor_revision(id, quiet());

        let actor = state.actor().unwrap().unwrap();
        let approved = actor
            .keys
            .iter()
            .any(|key| key.did == did_of(&joining) && key.bound)
            || actor
                .pending
                .iter()
                .any(|open| open.accepted.contains(&local));
        match result {
            Ok(_) => assert!(approved, "read {at}: reported as approved, and it is not"),
            Err(e) => assert!(!approved, "read {at}: {e}, and it is approved"),
        }
        app.interrupted()
    });
}

#[test]
fn a_change_withdrawn_during_its_rejection_is_not_reported_as_rejected() {
    at_every_read(|at| {
        let (_tmp, state, rid) = actor_state();
        let (other, joining) = (key(0xee), key(0xdd));
        let local = Did::from(state.profile.public_key);
        let id = enrollment_by(&state, rid, &other, &joining);
        let app = Interrupted::new(&state, at, || withdraw(&state, rid, &other, id));

        let result = app.reject_actor_revision(id, quiet());

        let repo = state.profile.storage.repository(rid).unwrap();
        let rejected = repo
            .identity()
            .unwrap()
            .revision(&id)
            .is_some_and(|change| change.rejected().any(|did| did == local));
        if result.is_ok() {
            assert!(rejected, "read {at}: reported as rejected, and it is not");
        }
        app.interrupted()
    });
}

#[test]
fn a_change_approved_during_its_withdrawal_is_not_reported_as_withdrawn() {
    at_every_read(|at| {
        let (_tmp, state, rid) = actor_state();
        let (other, joining) = (key(0xee), key(0xdd));
        share_with(&state, rid, &other, 1);
        let id = state
            .approve_enrollment(code(&state, &joining), false, quiet())
            .unwrap()
            .pending[0]
            .id;
        let app = Interrupted::new(&state, at, || {
            let repo = state.profile.storage.repository_mut(rid).unwrap();
            Identity::load_mut(&repo, &other)
                .unwrap()
                .accept(&id)
                .unwrap();
        });

        let result = app.withdraw_actor_revision(id, quiet());

        let actor = state.actor().unwrap().unwrap();
        let bound = actor
            .keys
            .iter()
            .any(|key| key.did == did_of(&joining) && key.bound);
        if result.is_ok() {
            assert!(
                !bound,
                "read {at}: reported as withdrawn, and the key is bound"
            );
        }
        app.interrupted()
    });
}

#[test]
fn an_actor_repository_is_told_apart_from_a_project() {
    use radicle::identity::doc::Payload;
    use radicle::test::fixtures;

    let (tmp, state, rid) = actor_state();
    let signer = key(0xff);
    let storage = &state.profile.storage;
    let (project, ..) = fixtures::project(tmp.path().join("project"), storage, &signer).unwrap();
    let (late, ..) = {
        let working = fixtures::repository(tmp.path().join("late")).0;
        radicle::rad::init(
            &working,
            "late".try_into().unwrap(),
            "",
            radicle::git::fmt::refname!("master"),
            radicle::identity::Visibility::default(),
            &signer,
            storage,
        )
        .unwrap()
    };

    // A project that takes on the payload later is still a project: what a
    // repository is, its first document says.
    let repo = storage.repository_mut(late).unwrap();
    let mut identity = Identity::load_mut(&repo, &signer).unwrap();
    let keys = serde_json::json!({ Did::from(state.profile.public_key).to_string(): "root" });
    let doc = identity
        .doc()
        .clone()
        .with_edits(|raw| {
            raw.payload.insert(
                PayloadId::from_str("dev.radicle.actor").unwrap(),
                Payload::from(serde_json::json!({ "version": 1, "keys": keys })),
            );
        })
        .unwrap();
    identity
        .update(Title::new("Take on the payload").unwrap(), "", &doc)
        .unwrap();
    repo.sign_refs(&signer).unwrap();
    repo.set_identity_head().unwrap();

    let summaries = state
        .list_repos_summary(crate::traits::repo::Show::All)
        .unwrap();
    let is_actor = |rid: RepoId| summaries.iter().find(|repo| repo.rid == rid).unwrap().actor;
    assert!(is_actor(rid));
    assert!(!is_actor(project));
    assert!(!is_actor(late));

    // An actor whose current document no longer holds a valid payload is
    // not one either.
    write_payload_field(&state, rid, "type", "team".into());
    let summaries = state
        .list_repos_summary(crate::traits::repo::Show::All)
        .unwrap();
    assert!(summaries.iter().any(|repo| repo.rid == rid && !repo.actor));
}

#[test]
fn a_key_bound_to_two_actors_has_neither() {
    let (tmp, state, rid) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };

    // Another actor binds the key too, with its consent, and reaches this
    // machine.
    let second = other
        .create_actor(named("bob"), Default::default(), quiet())
        .unwrap()
        .rid;
    let repo = other.profile.storage.repository(second).unwrap();
    let consent = Enrollment::sign(second, repo.identity().unwrap().current, &key(0xff));
    other
        .approve_enrollment(consent.encode(), false, quiet())
        .unwrap();
    copy_dir(
        &radicle::storage::git::paths::repository(&other.profile.storage, &second),
        &radicle::storage::git::paths::repository(&state.profile.storage, &second),
    );

    // No rule picks one of them, so nothing is read or written as either.
    let mut both = vec![rid, second];
    both.sort();
    let ambiguous = |result: Result<(), Error>| match result {
        Err(Error::Actor(actor::Error::Ambiguous(mut rids))) => {
            rids.sort();
            rids == both
        }
        _ => false,
    };
    assert!(ambiguous(state.actor().map(|_| ())));
    assert!(ambiguous(
        state
            .update_actor_profile(named("carol"), Default::default(), quiet())
            .map(|_| ())
    ));
    assert!(ambiguous(
        state
            .remove_actor_key(did_of(&key(0x11)), quiet())
            .map(|_| ())
    ));
    assert!(ambiguous(state.join_actor(rid).map(|_| ())));
    assert_eq!(state.actor().unwrap_err().code(), "ActorError.Ambiguous");
}

#[test]
fn a_key_that_does_not_control_the_actor_saves_on_its_own_branch() {
    let (tmp, state, rid) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };
    let ours = radicle::storage::git::paths::repository(&state.profile.storage, &rid);
    let theirs = radicle::storage::git::paths::repository(&other.profile.storage, &rid);

    // The other machine joins as a key without control, and gets the approval.
    copy_dir(&ours, &theirs);
    let code = other.join_actor(rid).unwrap();
    state.approve_enrollment(code, false, quiet()).unwrap();
    std::fs::remove_dir_all(&theirs).unwrap();
    copy_dir(&ours, &theirs);

    let repo = other.profile.storage.repository(rid).unwrap();
    let canonical = oid(&repo, "refs/heads/main");
    let shown = other
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();

    // Its edit is a commit on the profile, on a branch of its own, signed.
    let key = other.profile.public_key;
    let branch = oid(&repo, &format!("refs/namespaces/{key}/refs/heads/main"))
        .expect("the key has a branch");
    let parent = repo.backend.find_commit(branch).unwrap().parent_id(0).ok();
    assert_eq!(parent, canonical);
    let refs = repo.remote(&key).unwrap().refs;
    assert_eq!(
        refs.get(&radicle::git::fmt::qualified!("refs/heads/main")),
        Some(branch.into())
    );

    // The profile itself waits for a controller.
    assert_eq!(oid(&repo, "refs/heads/main"), canonical);
    assert_eq!(shown.profile.unwrap().display_name, "alice");
}

#[test]
fn a_save_closes_a_split_between_two_controllers() {
    let (_tmp, state, rid) = actor_state();
    // Two controllers under a threshold of one: two devices of one person.
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    let base = oid(&repo, "refs/heads/main").unwrap();

    // The other device saves on the head both have, before it has this
    // device's edit.
    let parent = repo.backend.find_commit(base).unwrap();
    let tree = actor::profile_tree(
        &repo.backend,
        Some(&parent.tree().unwrap()),
        &named("carol"),
    )
    .unwrap();
    let signature = repo.backend.signature().unwrap();
    let theirs = repo
        .backend
        .commit(None, &signature, &signature, "Edit", &tree, &[&parent])
        .unwrap();

    // This device saves on the same head, and alone it moves the canonical
    // branch.
    let saved = state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    assert_eq!(saved.profile.unwrap().display_name, "bob");
    assert!(saved.forks.is_empty());

    // A fetch brings the other device's branch: the two have split, and the
    // other version is reported.
    let their_branch = format!("refs/namespaces/{}/refs/heads/main", other.public_key());
    repo.backend
        .reference(&their_branch, theirs, true, "fetch")
        .unwrap();
    let split = state.actor().unwrap().unwrap();
    assert_eq!(split.profile.unwrap().display_name, "bob");
    assert_eq!(split.forks.len(), 1);
    assert_eq!(split.forks[0].did, Did::from(*other.public_key()));
    assert_eq!(
        split.forks[0].profile.as_ref().unwrap().display_name,
        "carol"
    );
    assert_eq!(split.forks[0].base.as_ref().unwrap().display_name, "alice");
    // The changes are told from where the two versions split, so this
    // device's own edit is none of them.
    let changes = split.forks[0].changes.as_ref().unwrap();
    assert!(changes.contains("-  \"displayName\": \"alice\""));
    assert!(changes.contains("+  \"displayName\": \"carol\""));
    assert!(!changes.contains("bob"));

    // The next save descends from both sides, so the canonical branch moves
    // again, even when the form is saved as it is.
    let saved = state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    assert_eq!(saved.profile.unwrap().display_name, "bob");
    assert!(saved.forks.is_empty());
    let canonical = oid(&repo, "refs/heads/main").unwrap();
    let key = state.profile.public_key;
    assert_eq!(
        oid(&repo, &format!("refs/namespaces/{key}/refs/heads/main")),
        Some(canonical)
    );
    assert!(repo.backend.graph_descendant_of(canonical, theirs).unwrap());

    let saved = state
        .update_actor_profile(named("dave"), Default::default(), quiet())
        .unwrap();
    assert_eq!(saved.profile.unwrap().display_name, "dave");
}

/// Makes the keys `0xee` and `0xdd` controllers too, under a threshold of
/// one: three devices of one person.
fn three_controllers(state: &AppState, rid: RepoId) -> (SigningKey, SigningKey) {
    let (first, second, third) = (key(0xff), key(0xee), key(0xdd));
    let repo = state.profile.storage.repository_mut(rid).unwrap();
    let mut identity = Identity::load_mut(&repo, &first).unwrap();
    let mut doc = identity.doc().clone().edit();
    doc.delegate(did_of(&second));
    doc.delegate(did_of(&third));
    identity
        .update(
            Title::new("Add controllers").unwrap(),
            "",
            &doc.verified().unwrap(),
        )
        .unwrap();
    repo.sign_refs(&first).unwrap();
    repo.set_identity_head().unwrap();

    (second, third)
}

/// A commit over `base` that names the profile `name`, as another device
/// would save it.
fn saved_elsewhere(
    repo: &radicle::storage::git::Repository,
    base: radicle::git::raw::Oid,
    name: &str,
) -> radicle::git::raw::Oid {
    let parent = repo.backend.find_commit(base).unwrap();
    let tree =
        actor::profile_tree(&repo.backend, Some(&parent.tree().unwrap()), &named(name)).unwrap();
    let signature = repo.backend.signature().unwrap();

    repo.backend
        .commit(None, &signature, &signature, "Edit", &tree, &[&parent])
        .unwrap()
}

/// Points the branch of `key` at `commit`, as a fetch would.
fn fetched(
    repo: &radicle::storage::git::Repository,
    key: &PublicKey,
    commit: radicle::git::raw::Oid,
) {
    repo.backend
        .reference(
            &format!("refs/namespaces/{key}/refs/heads/main"),
            commit,
            true,
            "fetch",
        )
        .unwrap();
}

#[test]
fn a_save_closes_a_split_with_one_of_three_controllers() {
    let (_tmp, state, rid) = actor_state();
    let (second, third) = three_controllers(&state, rid);
    let repo = state.profile.storage.repository(rid).unwrap();
    let base = oid(&repo, "refs/heads/main").unwrap();

    // One other device saved while apart; the third never edited.
    let theirs = saved_elsewhere(&repo, base, "carol");
    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    fetched(&repo, second.public_key(), theirs);
    fetched(&repo, third.public_key(), base);
    assert_eq!(state.actor().unwrap().unwrap().forks.len(), 1);

    let saved = state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();

    assert!(saved.forks.is_empty());
    let canonical = oid(&repo, "refs/heads/main").unwrap();
    assert!(repo.backend.graph_descendant_of(canonical, theirs).unwrap());
}

#[test]
fn a_three_way_split_closes_once_a_second_controller_has_the_merge() {
    let (_tmp, state, rid) = actor_state();
    let (second, third) = three_controllers(&state, rid);
    let repo = state.profile.storage.repository(rid).unwrap();
    let base = oid(&repo, "refs/heads/main").unwrap();

    // All three devices saved while apart, and both other versions show.
    let (carol, erin) = (
        saved_elsewhere(&repo, base, "carol"),
        saved_elsewhere(&repo, base, "erin"),
    );
    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    fetched(&repo, second.public_key(), carol);
    fetched(&repo, third.public_key(), erin);
    assert_eq!(state.actor().unwrap().unwrap().forks.len(), 2);

    // The save merges both. Whether the canonical branch then moves is up
    // to how three tips are told apart, and a refusal says so.
    if let Err(refused) = state.update_actor_profile(named("bob"), Default::default(), quiet()) {
        assert!(
            matches!(refused, Error::Actor(actor::Error::Diverged)),
            "{refused}"
        );
    }
    let merge = oid(
        &repo,
        &format!(
            "refs/namespaces/{}/refs/heads/main",
            state.profile.public_key
        ),
    )
    .unwrap();
    assert!(repo.backend.graph_descendant_of(merge, carol).unwrap());
    assert!(repo.backend.graph_descendant_of(merge, erin).unwrap());

    // A second device that has the merge settles it.
    fetched(&repo, second.public_key(), merge);
    let saved = state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();

    assert!(saved.forks.is_empty());
    let canonical = oid(&repo, "refs/heads/main").unwrap();
    assert!(repo.backend.graph_descendant_of(canonical, carol).unwrap());
    assert!(repo.backend.graph_descendant_of(canonical, erin).unwrap());
}

#[test]
fn a_copy_fetched_during_a_split_is_not_joined() {
    let (tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    let base = oid(&repo, "refs/heads/main").unwrap();
    let theirs = saved_elsewhere(&repo, base, "carol");
    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    fetched(&repo, other.public_key(), theirs);

    // A device that had the actor before the split keeps its head, and the
    // node goes on fetching for it.
    let joining = AppState {
        profile: test::profile(&tmp.path().join("joining"), [0xdd; 32]),
    };
    fetch(&joining, &state, rid);
    assert_eq!(joining.joinable_actor(rid).unwrap().keys.len(), 2);

    // A first fetch during the split finds no head to set, and the node
    // fetches nothing more into a copy without one: an approval would never
    // arrive.
    let copy = joining.profile.storage.repository(rid).unwrap();
    copy.backend
        .find_reference("refs/heads/main")
        .unwrap()
        .delete()
        .unwrap();
    assert!(joining.profile.storage.contains(&rid).is_err());

    let refused = joining.joinable_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::CopyStuck(r)) if r == rid));
    let refused = joining.join_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::CopyStuck(r)) if r == rid));

    // This device wrote nothing to the copy, so storage drops it whole, and
    // the next fetch starts from nothing.
    joining.clean(rid).unwrap();
    let refused = joining.joinable_actor(rid).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::NotFetched(r)) if r == rid));
}

#[test]
fn seeding_again_keeps_the_scope_the_user_set() {
    use radicle::node::policy::{Scope, SeedingPolicy};

    let (tmp, _, rid) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };
    let scope = |state: &AppState| {
        let policies = state.profile.policies().unwrap();
        match (*policies).seed_policy(&rid).unwrap().unwrap().policy {
            SeedingPolicy::Allow { scope } => scope,
            SeedingPolicy::Block => panic!("the repository is blocked"),
        }
    };

    other.seed(rid).unwrap();
    assert_eq!(scope(&other), Scope::All);

    other
        .profile
        .policies_mut()
        .unwrap()
        .seed(&rid, Scope::Followed)
        .unwrap();
    other.seed(rid).unwrap();
    assert_eq!(scope(&other), Scope::Followed);
}

#[test]
fn a_project_without_a_head_is_not_taken_for_a_split_actor() {
    use radicle::test::fixtures;

    let (tmp, state, _) = actor_state();
    let signer = key(0xff);
    let (project, ..) =
        fixtures::project(tmp.path().join("project"), &state.profile.storage, &signer).unwrap();
    let joining = AppState {
        profile: test::profile(&tmp.path().join("joining"), [0xdd; 32]),
    };
    fetch(&joining, &state, project);
    let copy = joining.profile.storage.repository(project).unwrap();
    let branches = ["refs/heads/master".to_owned(), {
        let key = signer.public_key();
        format!("refs/namespaces/{key}/refs/heads/master")
    }];
    for branch in branches {
        copy.backend
            .find_reference(&branch)
            .unwrap()
            .delete()
            .unwrap();
    }
    assert!(joining.profile.storage.contains(&project).is_err());

    let refused = joining.joinable_actor(project).unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::NotJoinable(r)) if r == project));
}

/// Puts `file` as the profile on the branch of `other`, on a commit of its
/// own over the canonical head: a version this device does not have.
fn their_version(
    repo: &radicle::storage::git::Repository,
    other: &SigningKey,
    file: &str,
) -> radicle::git::raw::Oid {
    let parent = repo
        .backend
        .find_commit(oid(repo, "refs/heads/main").unwrap())
        .unwrap();
    let root = parent.tree().unwrap();
    let folder = root.get_name(".radicle").unwrap().to_object(&repo.backend);
    let mut folder = repo.backend.treebuilder(folder.unwrap().as_tree()).unwrap();
    let blob = repo.backend.blob(file.as_bytes()).unwrap();
    folder.insert("profile.json", blob, 0o100_644).unwrap();
    let mut root = repo.backend.treebuilder(Some(&root)).unwrap();
    root.insert(".radicle", folder.write().unwrap(), 0o040_000)
        .unwrap();
    let tree = repo.backend.find_tree(root.write().unwrap()).unwrap();

    let signature = repo.backend.signature().unwrap();
    let theirs = repo
        .backend
        .commit(None, &signature, &signature, "Edit", &tree, &[&parent])
        .unwrap();
    let branch = format!("refs/namespaces/{}/refs/heads/main", other.public_key());
    repo.backend
        .reference(&branch, theirs, true, "fetch")
        .unwrap();

    theirs
}

#[test]
fn another_controllers_version_is_cleaned_before_it_is_shown() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();

    their_version(
        &repo,
        &other,
        "{\"version\": 1, \"displayName\": \"ca\u{202e}rol\"}",
    );

    let split = state.actor().unwrap().unwrap();
    assert_eq!(
        split.forks[0].profile.as_ref().unwrap().display_name,
        "carol"
    );
    let changes = split.forks[0].changes.as_ref().unwrap();
    assert!(changes.contains("+  \"displayName\": \"carol\""));
}

#[test]
fn a_newer_version_elsewhere_is_never_replaced() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    let canonical = oid(&repo, "refs/heads/main");

    their_version(
        &repo,
        &other,
        r#"{"version": 2, "displayName": "carol", "later": true}"#,
    );

    let split = state.actor().unwrap().unwrap();
    assert!(split.forks[0].profile_newer);

    let refused = state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::ProfileNewer)));
    assert_eq!(oid(&repo, "refs/heads/main"), canonical);
}

#[test]
fn a_version_elsewhere_that_cannot_be_read_is_still_reported() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();

    let theirs = their_version(&repo, &other, "no profile");

    let split = state.actor().unwrap().unwrap();
    assert_eq!(split.forks.len(), 1);
    assert_eq!(split.forks[0].head, theirs);
    assert!(split.forks[0].profile.is_none());
    assert_eq!(split.forks[0].base.as_ref().unwrap().display_name, "alice");
}

#[test]
fn two_versions_that_each_merged_the_other_have_no_one_split_point() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    // A picture both versions have had all along.
    let base = {
        let parent = repo
            .backend
            .find_commit(oid(&repo, "refs/heads/main").unwrap())
            .unwrap();
        let blob = repo.backend.blob(b"a picture").unwrap();
        let mut root = repo
            .backend
            .treebuilder(Some(&parent.tree().unwrap()))
            .unwrap();
        root.insert("avatar.png", blob, 0o100_644).unwrap();
        let tree = repo.backend.find_tree(root.write().unwrap()).unwrap();
        let signature = repo.backend.signature().unwrap();
        let with_picture = repo
            .backend
            .commit(None, &signature, &signature, "Add", &tree, &[&parent])
            .unwrap();
        moved_to(&repo, &state, with_picture);

        with_picture
    };

    // Both devices save apart, and then each closes the split before it has
    // the other's merge.
    let theirs = saved_elsewhere(&repo, base, "carol");
    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    let mine = oid(&repo, "refs/heads/main").unwrap();
    fetched(&repo, other.public_key(), theirs);
    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    let their_merge = {
        let parents = [theirs, mine].map(|parent| repo.backend.find_commit(parent).unwrap());
        let tree = actor::profile_tree(
            &repo.backend,
            Some(&parents[0].tree().unwrap()),
            &named("dave"),
        )
        .unwrap();
        let signature = repo.backend.signature().unwrap();
        repo.backend
            .commit(
                None,
                &signature,
                &signature,
                "Merge",
                &tree,
                &[&parents[0], &parents[1]],
            )
            .unwrap()
    };
    fetched(&repo, other.public_key(), their_merge);

    // Either save could be called the point they split at, so neither is.
    let split = state.actor().unwrap().unwrap();
    assert_eq!(split.forks.len(), 1);
    assert_eq!(
        split.forks[0].profile.as_ref().unwrap().display_name,
        "dave"
    );
    assert!(split.forks[0].base.is_none());
    assert!(split.forks[0].changes.is_none());
    // With no point to count from, the other files are those that differ
    // from this device's version, and the picture does not.
    assert!(!split.forks[0].other_files);
}

/// Points the canonical branch and this device's own at `commit`, as a save
/// from this device would.
fn moved_to(
    repo: &radicle::storage::git::Repository,
    state: &AppState,
    commit: radicle::git::raw::Oid,
) {
    let own = format!(
        "refs/namespaces/{}/refs/heads/main",
        state.profile.public_key
    );
    for branch in ["refs/heads/main", own.as_str()] {
        repo.backend
            .reference(branch, commit, true, "save")
            .unwrap();
    }
}

#[test]
fn a_split_from_a_newer_profile_is_not_told_from_a_trimmed_one() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();

    // Another app wrote the profile both versions start from.
    let newer = their_version(
        &repo,
        &other,
        r#"{"version": 2, "displayName": "alice", "later": true}"#,
    );
    moved_to(&repo, &state, newer);
    their_version(&repo, &other, r#"{"version": 1, "displayName": "carol"}"#);

    let split = state.actor().unwrap().unwrap();
    assert_eq!(split.forks.len(), 1);
    assert_eq!(
        split.forks[0].profile.as_ref().unwrap().display_name,
        "carol"
    );
    assert!(split.forks[0].base.is_none());
    assert!(split.forks[0].changes.is_none());
}

#[test]
fn a_branch_that_cannot_be_walked_does_not_hide_the_profile() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();

    // The other controller's branch points at something that is no commit.
    let blob = repo.backend.blob(b"no commit").unwrap();
    let branch = format!("refs/namespaces/{}/refs/heads/main", other.public_key());
    repo.backend
        .reference(&branch, blob, true, "fetch")
        .unwrap();

    let shown = state.actor().unwrap().unwrap();
    assert_eq!(shown.profile.unwrap().display_name, "alice");
    assert!(shown.forks.is_empty());
}

#[test]
fn a_version_elsewhere_that_changed_other_files_says_so() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();

    let theirs = their_version(&repo, &other, r#"{"version": 1, "displayName": "carol"}"#);
    let split = state.actor().unwrap().unwrap();
    assert!(!split.forks[0].other_files);

    // The other device adds a picture next to the profile.
    let parent = repo.backend.find_commit(theirs).unwrap();
    let blob = repo.backend.blob(b"a picture").unwrap();
    let mut root = repo
        .backend
        .treebuilder(Some(&parent.tree().unwrap()))
        .unwrap();
    root.insert("avatar.png", blob, 0o100_644).unwrap();
    let tree = repo.backend.find_tree(root.write().unwrap()).unwrap();
    let signature = repo.backend.signature().unwrap();
    let with_picture = repo
        .backend
        .commit(None, &signature, &signature, "Add", &tree, &[&parent])
        .unwrap();
    let branch = format!("refs/namespaces/{}/refs/heads/main", other.public_key());
    repo.backend
        .reference(&branch, with_picture, true, "fetch")
        .unwrap();

    let split = state.actor().unwrap().unwrap();
    assert!(split.forks[0].other_files);
}

/// Gives `other` a copy of the actor at `rid` as `state` holds it now.
fn fetch(other: &AppState, state: &AppState, rid: RepoId) {
    let target = radicle::storage::git::paths::repository(&other.profile.storage, &rid);
    let _ = std::fs::remove_dir_all(&target);
    copy_dir(
        &radicle::storage::git::paths::repository(&state.profile.storage, &rid),
        &target,
    );
}

/// A key that makes a code for one actor, creates another, and then has the
/// code approved, with the role `controller`.
fn bound_twice(controller: bool) -> (tempfile::TempDir, AppState, AppState, RepoId, RepoId) {
    let (tmp, state, joined) = actor_state();
    // The machine of the key `0xee`.
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };
    fetch(&other, &state, joined);

    let code = other.join_actor(joined).unwrap();
    let created = other
        .create_actor(named("bob"), Default::default(), quiet())
        .unwrap()
        .rid;
    state.approve_enrollment(code, controller, quiet()).unwrap();
    fetch(&other, &state, joined);

    (tmp, state, other, joined, created)
}

#[test]
fn an_old_code_binds_a_key_that_has_made_its_own_actor() {
    let (_tmp, _state, other, joined, created) = bound_twice(true);

    let refused = other.actor().unwrap_err();
    assert!(
        matches!(&refused, Error::Actor(actor::Error::Ambiguous(rids))
            if rids.contains(&joined) && rids.contains(&created)),
        "{refused}"
    );
    let refused = other
        .update_actor_profile(named("carol"), Default::default(), quiet())
        .unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::Ambiguous(_))),
        "{refused}"
    );
}

#[test]
fn a_key_bound_twice_cannot_approve_its_own_removal() {
    let (_tmp, state, other, joined, _created) = bound_twice(true);
    let did = did_of(&key(0xee));

    // The actor's first controller revokes the key: with two controllers
    // the change waits for the key's own vote.
    let actor = state.remove_actor_key(did, quiet()).unwrap();
    assert!(actor.keys.iter().any(|key| key.did == did && key.bound));
    assert_eq!(actor.pending.len(), 1);

    // Approving acts on the local actor, and a key in two has none: it casts
    // this vote only by leaving the actor it names.
    fetch(&other, &state, joined);
    let refused = other
        .approve_actor_revision(actor.pending[0].id, quiet())
        .unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::Ambiguous(_))),
        "{refused}"
    );
}

#[test]
fn a_key_bound_twice_leaves_one_actor_by_its_own_vote() {
    let (_tmp, state, other, joined, created) = bound_twice(true);
    let did = did_of(&key(0xee));

    let mut both = other
        .actors_of_key()
        .unwrap()
        .iter()
        .map(|actor| actor.rid)
        .collect::<Vec<_>>();
    both.sort();
    let mut expected = vec![joined, created];
    expected.sort();
    assert_eq!(both, expected);

    // Two controllers: the key's vote proposes, and the other one decides.
    let leaving = other.leave_actor(joined, quiet()).unwrap();
    assert_eq!(leaving.rid, joined);
    assert!(leaving.keys.iter().any(|key| key.did == did));
    assert_eq!(leaving.pending.len(), 1);
    assert_eq!(leaving.pending[0].removed, vec![did]);
    assert_eq!(leaving.pending[0].accepted, vec![did]);

    fetch(&state, &other, joined);
    let left = state
        .approve_actor_revision(leaving.pending[0].id, quiet())
        .unwrap();
    assert!(!left.keys.iter().any(|key| key.did == did));

    fetch(&other, &state, joined);
    assert_eq!(other.actor().unwrap().unwrap().rid, created);
}

#[test]
fn leaving_accepts_the_removal_another_controller_proposed() {
    let (_tmp, state, other, joined, created) = bound_twice(true);
    let did = did_of(&key(0xee));
    state.remove_actor_key(did, quiet()).unwrap();
    fetch(&other, &state, joined);

    let left = other.leave_actor(joined, quiet()).unwrap();

    assert!(!left.keys.iter().any(|key| key.did == did));
    assert!(left.pending.is_empty());
    assert_eq!(other.actor().unwrap().unwrap().rid, created);
}

#[test]
fn a_key_leaves_only_an_actor_it_is_in_and_only_when_it_is_in_two() {
    let (_tmp, state, other, joined, created) = bound_twice(true);

    // The first controller is in one actor, and stays in it.
    let refused = state.leave_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::NotBound(rid)) if rid == created),
        "{refused}"
    );
    let refused = state.leave_actor(joined, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::RemoveSelf)),
        "{refused}"
    );
    assert_eq!(state.actors_of_key().unwrap().len(), 1);

    // An actor would be left without a controller.
    let refused = other.leave_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::OnlyController(rid)) if rid == created),
        "{refused}"
    );
    assert!(
        other
            .actors_of_key()
            .unwrap()
            .iter()
            .all(|a| a.pending.is_empty())
    );
}

#[test]
fn a_key_never_signs_its_leave_of_an_actor_from_a_newer_app() {
    let (_tmp, state, other, joined, _created) = bound_twice(true);

    // Both controllers accept a field this version does not define.
    let (first, second) = (key(0xff), key(0xee));
    let repo = state.profile.storage.repository_mut(joined).unwrap();
    let mut identity = Identity::load_mut(&repo, &first).unwrap();
    let doc = identity
        .doc()
        .clone()
        .with_edits(|raw| {
            raw.payload
                .get_mut(&PayloadId::from_str("dev.radicle.actor").unwrap())
                .unwrap()
                .as_object_mut()
                .unwrap()
                .insert("mood".into(), "unknown".into());
        })
        .unwrap();
    let id = identity
        .update(Title::new("Another app's payload").unwrap(), "", &doc)
        .unwrap();
    repo.sign_refs(&first).unwrap();
    let mut identity = Identity::load_mut(&repo, &second).unwrap();
    identity.accept(&id).unwrap();
    repo.sign_refs(&second).unwrap();
    repo.set_identity_head().unwrap();
    fetch(&other, &state, joined);

    let refused = other.leave_actor(joined, quiet()).unwrap_err();

    assert!(
        matches!(refused, Error::Actor(actor::Error::PayloadNewer)),
        "{refused}"
    );
    assert!(
        other
            .actors_of_key()
            .unwrap()
            .iter()
            .all(|a| a.pending.is_empty())
    );
}

/// A key bound twice, where both actors have another controller, so the key
/// could leave either.
fn bound_twice_and_free() -> (tempfile::TempDir, AppState, AppState, RepoId, RepoId) {
    let (tmp, state, joined) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };
    fetch(&other, &state, joined);

    let code = other.join_actor(joined).unwrap();
    let created = other
        .create_actor(named("bob"), Default::default(), quiet())
        .unwrap()
        .rid;
    let repo = other.profile.storage.repository(created).unwrap();
    let third = Enrollment::sign(created, repo.identity().unwrap().current, &key(0xdd));
    other
        .approve_enrollment(third.encode(), true, quiet())
        .unwrap();
    state.approve_enrollment(code, true, quiet()).unwrap();
    fetch(&other, &state, joined);

    (tmp, state, other, joined, created)
}

#[test]
fn a_key_leaves_one_actor_at_a_time() {
    // The key would be in no actor if both removals went through.
    let (_tmp, state, other, joined, created) = bound_twice_and_free();

    let leaving = other.leave_actor(joined, quiet()).unwrap();
    let refused = other.leave_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::Leaving(rid)) if rid == joined),
        "{refused}"
    );
    // Asking again for the same one is no second leave.
    other.leave_actor(joined, quiet()).unwrap();

    // One rejection of two controllers closes the change, and the key may
    // leave the other actor instead.
    fetch(&state, &other, joined);
    state
        .reject_actor_revision(leaving.pending[0].id, quiet())
        .unwrap();
    fetch(&other, &state, joined);

    let leaving = other.leave_actor(created, quiet()).unwrap();
    assert_eq!(leaving.pending.len(), 1);
}

#[test]
fn a_key_bound_twice_without_control_is_removed_by_the_controller() {
    let (_tmp, state, other, joined, created) = bound_twice(false);
    let did = did_of(&key(0xee));

    let actor = state.remove_actor_key(did, quiet()).unwrap();
    assert!(!actor.keys.iter().any(|key| key.did == did));

    fetch(&other, &state, joined);
    assert_eq!(other.actor().unwrap().unwrap().rid, created);
}

#[test]
fn a_key_without_control_is_told_who_can_remove_it() {
    let (_tmp, _state, other, joined, _created) = bound_twice(false);
    let controller = did_of(&key(0xff));

    let refused = other.leave_actor(joined, quiet()).unwrap_err();

    assert!(
        matches!(
            &refused,
            Error::Actor(actor::Error::LeaveNeedsController { rid, controllers })
                if *rid == joined && *controllers == vec![controller]
        ),
        "{refused}"
    );
    assert!(refused.to_string().contains(&controller.to_string()));
}

#[test]
fn a_cancelled_leave_frees_the_key_to_leave_either_actor() {
    let (_tmp, _state, other, joined, created) = bound_twice_and_free();
    let did = did_of(&key(0xee));
    let first = other.leave_actor(joined, quiet()).unwrap().pending[0].id;

    // The other controller may never answer, so the key takes its leave back.
    let stayed = other.cancel_leave(joined, quiet()).unwrap();
    assert_eq!(stayed.rid, joined);
    assert!(stayed.pending.is_empty());
    assert!(stayed.keys.iter().any(|key| key.did == did));

    let refused = other.cancel_leave(joined, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::NotLeaving(rid)) if rid == joined),
        "{refused}"
    );

    // Leaving the same actor again is a new change.
    let again = other.leave_actor(joined, quiet()).unwrap();
    assert_eq!(again.pending.len(), 1);
    assert_ne!(again.pending[0].id, first);
    other.cancel_leave(joined, quiet()).unwrap();

    let leaving = other.leave_actor(created, quiet()).unwrap();
    assert_eq!(leaving.pending.len(), 1);
}

#[test]
fn a_key_cancels_only_a_leave_it_proposed() {
    let (tmp, state, joined) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };
    // Four controllers in the end, so two votes leave a change open.
    let (first, second) = (key(0xff), key(0xdd));
    {
        let repo = state.profile.storage.repository_mut(joined).unwrap();
        let mut identity = Identity::load_mut(&repo, &first).unwrap();
        let mut doc = identity.doc().clone().edit();
        doc.delegate(did_of(&second));
        doc.delegate(did_of(&key(0xcc)));
        identity
            .update(
                Title::new("Add controllers").unwrap(),
                "",
                &doc.verified().unwrap(),
            )
            .unwrap();
        repo.sign_refs(&first).unwrap();
        repo.set_identity_head().unwrap();
    }
    fetch(&other, &state, joined);
    let code = other.join_actor(joined).unwrap();
    let created = other
        .create_actor(named("bob"), Default::default(), quiet())
        .unwrap()
        .rid;
    let enrolling = state.approve_enrollment(code, true, quiet()).unwrap();
    let accept = |signer: &SigningKey, id| {
        let repo = state.profile.storage.repository_mut(joined).unwrap();
        Identity::load_mut(&repo, signer)
            .unwrap()
            .accept(&id)
            .unwrap();
        repo.sign_refs(signer).unwrap();
        repo.set_identity_head().unwrap();
    };
    accept(&second, enrolling.pending[0].id);

    let did = did_of(&key(0xee));
    state.remove_actor_key(did, quiet()).unwrap();
    fetch(&other, &state, joined);
    let leaving = other.leave_actor(joined, quiet()).unwrap();
    assert_eq!(leaving.pending.len(), 1);
    assert_eq!(leaving.pending[0].accepted.len(), 2);

    let refused = other.cancel_leave(joined, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::LeaveNotOwn(rid)) if rid == joined),
        "{refused}"
    );
    let refused = other.leave_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::Leaving(rid)) if rid == joined),
        "{refused}"
    );
}

#[test]
fn a_change_that_only_unbinds_the_key_counts_as_its_leave() {
    let (_tmp, _state, other, joined, created) = bound_twice(true);
    let (signer, did) = (key(0xee), did_of(&key(0xee)));

    // Another tool proposes, as the key, to drop it from the keys and keep
    // it a controller.
    let repo = other.profile.storage.repository_mut(joined).unwrap();
    let mut identity = Identity::load_mut(&repo, &signer).unwrap();
    let doc = identity
        .doc()
        .clone()
        .with_edits(|raw| {
            raw.payload
                .get_mut(&PayloadId::from_str("dev.radicle.actor").unwrap())
                .unwrap()
                .as_object_mut()
                .unwrap()["keys"]
                .as_object_mut()
                .unwrap()
                .remove(&did.to_string());
        })
        .unwrap();
    identity
        .update(Title::new("Unbind").unwrap(), "", &doc)
        .unwrap();
    repo.sign_refs(&signer).unwrap();

    let refused = other.leave_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::Leaving(rid)) if rid == joined),
        "{refused}"
    );
}

#[test]
fn a_leave_that_could_not_be_read_back_writes_nothing() {
    let (_tmp, _state, other, joined, _created) = bound_twice(true);
    lose_profile_file(&other.profile.storage.repository(joined).unwrap());

    assert!(other.leave_actor(joined, quiet()).is_err());

    let listed = other.actors_of_key().unwrap();
    assert_eq!(listed.len(), 2);
    assert!(listed.iter().all(|actor| actor.pending.is_empty()));
}

/// The actor payload of `rid` as `state` holds it now, with its delegates.
fn payload_and_delegates(state: &AppState, rid: RepoId) -> (serde_json::Value, Vec<Did>) {
    let doc = state
        .profile
        .storage
        .repository(rid)
        .unwrap()
        .identity_doc()
        .unwrap()
        .doc;
    let payload = doc.payload()[&PayloadId::from_str("dev.radicle.actor").unwrap()].clone();

    (
        serde_json::to_value(payload).unwrap(),
        doc.delegates().iter().copied().collect(),
    )
}

#[test]
fn retiring_the_actor_a_key_alone_controls_leaves_it_in_the_other() {
    let (_tmp, _state, other, joined, created) = bound_twice(true);
    let (mut before, delegates) = payload_and_delegates(&other, created);

    let retired = other.retire_actor(created, quiet()).unwrap();
    assert_eq!(retired.rid, created);
    assert!(retired.pending.is_empty());

    // The flag and nothing else: the keys stay, so what they did stays theirs.
    before["retired"] = true.into();
    assert_eq!(payload_and_delegates(&other, created), (before, delegates));

    assert_eq!(other.actor().unwrap().unwrap().rid, joined);
    assert_eq!(other.actors_of_key().unwrap().len(), 1);
}

#[test]
fn a_key_retires_only_an_actor_it_is_in_and_controls() {
    let (_tmp, state, other, joined, created) = bound_twice(false);

    let refused = state.retire_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::NotBound(rid)) if rid == created),
        "{refused}"
    );
    let refused = other.retire_actor(joined, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::NotController)),
        "{refused}"
    );

    write_payload_field_as(&other, created, &key(0xee), "mood", "unknown".into());
    let refused = other.retire_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::PayloadNewer)),
        "{refused}"
    );
    assert_eq!(other.actors_of_key().unwrap().len(), 2);
}

#[test]
fn a_key_that_is_leaving_one_actor_does_not_retire_another() {
    // The key would be in no actor if the leave went through too.
    let (_tmp, _state, other, joined, created) = bound_twice(true);
    other.leave_actor(joined, quiet()).unwrap();

    let refused = other.retire_actor(created, quiet()).unwrap_err();
    assert!(
        matches!(refused, Error::Actor(actor::Error::Leaving(rid)) if rid == joined),
        "{refused}"
    );

    other.cancel_leave(joined, quiet()).unwrap();
    other.retire_actor(created, quiet()).unwrap();
    assert_eq!(other.actor().unwrap().unwrap().rid, joined);
}

#[test]
fn a_key_does_not_retire_an_actor_others_control_too() {
    // Desktop could neither show nor sign the change this would open.
    let (_tmp, _state, other, joined, _created) = bound_twice(true);

    let refused = other.retire_actor(joined, quiet()).unwrap_err();

    assert!(
        matches!(refused, Error::Actor(actor::Error::RetireShared(rid)) if rid == joined),
        "{refused}"
    );
    let listed = other.actors_of_key().unwrap();
    assert_eq!(listed.len(), 2);
    assert!(listed.iter().all(|actor| actor.pending.is_empty()));
}

#[test]
fn a_key_does_not_retire_its_last_actor() {
    let (_tmp, state, rid) = actor_state();

    let refused = state.retire_actor(rid, quiet()).unwrap_err();

    assert!(
        matches!(refused, Error::Actor(actor::Error::LastActor(last)) if last == rid),
        "{refused}"
    );
    assert_eq!(state.actor().unwrap().unwrap().rid, rid);
}

#[test]
fn a_retirement_that_could_not_be_read_back_writes_nothing() {
    let (_tmp, _state, other, _joined, created) = bound_twice(true);
    lose_profile_file(&other.profile.storage.repository(created).unwrap());

    assert!(other.retire_actor(created, quiet()).is_err());

    assert_eq!(other.actors_of_key().unwrap().len(), 2);
}

const PNG: &[u8] = b"\x89PNG\r\n\x1a\na picture";

fn with_avatar(bytes: &[u8]) -> actor::ProfileImages {
    use base64::Engine as _;

    actor::ProfileImages {
        avatar: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
        banner: None,
    }
}

#[test]
fn a_profile_is_created_and_saved_with_its_pictures() {
    let tmp = tempfile::tempdir().unwrap();
    let state = AppState {
        profile: test::profile(&tmp.path().join("home"), [0xff; 32]),
    };

    let created = state
        .create_actor(named("alice"), with_avatar(PNG), quiet())
        .unwrap();
    let rid = created.rid;
    assert_eq!(
        created.profile.unwrap().avatar.as_deref(),
        Some("avatar.png")
    );
    let picture = |head: radicle::git::Oid| state.repo_blob_bytes(rid, "avatar.png".into(), head);
    assert_eq!(picture(created.head.unwrap()).unwrap(), PNG);

    // A picture that is refused leaves the profile as it was.
    let refused = state
        .update_actor_profile(named("bob"), with_avatar(b"no picture"), quiet())
        .unwrap_err();
    assert!(matches!(refused, Error::Actor(actor::Error::Profile(_))));
    let current = state.actor().unwrap().unwrap();
    assert_eq!(current.head, created.head);

    let other = b"\x89PNG\r\n\x1a\nanother picture";
    let saved = state
        .update_actor_profile(named("alice"), with_avatar(other), quiet())
        .unwrap();
    assert_eq!(picture(saved.head.unwrap()).unwrap(), other);

    // A save that names no picture takes the file away.
    let cleared = state
        .update_actor_profile(named("alice"), Default::default(), quiet())
        .unwrap();
    assert!(cleared.profile.unwrap().avatar.is_none());
    assert!(picture(cleared.head.unwrap()).is_err());
}

#[test]
fn a_save_that_closes_a_split_keeps_the_picture_it_names() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    let base = repo
        .backend
        .find_commit(oid(&repo, "refs/heads/main").unwrap())
        .unwrap();

    // The other device saves a picture, apart from an edit on this one.
    let (theirs, pictures) = with_avatar(PNG).place(named("carol")).unwrap();
    let tree = actor::profile_tree_with(
        &repo.backend,
        Some(&base.tree().unwrap()),
        &theirs,
        &pictures,
        &[],
    )
    .unwrap();
    let signature = repo.backend.signature().unwrap();
    let their_commit = repo
        .backend
        .commit(None, &signature, &signature, "Edit", &tree, &[&base])
        .unwrap();
    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    fetched(&repo, other.public_key(), their_commit);

    let saved = state
        .update_actor_profile(theirs, Default::default(), quiet())
        .unwrap();

    assert!(saved.forks.is_empty());
    let picture = state.repo_blob_bytes(rid, "avatar.png".into(), saved.head.unwrap());
    assert_eq!(picture.unwrap(), PNG);
}

/// The other key's change that enrolls `joining`, proposed on the identity
/// as it is.
fn proposed_by(state: &AppState, rid: RepoId, author: &SigningKey, joining: &SigningKey) {
    let enrollment = Enrollment::decode(&code(state, joining)).unwrap();
    let repo = state.profile.storage.repository(rid).unwrap();
    let doc = actor::enrolled_doc(&repo.identity_doc().unwrap().doc, &enrollment, true).unwrap();

    propose(state, rid, author, &doc);
}

#[test]
fn past_key_changes_are_listed_with_how_each_ended() {
    use crate::actor::RevisionState;

    let (_tmp, state, rid) = actor_state();
    let local = Did::from(state.profile.public_key);
    let other = key(0xee);
    let added = |revision: &actor::ActorRevision| {
        revision.added.iter().map(|key| key.did).collect::<Vec<_>>()
    };

    // The only controller adds a second, by its vote alone.
    state
        .approve_enrollment(code(&state, &other), true, quiet())
        .unwrap();

    // The second proposes a third key, and this one rejects it: with two
    // controllers that ends it.
    let refused = key(0x22);
    proposed_by(&state, rid, &other, &refused);
    let id = state.actor().unwrap().unwrap().pending[0].id;
    state.reject_actor_revision(id, quiet()).unwrap();

    // A third controller comes in by both votes.
    let third = key(0x66);
    let accept = |by: &SigningKey, id: radicle::git::Oid| {
        let repo = state.profile.storage.repository_mut(rid).unwrap();
        Identity::load_mut(&repo, by).unwrap().accept(&id).unwrap();
    };
    let proposed = |joining: &SigningKey| {
        let pending = state
            .approve_enrollment(code(&state, joining), true, quiet())
            .unwrap()
            .pending;
        pending
            .into_iter()
            .find(|open| open.author == local)
            .unwrap()
            .id
    };
    accept(&other, proposed(&third));

    // Two of them each propose another key on the same identity, and the
    // remaining one accepts this key's: the other change can no longer apply.
    let (taken, passed_over) = (key(0x33), key(0x44));
    proposed_by(&state, rid, &third, &passed_over);
    accept(&other, proposed(&taken));

    // One more is still open, and is not among the past ones.
    proposed_by(&state, rid, &other, &key(0x55));
    let open = state.actor().unwrap().unwrap().pending;
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].state, RevisionState::Open);

    let past = state.closed_actor_revisions().unwrap();
    let told = past
        .iter()
        .map(|revision| (revision.state, added(revision)))
        .collect::<Vec<_>>();
    assert_eq!(
        told,
        [
            (RevisionState::Accepted, vec![did_of(&taken)]),
            (RevisionState::Lapsed, vec![did_of(&passed_over)]),
            (RevisionState::Accepted, vec![did_of(&third)]),
            (RevisionState::Rejected, vec![did_of(&refused)]),
            (RevisionState::Accepted, vec![did_of(&other)]),
            // The first version adds the key the actor starts with.
            (RevisionState::Accepted, vec![local]),
        ]
    );

    // The votes are those of the controllers of the time.
    let rejected = &past[3];
    assert_eq!(rejected.author, did_of(&other));
    assert_eq!(rejected.accepted, [did_of(&other)]);
    assert_eq!(rejected.rejected, [local]);
    assert_eq!(past[4].accepted, [local]);
    assert!(past[4].added[0].controller);
    assert!(past.iter().all(|revision| !revision.unreadable));
}

#[test]
fn the_versions_of_a_profile_are_listed_with_what_each_changed() {
    let (_tmp, state, _) = actor_state();
    let local = Did::from(state.profile.public_key);
    let bio = |text: &str| ActorProfile {
        bio: Some(text.to_string()),
        ..named("bob")
    };
    let pictured = || ActorProfile {
        avatar: Some("avatar.png".to_string()),
        ..bio("Curiouser.")
    };
    let other = b"\x89PNG\r\n\x1a\nanother picture";

    state
        .update_actor_profile(bio("Curiouser."), Default::default(), quiet())
        .unwrap();
    state
        .update_actor_profile(bio("Curiouser."), with_avatar(PNG), quiet())
        .unwrap();
    // The picture again, under the name it has.
    state
        .update_actor_profile(pictured(), with_avatar(other), quiet())
        .unwrap();

    let all = state.actor_profile_history(None, None).unwrap();
    assert!(!all.more);
    let fields = all
        .content
        .iter()
        .map(|edit| edit.fields.clone().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        fields,
        [
            vec!["avatar"],
            vec!["avatar"],
            vec!["displayName", "bio"],
            // What the first version sets.
            vec!["displayName"],
        ]
    );
    let head = state.actor().unwrap().unwrap().head.unwrap();
    assert_eq!(all.content[0].commit, head);
    assert_eq!(all.content[0].parents, [all.content[1].commit]);
    assert!(all.content[3].parents.is_empty());
    assert!(all.content.iter().all(|edit| edit.live));
    assert!(all.content.iter().all(|edit| edit.author == Some(local)));

    // A page says whether more follow it.
    let commits = |skip, take| {
        let page = state.actor_profile_history(Some(skip), Some(take)).unwrap();
        let commits = page
            .content
            .iter()
            .map(|edit| edit.commit)
            .collect::<Vec<_>>();
        (commits, page.more)
    };
    let listed = all
        .content
        .iter()
        .map(|edit| edit.commit)
        .collect::<Vec<_>>();
    assert_eq!(commits(0, 3), (listed[..3].to_vec(), true));
    assert_eq!(commits(3, 3), (listed[3..].to_vec(), false));
    assert_eq!(commits(4, 3), (Vec::new(), false));
}

#[test]
fn a_joined_split_is_one_version_over_two() {
    let (_tmp, state, rid) = actor_state();
    let other = key(0xee);
    share_with(&state, rid, &other, 1);
    let repo = state.profile.storage.repository(rid).unwrap();
    let base = oid(&repo, "refs/heads/main").unwrap();
    let theirs = saved_elsewhere(&repo, base, "carol");
    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    let mine = oid(&repo, "refs/heads/main").unwrap();
    fetched(&repo, other.public_key(), theirs);

    // Until the save, the other version is none of this key's.
    let before = state.actor_profile_history(None, None).unwrap().content;
    assert!(before.iter().all(|edit| edit.commit != theirs));

    state
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();
    let after = state.actor_profile_history(None, None).unwrap().content;

    let parents = [mine, theirs].map(radicle::git::Oid::from);
    assert_eq!(after[0].parents, parents);
    // Told against the version it was saved over, which is this key's.
    assert_eq!(after[0].fields.as_deref(), Some(&[][..]));
    let other_version = after.iter().find(|edit| edit.commit == theirs).unwrap();
    assert_eq!(
        other_version.fields.as_deref(),
        Some(&["displayName".to_string()][..])
    );
    assert!(after.iter().all(|edit| edit.live));
}

#[test]
fn a_save_that_waits_for_a_controller_is_listed_as_waiting() {
    let (tmp, state, rid) = actor_state();
    let other = AppState {
        profile: test::profile(&tmp.path().join("other"), [0xee; 32]),
    };
    let code = {
        fetch(&other, &state, rid);
        other.join_actor(rid).unwrap()
    };
    state.approve_enrollment(code, false, quiet()).unwrap();
    fetch(&other, &state, rid);

    other
        .update_actor_profile(named("bob"), Default::default(), quiet())
        .unwrap();

    let listed = other.actor_profile_history(None, None).unwrap().content;
    assert_eq!(listed.len(), 2);
    assert!(!listed[0].live);
    assert!(listed[1].live);
    // The controller's copy has no such version.
    assert_eq!(
        state
            .actor_profile_history(None, None)
            .unwrap()
            .content
            .len(),
        1
    );
}

#[test]
fn a_version_that_cannot_be_read_is_listed_without_what_it_changed() {
    let (_tmp, state, rid) = actor_state();
    let repo = state.profile.storage.repository(rid).unwrap();
    let own = |commit| moved_to(&repo, &state, commit);
    let over = |tree: radicle::git::raw::Oid| {
        let parent = repo
            .backend
            .find_commit(oid(&repo, "refs/heads/main").unwrap())
            .unwrap();
        let signature = repo.backend.signature().unwrap();
        let tree = repo.backend.find_tree(tree).unwrap();
        repo.backend
            .commit(None, &signature, &signature, "Edit", &tree, &[&parent])
            .unwrap()
    };
    let fields = || {
        let listed = state.actor_profile_history(None, None).unwrap().content;
        listed[0].fields.clone()
    };

    // A file whose contents never arrived.
    lose_profile_file(&repo);
    own(oid(&repo, "refs/heads/main").unwrap());
    assert_eq!(fields(), None);
    assert_eq!(
        state
            .actor_profile_history(None, None)
            .unwrap()
            .content
            .len(),
        2
    );

    // No profile file at all sets no field, so the save after it sets its own.
    let empty = repo.backend.treebuilder(None).unwrap().write().unwrap();
    own(over(empty));
    assert_eq!(fields(), None, "told against a version that cannot be read");
    let with_profile = actor::profile_tree(&repo.backend, None, &named("bob")).unwrap();
    own(over(with_profile.id()));
    assert_eq!(fields(), Some(vec!["displayName".to_string()]));

    // A profile from a newer version is not told apart field by field.
    let newer = their_version(
        &repo,
        &key(0xee),
        r#"{"version": 2, "displayName": "bob", "later": true}"#,
    );
    own(newer);
    assert_eq!(fields(), None);
}
