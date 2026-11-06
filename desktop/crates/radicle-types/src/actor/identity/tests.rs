use std::str::FromStr;

use radicle::crypto::{Seed, Signer as _, SigningKey};
use radicle::git;
use radicle::identity::doc::{Payload, PayloadId};
use radicle::identity::project::ProjectName;
use radicle::identity::{Did, Doc, Project, RepoId, Visibility};

use super::*;

fn key(seed: u8) -> SigningKey {
    SigningKey::from_seed(Seed::new([seed; 32]))
}

fn did_of(key: &SigningKey) -> Did {
    Did::from(*key.public_key())
}

fn did() -> Did {
    did_of(&key(7))
}

fn oid(byte: u8) -> git::Oid {
    git::raw::Oid::from_bytes(&[byte; 20]).unwrap().into()
}

fn rid() -> RepoId {
    RepoId::from(oid(42))
}

fn payload_id() -> PayloadId {
    PayloadId::from_str("dev.radicle.actor").unwrap()
}

/// The payload an actor is created with, as `initial_doc` writes it.
fn founding_payload(did: Did) -> ActorPayload {
    ActorPayload::of(&initial_doc("alice", "master", did).unwrap()).unwrap()
}

fn root() -> IdentityDocRevision {
    IdentityDocRevision {
        commit: oid(1),
        time: 1,
        doc: initial_doc("alice", "master", did()).unwrap(),
    }
}

fn copy(revision: &IdentityDocRevision) -> IdentityDocRevision {
    IdentityDocRevision {
        commit: revision.commit,
        time: revision.time,
        doc: revision.doc.clone(),
    }
}

fn bound(resolved: &ResolvedActor) -> Vec<Did> {
    resolved.bound_keys().collect()
}

fn recovery(resolved: &ResolvedActor) -> Vec<Did> {
    resolved
        .keys
        .iter()
        .filter(|k| !k.bound && k.controller)
        .map(|k| k.did)
        .collect()
}

/// `previous` edited: `payload` replaces the actor payload and
/// `delegates`, when given, the delegate list.
fn revision(
    previous: &IdentityDocRevision,
    commit: u8,
    payload: &ActorPayload,
    delegates: Option<Vec<Did>>,
) -> IdentityDocRevision {
    let value = serde_json::to_value(payload).unwrap();
    let doc = previous
        .doc
        .clone()
        .with_edits(|raw| {
            raw.payload.insert(payload_id(), Payload::from(value));
            if let Some(delegates) = delegates {
                raw.delegates = delegates;
            }
        })
        .unwrap();
    IdentityDocRevision {
        commit: oid(commit),
        time: i64::from(commit),
        doc,
    }
}

fn with_payload(revision: &IdentityDocRevision, payload: serde_json::Value) -> IdentityDocRevision {
    IdentityDocRevision {
        commit: revision.commit,
        time: revision.time,
        doc: revision
            .doc
            .clone()
            .with_edits(|raw| {
                raw.payload.insert(payload_id(), Payload::from(payload));
            })
            .unwrap(),
    }
}

fn consent(key: &SigningKey, parent: git::Oid) -> String {
    Enrollment::sign(rid(), parent, key).consent()
}

#[test]
fn initial_doc_marks_the_actor() {
    let did = did();
    let doc = initial_doc("alice", "master", did).unwrap();
    let payload = ActorPayload::of(&doc).unwrap();

    assert_eq!(payload.version, 1);
    assert_eq!(payload.kind, ActorKind::Person);
    assert_eq!(payload.keys.get(&did).map(String::as_str), Some("root"));
    assert_eq!(doc.delegates().iter().collect::<Vec<_>>(), vec![&did]);
    assert_eq!(doc.project().unwrap().default_branch().as_str(), "master");
}

#[test]
fn a_plain_project_is_not_an_actor() {
    let project = Project::new(
        "alice".to_string().try_into().unwrap(),
        String::new(),
        git::fmt::RefString::try_from("master").unwrap(),
    )
    .unwrap();
    let doc = Doc::initial(project, did(), Visibility::Public);

    assert!(ActorPayload::of(&doc).is_none());
    let plain = IdentityDocRevision {
        commit: oid(1),
        time: 1,
        doc,
    };
    assert!(resolve(rid(), &[copy(&plain)]).is_none());

    // The payload arriving in a later revision does not make an actor.
    let later = revision(&plain, 2, &founding_payload(did()), None);
    assert!(resolve(rid(), &[plain, later]).is_none());
}

#[test]
fn a_payload_keeps_the_fields_this_version_does_not_model() {
    let root = root();
    let whole = serde_json::json!({
        "version": 1,
        "type": "person",
        "keys": {},
        "migrations": [{ "from": "did:key:z6MkOld", "to": "did:key:z6MkNew" }],
        "names": { "alice": "proof" },
        "mood": "unknown to this version",
    });

    let payload = ActorPayload::of(&with_payload(&root, whole.clone()).doc).unwrap();

    assert_eq!(serde_json::to_value(&payload).unwrap(), whole);
}

#[test]
fn the_payload_is_validated() {
    let root = root();
    let did = did();
    use serde_json::json;

    let plain = ActorPayload::of(&with_payload(&root, json!({ "version": 1 })).doc).unwrap();
    assert_eq!(plain.kind, ActorKind::Person);
    assert!(plain.keys.is_empty());

    for invalid in [
        json!({ "type": "person" }),
        json!({ "version": 0 }),
        json!({ "version": 1, "type": "robot" }),
        json!({ "version": 1, "keys": { "alice": "root" } }),
    ] {
        assert!(
            ActorPayload::of(&with_payload(&root, invalid.clone()).doc).is_none(),
            "{invalid}"
        );
    }

    let newer = with_payload(
        &root,
        json!({
            "version": 2,
            "type": "agent",
            "keys": { did.to_string(): "root" },
            "mood": "new",
        }),
    );
    let payload = ActorPayload::of(&newer.doc).unwrap();
    assert_eq!(payload.kind, ActorKind::Agent);
    let resolved = resolve(rid(), &[newer]).unwrap();
    assert!(resolved.payload_newer);
    assert_eq!(bound(&resolved), vec![did]);
}

#[test]
fn the_root_decides_what_is_an_actor() {
    let did = did();
    let other = did_of(&key(8));
    let root = root();

    // Two delegates in the root do not make an actor.
    let two = IdentityDocRevision {
        commit: oid(1),
        time: 1,
        doc: root
            .doc
            .clone()
            .with_edits(|raw| raw.delegates.push(other))
            .unwrap(),
    };
    assert!(resolve(rid(), &[two]).is_none());

    // A root entry for a key other than the founding one is ignored.
    let mut payload = founding_payload(did);
    payload.keys.insert(other, "root".to_string());
    let claimed = with_payload(&root, serde_json::to_value(&payload).unwrap());
    let resolved = resolve(rid(), &[claimed]).unwrap();
    assert_eq!(bound(&resolved), vec![did]);
    assert!(recovery(&resolved).is_empty());

    // A current document that dropped the payload is not an actor.
    let dropped = IdentityDocRevision {
        commit: oid(2),
        time: 2,
        doc: root
            .doc
            .clone()
            .with_edits(|raw| {
                raw.payload.remove(&payload_id());
            })
            .unwrap(),
    };
    assert!(resolve(rid(), &[root, dropped]).is_none());
}

#[test]
fn a_key_is_bound_only_with_its_consent() {
    let founding = key(7);
    let joining = key(9);
    let root = root();
    let mut payload = founding_payload(did_of(&founding));

    // Claimed without consent: a controller, not a bound key.
    payload
        .keys
        .insert(did_of(&joining), "zinvalid".to_string());
    let claimed = revision(
        &root,
        2,
        &payload,
        Some(vec![did_of(&founding), did_of(&joining)]),
    );
    let resolved = resolve(rid(), &[copy(&root), claimed]).unwrap();
    assert_eq!(bound(&resolved), vec![did_of(&founding)]);
    assert_eq!(recovery(&resolved), vec![did_of(&joining)]);
    assert_eq!(
        resolved.keys[1].added_at, 2,
        "added when it became a delegate"
    );

    // Consent anchored to another revision does not count.
    payload
        .keys
        .insert(did_of(&joining), consent(&joining, oid(3)));
    let elsewhere = revision(&root, 2, &payload, None);
    let resolved = resolve(rid(), &[copy(&root), elsewhere]).unwrap();
    assert_eq!(bound(&resolved), vec![did_of(&founding)]);

    // Consent by another key does not count.
    payload
        .keys
        .insert(did_of(&joining), consent(&founding, root.commit));
    let forged = revision(&root, 2, &payload, None);
    let resolved = resolve(rid(), &[copy(&root), forged]).unwrap();
    assert_eq!(bound(&resolved), vec![did_of(&founding)]);

    // The right signature in another multibase does not count either.
    let signature = Enrollment::sign(rid(), root.commit, &joining)
        .signature
        .to_bytes();
    payload.keys.insert(
        did_of(&joining),
        multibase::encode(multibase::Base::Base64, signature),
    );
    let base64 = revision(&root, 2, &payload, None);
    let resolved = resolve(rid(), &[copy(&root), base64]).unwrap();
    assert_eq!(bound(&resolved), vec![did_of(&founding)]);

    // Consent anchored to the head it extends binds the key, and stays
    // bound through later revisions that carry the entry forward.
    payload
        .keys
        .insert(did_of(&joining), consent(&joining, root.commit));
    let enrolled = revision(&root, 2, &payload, None);
    let mut later_payload = payload.clone();
    later_payload.kind = ActorKind::Agent;
    let later = revision(&enrolled, 3, &later_payload, None);
    let resolved = resolve(rid(), &[copy(&root), copy(&enrolled), later]).unwrap();
    assert_eq!(bound(&resolved), vec![did_of(&founding), did_of(&joining)]);
    assert_eq!(resolved.kind, ActorKind::Agent);
    assert!(recovery(&resolved).is_empty());
    assert_eq!(resolved.keys[0].added_at, 1);
    assert_eq!(
        resolved.keys[1].added_at, 2,
        "added when enrolled, not when carried forward"
    );
    assert!(!resolved.keys[1].controller);

    // Removing the entry and restating the old statement later does not
    // bind the key again: the anchor has moved.
    let mut removed_payload = later_payload.clone();
    removed_payload.keys.remove(&did_of(&joining));
    let removed = revision(&enrolled, 3, &removed_payload, None);
    let restated = revision(&removed, 4, &later_payload, None);
    let resolved = resolve(rid(), &[root, enrolled, removed, restated]).unwrap();
    assert_eq!(bound(&resolved), vec![did_of(&founding)]);
}

#[test]
fn a_revision_that_cannot_be_read_is_stepped_over() {
    let did = did();
    let root = root();
    let unreadable = with_payload(
        &root,
        serde_json::json!({ "version": 1, "type": "weather", "keys": { did.to_string(): "root" } }),
    );
    assert!(ActorPayload::of(&unreadable.doc).is_none());
    let repaired = revision(&unreadable, 3, &founding_payload(did), None);

    // The founding key stays bound: its entry is unchanged since the root,
    // and the bad revision in between is no introduction.
    let resolved = resolve(rid(), &[copy(&root), unreadable, repaired]).unwrap();
    assert_eq!(bound(&resolved), vec![did]);
}

#[test]
fn a_consent_is_not_replayed_through_an_unreadable_revision() {
    let founding = key(7);
    let joining = key(9);
    let root = root();
    let mut payload = founding_payload(did_of(&founding));
    payload
        .keys
        .insert(did_of(&joining), consent(&joining, root.commit));
    let joined = revision(&root, 2, &payload, None);
    assert_eq!(
        bound(&resolve(rid(), &[copy(&root), copy(&joined)]).unwrap()),
        vec![did_of(&founding), did_of(&joining)]
    );

    // A revision that cannot be read drops the key, and the next one adds it
    // back with the consent from before: that consent names the root as its
    // parent, which the revision adding it back does not extend.
    let dropped = with_payload(
        &joined,
        serde_json::json!({
            "version": 1, "type": "weather", "keys": { did_of(&founding).to_string(): "root" },
        }),
    );
    let replayed = revision(&dropped, 4, &payload, None);
    let resolved = resolve(rid(), &[copy(&root), joined, dropped, replayed]).unwrap();
    assert_eq!(bound(&resolved), vec![did_of(&founding)]);
}

#[test]
fn lifecycle_flags_are_read() {
    let root = root();
    let mut payload = founding_payload(did());
    payload.retired = true;
    let retired = revision(&root, 2, &payload, None);
    assert!(resolve(rid(), &[copy(&root), retired]).unwrap().retired);

    payload.retired = false;
    payload.superseded_by = Some(RepoId::from(oid(9)));
    let superseded = revision(&root, 2, &payload, None);
    assert_eq!(
        resolve(rid(), &[root, superseded]).unwrap().superseded_by,
        Some(RepoId::from(oid(9)))
    );
}

#[test]
fn the_repo_name_derives_from_the_display_name() {
    assert_eq!(repo_name("Alice Liddell", "alice"), "Alice-Liddell");
    assert_eq!(repo_name("cloudhead", "alice"), "cloudhead");
    assert_eq!(repo_name("日本", "alice"), "日本");
    assert_eq!(repo_name("!!!", "alice"), "alice");
    assert_eq!(repo_name("!!!", "j@t"), "j-t");
    assert_eq!(repo_name("", ""), "actor");
    assert_eq!(repo_name("John  Doe", "alice"), "John-Doe");
    // A clone of `.` or `..` would land in the current or the parent directory.
    assert_eq!(repo_name("..", "alice"), "alice");
    assert_eq!(repo_name(".", "."), "actor");
    let long = repo_name(&"日".repeat(255), "alice");
    assert!(long.len() <= 255 && long.starts_with("日"));
    assert!(ProjectName::try_from(long).is_ok(), "fits a project name");
}

fn code_bytes(code: &str) -> Vec<u8> {
    multibase::decode(code.strip_prefix("rad-enroll:").unwrap())
        .unwrap()
        .1
}

fn code_of(bytes: &[u8]) -> String {
    format!(
        "rad-enroll:{}",
        multibase::encode(multibase::Base::Base58Btc, bytes)
    )
}

#[test]
fn an_enrollment_code_carries_the_consent_whole() {
    let joining = key(9);
    let enrollment = Enrollment::sign(rid(), oid(3), &joining);
    let code = enrollment.encode();
    // A paste that wrapped the code still reads.
    let wrapped = format!("{}\n  {}", &code[..40], &code[40..]);
    assert_eq!(Enrollment::decode(&wrapped).unwrap(), enrollment);

    assert_eq!(code_bytes(&code).len(), 137);
    let decoded = Enrollment::decode(&code).unwrap();
    assert_eq!(decoded, enrollment);
    assert_eq!(decoded.did, did_of(&joining));
    assert!(decoded.verifies());
}

#[test]
fn an_enrollment_code_that_is_not_one_is_refused() {
    let code = Enrollment::sign(rid(), oid(3), &key(9)).encode();
    let bytes = code_bytes(&code);

    // The version byte decides first, whatever follows it.
    let mut newer = bytes.clone();
    newer[0] = 0x02;
    newer.truncate(40);
    assert_eq!(
        Enrollment::decode(&code_of(&newer)),
        Err(EnrollmentError::Version(2))
    );
    assert_eq!(
        Enrollment::decode(&code_of(&bytes[..100])),
        Err(EnrollmentError::Length)
    );
    assert_eq!(
        Enrollment::decode(code.strip_prefix("rad-enroll:").unwrap()),
        Err(EnrollmentError::Prefix)
    );

    // A code for another anchor carries a signature that is not the
    // key's consent to it.
    let mut moved = bytes;
    moved[1 + 20 + 32] ^= 0xff;
    let moved = Enrollment::decode(&code_of(&moved)).unwrap();
    assert!(!moved.verifies());
}

#[test]
fn an_approval_binds_the_key_and_keeps_what_it_does_not_know() {
    let root = with_payload(
        &root(),
        serde_json::json!({
            "version": 1,
            "type": "person",
            "keys": { did().to_string(): "root" },
            "unknownToThisApp": "kept",
        }),
    );
    let joining = key(9);
    let enrollment = Enrollment::sign(rid(), root.commit, &joining);

    for controller in [true, false] {
        let doc = enrolled_doc(&root.doc, &enrollment, controller).unwrap();
        let id = PayloadId::from_str("dev.radicle.actor").unwrap();
        let payload = &**doc.payload().get(&id).unwrap();
        assert_eq!(payload["unknownToThisApp"], "kept");

        let next = IdentityDocRevision {
            commit: oid(2),
            time: 2,
            doc,
        };
        let resolved = resolve(rid(), &[root.clone(), next]).unwrap();
        let key = resolved
            .keys
            .iter()
            .find(|key| key.did == did_of(&joining))
            .unwrap();
        assert!(key.bound);
        assert_eq!(key.controller, controller);
    }
}

#[test]
fn a_removal_needs_the_keys_it_removes_from() {
    let root = with_payload(
        &root(),
        serde_json::json!({ "version": 1, "type": "person" }),
    );
    assert!(matches!(
        removed_doc(&root.doc, &did_of(&key(9))),
        Err(Error::Payload)
    ));

    // An empty map of keys and none at all are the same to a vote.
    let empty = with_payload(
        &root,
        serde_json::json!({ "version": 1, "type": "person", "keys": {} }),
    );
    assert!(changes_only_keys(&root.doc, &empty.doc));
}
