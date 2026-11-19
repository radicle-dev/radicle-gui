//! The identity side of an actor repository: its payload, how a key consents
//! to join, and how the identity history resolves to an actor.

use std::collections::BTreeMap;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use radicle::cob;
use radicle::crypto::Signature;
use radicle::crypto::signature::Verifier as _;
use radicle::git;
use radicle::identity::doc::{Payload, PayloadId};
use radicle::identity::project::ProjectName;
use radicle::identity::{Did, Doc, Project, RepoId, Visibility};
use radicle::storage::ReadRepository;

use super::{Error, retain_fields};

/// The identity payload that marks a repository as an actor repository.
const PAYLOAD_ID: &str = "dev.radicle.actor";
/// The value in the payload's `keys` map that marks the founding key.
const ROOT_KEY: &str = "root";
/// The prefix of the statement a key signs to consent to joining an actor.
const CONSENT_PREFIX: &str = "rad-actor-consent-v1";
const PAYLOAD_VERSION: u32 = 1;
/// The most keys a payload may bind.
const MAX_KEYS: usize = 255;
/// The most actor repositories a payload may say it replaces.
const MAX_SUPERSEDES: usize = 16;
/// The fields of a payload of `PAYLOAD_VERSION`.
const PAYLOAD_FIELDS: &[&str] = &[
    "version",
    "type",
    "keys",
    "migrations",
    "supersededBy",
    "retired",
    "supersedes",
];
/// The fields of a migration in such a payload.
const MIGRATION_FIELDS: &[&str] = &["from", "signature"];
/// The longest project name, in bytes.
const MAX_REPO_NAME: usize = 255;

fn payload_id() -> PayloadId {
    PayloadId::from_str(PAYLOAD_ID).expect("PAYLOAD_ID is a valid payload id")
}

/// What the actor repository describes; any other value makes the payload
/// invalid.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "actor/")]
pub enum ActorKind {
    #[default]
    Person,
    Agent,
    Org,
}

impl ActorKind {
    pub fn is_individual(self) -> bool {
        matches!(self, Self::Person | Self::Agent)
    }
}

/// A key's signed claim that it moved here from another actor.
/// Desktop copies it into every new revision as it is and never checks or acts on it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Migration {
    from: String,
    signature: String,
}

/// The `dev.radicle.actor` payload, read for the fields of `PAYLOAD_VERSION`.
/// A payload of that version must match its schema in them. What else a
/// payload holds, at any version, is left out, and such a payload is never
/// written back, see `is_newer`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActorPayload {
    pub version: u32,
    #[serde(rename = "type", default)]
    pub kind: ActorKind,
    /// Bound keys: the founding key maps to `root`, every other key to its
    /// consent signature.
    #[serde(default)]
    pub keys: BTreeMap<Did, String>,
    /// By the DID of the key that moved.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    migrations: BTreeMap<String, Migration>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<RepoId>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub retired: bool,
    /// The actor repositories this one replaces; a move counts only if the old
    /// one names this one in `superseded_by`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub supersedes: Vec<RepoId>,
    /// The document held fields `PAYLOAD_VERSION` does not define.
    #[serde(skip)]
    undefined_fields: bool,
    /// The payload is of a newer version and gives its kind, its keys, or
    /// whether it has ended, in a form this version cannot read.
    #[serde(skip)]
    unsure: bool,
}

impl ActorPayload {
    /// The payload an actor is created with.
    fn founding(did: Did) -> Self {
        Self {
            version: PAYLOAD_VERSION,
            kind: ActorKind::Person,
            keys: BTreeMap::from([(did, ROOT_KEY.to_string())]),
            migrations: BTreeMap::new(),
            superseded_by: None,
            retired: false,
            supersedes: Vec::new(),
            undefined_fields: false,
            unsure: false,
        }
    }

    /// Whether `doc` carries the payload at all, valid or not.
    pub fn marks(doc: &Doc) -> bool {
        doc.payload().contains_key(&payload_id())
    }

    /// The valid payload of `doc`, if any, see `ActorPayload`. A payload of a
    /// newer version is always one.
    pub fn of(doc: &Doc) -> Option<Self> {
        let payload = doc.payload().get(&payload_id())?;
        let version = payload.get("version")?.as_u64()?;
        if version > u64::from(PAYLOAD_VERSION) {
            return Some(Self::of_newer(version, payload.as_object()?));
        }

        let mut value = (**payload).clone();
        let object = value.as_object_mut()?;
        if object.get("supersededBy").is_some_and(|rid| rid.is_null()) {
            return None;
        }

        let mut undefined_fields = retain_fields(object, PAYLOAD_FIELDS);
        if let Some(migrations) = object.get_mut("migrations").and_then(|m| m.as_object_mut()) {
            for migration in migrations.values_mut().filter_map(|m| m.as_object_mut()) {
                undefined_fields |= retain_fields(migration, MIGRATION_FIELDS);
            }
        }

        let mut payload: Self = serde_json::from_value(value).ok()?;
        payload.undefined_fields = undefined_fields;
        // The limits are those of `PAYLOAD_VERSION`'s schema.
        let valid = payload.version >= 1
            && payload.keys.len() <= MAX_KEYS
            && payload.supersedes.len() <= MAX_SUPERSEDES
            && payload
                .migrations
                .keys()
                .all(|did| did.starts_with("did:key:"));

        valid.then_some(payload)
    }

    /// A payload of a newer `version`, read for what this version knows of
    /// it. It is an actor's whatever it holds, and it is never written back.
    /// A value this version cannot read counts as absent; where that leaves
    /// the actor's kind, its ending or its keys open, the payload is `unsure`.
    fn of_newer(version: u64, object: &serde_json::Map<String, serde_json::Value>) -> Self {
        let kind = object
            .get("type")
            .map(|kind| serde_json::from_value(kind.clone()).ok());
        let retired = object.get("retired").map(|retired| retired.as_bool());
        let superseded_by = object
            .get("supersededBy")
            .filter(|rid| !rid.is_null())
            .map(|rid| rid.as_str().and_then(|rid| rid.parse().ok()));

        // Entry by entry: the keys this version reads keep their binding. One
        // it cannot read still leaves the payload `unsure`, so the actor is
        // shown to none of them as theirs.
        let entries = object.get("keys").and_then(|keys| keys.as_object());
        let keys = entries
            .into_iter()
            .flatten()
            .filter_map(|(did, binding)| Some((did.parse().ok()?, binding.as_str()?.to_string())))
            .collect::<BTreeMap<Did, String>>();
        let keys_read = entries.is_some_and(|entries| entries.len() == keys.len());
        let supersedes = object
            .get("supersedes")
            .and_then(|rids| rids.as_array())
            .into_iter()
            .flatten()
            .filter_map(|rid| rid.as_str()?.parse().ok())
            .collect();

        Self {
            version: u32::try_from(version).unwrap_or(u32::MAX),
            unsure: kind == Some(None)
                || retired == Some(None)
                || superseded_by == Some(None)
                || !keys_read,
            kind: kind.flatten().unwrap_or_default(),
            keys,
            // Nothing here acts on the migrations.
            migrations: BTreeMap::new(),
            superseded_by: superseded_by.flatten(),
            retired: retired.flatten().unwrap_or_default(),
            supersedes,
            undefined_fields: false,
        }
    }

    /// Whether the payload holds more than this version knows: it is of a
    /// newer version, or holds fields `PAYLOAD_VERSION` does not define. Such
    /// a payload must not be written back.
    pub(super) fn is_newer(&self) -> bool {
        self.version > PAYLOAD_VERSION || self.undefined_fields
    }
}

/// One version of a repository's identity document.
#[derive(Clone, Debug)]
pub struct IdentityDocRevision {
    pub commit: git::Oid,
    /// When the revision was committed, in seconds since the epoch.
    pub time: i64,
    pub doc: Doc,
}

impl From<&cob::identity::Revision> for IdentityDocRevision {
    fn from(revision: &cob::identity::Revision) -> Self {
        Self {
            commit: revision.id,
            time: revision.timestamp.as_secs() as i64,
            doc: revision.doc.clone(),
        }
    }
}

/// What the identity history of an actor repository establishes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedActor {
    pub kind: ActorKind,
    /// Every key of the actor: the founding key first, then the other bound
    /// keys, then the controllers that are not bound.
    pub keys: Vec<ResolvedKey>,
    /// The payload is newer than `PAYLOAD_VERSION`, so it must not be written
    /// back.
    pub payload_newer: bool,
    /// The payload gives the actor's kind, its keys, or whether it has ended,
    /// in a form this version cannot read, so it is not known to be live.
    pub unsure: bool,
    /// The actor has ended with no successor.
    pub retired: bool,
    /// The actor repository that replaces this one, as this actor claims it.
    pub superseded_by: Option<RepoId>,
}

impl ResolvedActor {
    /// The keys that act as the actor: their activity shows as the actor's.
    pub fn bound_keys(&self) -> impl Iterator<Item = Did> + '_ {
        self.keys.iter().filter(|k| k.bound).map(|k| k.did)
    }

    /// Whether the actor is known to be a person or an agent, neither
    /// retired nor superseded; only such an actor can be joined or acted as.
    pub fn is_live_individual(&self) -> bool {
        self.kind.is_individual() && !self.retired && self.superseded_by.is_none() && !self.unsure
    }
}

/// A key of the actor and its roles. A key can be bound, a controller, or both.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedKey {
    pub did: Did,
    /// Listed under `keys` with a valid consent, or the founding key.
    pub bound: bool,
    /// A delegate of the identity document.
    pub controller: bool,
    /// When the revision that gave the key its current role was committed.
    pub added_at: i64,
}

/// The message a key signs to consent to joining the actor at `rid`. `parent`
/// ties it to one identity revision, so it cannot be reused.
fn consent_message(rid: RepoId, did: Did, parent: git::Oid) -> String {
    format!("{CONSENT_PREFIX} {rid} {did} {parent}")
}

/// The actor that `rid`'s identity history describes, or `None` if it is not
/// an actor's.
pub fn resolve(rid: RepoId, history: &[IdentityDocRevision]) -> Option<ResolvedActor> {
    let root = history.first()?;
    let current = history.last()?;
    ActorPayload::of(&root.doc)?;
    let mut delegates = root.doc.delegates().iter();
    let founding_key = match (delegates.next(), delegates.next()) {
        (Some(founding_key), None) => *founding_key,
        _ => return None,
    };
    let current_payload = ActorPayload::of(&current.doc)?;
    // Each revision's raw `keys`, indexed like `history`, read even where the
    // payload is not. A consent from before a key's removal does not count
    // once the key comes back.
    let keys_by_revision = history
        .iter()
        .map(|revision| raw_keys(revision.doc.payload()))
        .collect::<Vec<_>>();

    let mut keys = Vec::new();
    for (did, binding) in &current_payload.keys {
        // The revision that introduced the entry: the latest one where it is
        // present and differs from its parent's.
        let mut introduced = history.len() - 1;
        while introduced > 0
            && keys_by_revision[introduced - 1]
                .and_then(|keys| keys.get(&did.to_string()))
                .and_then(serde_json::Value::as_str)
                .is_some_and(|previous| previous == binding)
        {
            introduced -= 1;
        }
        let bound = if introduced == 0 {
            binding == ROOT_KEY && *did == founding_key
        } else {
            let parent = history[introduced - 1].commit;
            consent_signature(binding)
                .is_some_and(|signature| consents(rid, *did, parent, &signature))
        };
        if bound {
            keys.push(ResolvedKey {
                did: *did,
                bound: true,
                controller: current.doc.is_delegate(did),
                added_at: history[introduced].time,
            });
        }
    }
    keys.sort_by_key(|key| (key.did != founding_key, key.did));
    for did in current.doc.delegates().iter() {
        if keys.iter().any(|key| key.did == *did) {
            continue;
        }
        // The revision that last made the key a delegate; if it was removed
        // and added back, the one that added it back.
        let mut introduced = history.len() - 1;
        while introduced > 0 && history[introduced - 1].doc.is_delegate(did) {
            introduced -= 1;
        }
        keys.push(ResolvedKey {
            did: *did,
            bound: false,
            controller: true,
            added_at: history[introduced].time,
        });
    }

    Some(ResolvedActor {
        kind: current_payload.kind,
        keys,
        payload_newer: current_payload.is_newer(),
        unsure: current_payload.unsure,
        retired: current_payload.retired,
        superseded_by: current_payload.superseded_by,
    })
}

/// Every accepted version of `repo`'s identity document, oldest first, each
/// built on the one before it.
pub fn identity_history<R: ReadRepository + cob::Store>(
    repo: &R,
) -> Result<Vec<IdentityDocRevision>, Error> {
    let identity = cob::identity::Identity::load(repo)?;
    let mut history = Vec::new();
    let mut next = Some(identity.current);
    while let Some(id) = next {
        let revision = identity.revision(&id).ok_or(Error::Missing(id))?;
        history.push(IdentityDocRevision::from(revision));
        next = revision.parent;
    }
    history.reverse();
    Ok(history)
}

/// A proposed change to the actor's identity that controllers are still
/// voting on.
#[derive(Clone, Debug)]
pub struct OpenIdentityRevision {
    pub id: git::Oid,
    pub author: Did,
    /// When it was proposed, in seconds since the epoch.
    pub time: i64,
    /// The identity document it proposes.
    pub doc: Doc,
    /// The controllers that accepted it, the author included.
    pub accepted: Vec<Did>,
    /// The controllers that rejected it.
    pub rejected: Vec<Did>,
    /// The actor if the change is accepted; `None` if it would no longer be
    /// one.
    pub resolved: Option<ResolvedActor>,
}

/// The changes to `repo`'s identity still open for votes, given its `history`.
pub fn open_revisions<R: ReadRepository + cob::Store>(
    repo: &R,
    rid: RepoId,
    history: &[IdentityDocRevision],
) -> Result<Vec<OpenIdentityRevision>, Error> {
    let identity = cob::identity::Identity::load(repo)?;
    let open = identity
        .revisions()
        .filter(|revision| revision.is_active() && revision.parent == Some(identity.current))
        .map(|revision| {
            let mut proposed = history.to_vec();
            proposed.push(IdentityDocRevision::from(revision));
            OpenIdentityRevision {
                id: revision.id,
                author: *revision.author.id(),
                time: revision.timestamp.as_secs() as i64,
                doc: revision.doc.clone(),
                accepted: revision.accepted().collect(),
                rejected: revision.rejected().collect(),
                resolved: resolve(rid, &proposed),
            }
        })
        .collect();
    Ok(open)
}

/// Where a change to the actor's identity stands.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "actor/")]
pub enum RevisionState {
    /// The controllers are still voting on it.
    Open,
    /// A majority of the controllers accepted it, and it applied.
    Accepted,
    /// A majority of the controllers rejected it.
    Rejected,
    /// It can no longer apply: another change was accepted first, or the
    /// change it was built on was rejected.
    Lapsed,
}

/// A change to the actor's identity that `open_revisions` does not give, or
/// the identity's first version.
#[derive(Clone, Debug)]
pub struct ClosedIdentityRevision {
    pub id: git::Oid,
    pub author: Did,
    /// When it was proposed, in seconds since the epoch.
    pub time: i64,
    /// The identity document it proposed.
    pub doc: Doc,
    pub accepted: Vec<Did>,
    pub rejected: Vec<Did>,
    pub state: RevisionState,
    /// The document it was proposed on, with the actor that one gave if it
    /// gave one; `None` for the first version.
    pub before: Option<(Doc, Option<ResolvedActor>)>,
    /// The actor with the change applied; `None` if it would not be one.
    pub after: Option<ResolvedActor>,
}

/// Every change to `repo`'s identity but those `open_revisions` gives, newest
/// first, the first version last: the ones that ended, and one still open
/// that waits on another open change. A change its author withdrew is not
/// among them: the identity keeps none it can list. Resolves the actor once
/// for each change and once for the version it was proposed on.
pub fn closed_revisions<R: ReadRepository + cob::Store>(
    repo: &R,
    rid: RepoId,
) -> Result<Vec<ClosedIdentityRevision>, Error> {
    use cob::identity::{RejectedBy, State};

    let identity = cob::identity::Identity::load(repo)?;

    // The versions a change builds on, root first, whether or not they were
    // accepted.
    let line = |from: Option<git::Oid>| {
        let mut line = Vec::new();
        let mut next = from;

        while let Some(id) = next {
            let revision = identity.revision(&id).ok_or(Error::Missing(id))?;
            line.push(IdentityDocRevision::from(revision));
            next = revision.parent;
        }
        line.reverse();

        Ok::<_, Error>(line)
    };

    let mut closed = Vec::new();

    for revision in identity.revisions() {
        let state = match revision.state {
            State::Active if revision.parent == Some(identity.current) => continue,
            State::Active => RevisionState::Open,
            State::Accepted => RevisionState::Accepted,
            State::Rejected(RejectedBy::Vote) => RevisionState::Rejected,
            State::Rejected(RejectedBy::Sibling(_) | RejectedBy::Parent) => RevisionState::Lapsed,
            State::Redacted(_) => continue,
        };

        let mut proposed = line(revision.parent)?;
        let before = proposed
            .last()
            .map(|parent| (parent.doc.clone(), resolve(rid, &proposed)));
        proposed.push(IdentityDocRevision::from(revision));

        closed.push(ClosedIdentityRevision {
            id: revision.id,
            author: *revision.author.id(),
            time: revision.timestamp.as_secs() as i64,
            doc: revision.doc.clone(),
            accepted: revision.accepted().collect(),
            rejected: revision.rejected().collect(),
            state,
            before,
            after: resolve(rid, &proposed),
        });
    }
    closed.reverse();

    Ok(closed)
}

const ENROLLMENT_PREFIX: &str = "rad-enroll:";
/// The code's version, which is the consent statement's.
const ENROLLMENT_VERSION: u8 = 0x01;
const ENROLLMENT_LEN: usize = 1 + 20 + 32 + 20 + 64;

/// A key's consent to joining an actor, as the joining key hands it to a
/// controller.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Enrollment {
    pub rid: RepoId,
    pub did: Did,
    /// The identity revision the consent is anchored to.
    pub parent: git::Oid,
    pub signature: Signature,
}

impl Enrollment {
    /// The consent of `signer`'s key to joining `rid` on top of `parent`.
    pub fn sign(rid: RepoId, parent: git::Oid, signer: &impl radicle::crypto::Signer) -> Self {
        let did = Did::from(*signer.public_key());
        let signature = signer.sign(consent_message(rid, did, parent).as_bytes());
        Self {
            rid,
            did,
            parent,
            signature,
        }
    }

    /// The value of the key's entry under the payload's `keys`.
    pub fn consent(&self) -> String {
        multibase::encode(multibase::Base::Base58Btc, self.signature.to_bytes())
    }

    /// Whether the signature is the key's consent.
    pub fn verifies(&self) -> bool {
        consents(self.rid, self.did, self.parent, &self.signature)
    }

    /// The code the joining key shows: `rad-enroll:` and the enrollment in
    /// base58.
    pub fn encode(&self) -> String {
        let mut bytes = Vec::with_capacity(ENROLLMENT_LEN);
        bytes.push(ENROLLMENT_VERSION);
        bytes.extend_from_slice(&sha1(&self.rid));
        bytes.extend_from_slice(self.did.as_ref());
        bytes.extend_from_slice(&sha1(&self.parent));
        bytes.extend_from_slice(&self.signature.to_bytes());
        format!(
            "{ENROLLMENT_PREFIX}{}",
            multibase::encode(multibase::Base::Base58Btc, bytes)
        )
    }

    /// The enrollment in a code from `encode`, ignoring whitespace. It does not
    /// check the signature; see `verifies`.
    pub fn decode(code: &str) -> Result<Self, EnrollmentError> {
        let code = code.split_whitespace().collect::<String>();
        let encoded = code
            .strip_prefix(ENROLLMENT_PREFIX)
            .ok_or(EnrollmentError::Prefix)?;
        let (base, bytes) = multibase::decode(encoded).map_err(|_| EnrollmentError::Encoding)?;
        if base != multibase::Base::Base58Btc {
            return Err(EnrollmentError::Encoding);
        }
        let Some((&version, rest)) = bytes.split_first() else {
            return Err(EnrollmentError::Length);
        };
        if version != ENROLLMENT_VERSION {
            return Err(EnrollmentError::Version(version));
        }
        if bytes.len() != ENROLLMENT_LEN {
            return Err(EnrollmentError::Length);
        }
        let (rid, rest) = rest.split_at(20);
        let (key, rest) = rest.split_at(32);
        let (parent, signature) = rest.split_at(20);
        let oid =
            |bytes: &[u8]| git::Oid::from_sha1(bytes.try_into().expect("the slice is 20 bytes"));
        let key: [u8; 32] = key.try_into().expect("the slice is 32 bytes");
        Ok(Self {
            rid: RepoId::from(oid(rid)),
            did: Did::from(radicle::crypto::PublicKey::from(key)),
            parent: oid(parent),
            signature: Signature::from_slice(signature).map_err(|_| EnrollmentError::Encoding)?,
        })
    }
}

fn sha1(oid: &git::Oid) -> [u8; 20] {
    oid.into_sha1()
        .expect("version 1 codes carry SHA-1 object ids")
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum EnrollmentError {
    #[error("an enrollment code starts with {ENROLLMENT_PREFIX}")]
    Prefix,
    #[error("the enrollment code is not valid base58")]
    Encoding,
    #[error("the enrollment code has the wrong length")]
    Length,
    #[error("the enrollment code has version {0}, which this version does not know")]
    Version(u8),
}

/// The actor payload's `keys` as raw JSON, so an edit changes those entries
/// and leaves the rest of the payload as it is.
fn raw_keys(
    payloads: &BTreeMap<PayloadId, Payload>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    payloads
        .get(&payload_id())
        .and_then(|payload| payload.as_object())
        .and_then(|payload| payload.get("keys"))
        .and_then(|keys| keys.as_object())
}

/// `raw_keys`, for editing.
fn raw_keys_mut(
    payloads: &mut BTreeMap<PayloadId, Payload>,
) -> Option<&mut serde_json::Map<String, serde_json::Value>> {
    payloads
        .get_mut(&payload_id())
        .and_then(|payload| payload.as_object_mut())
        .and_then(|payload| payload.get_mut("keys"))
        .and_then(|keys| keys.as_object_mut())
}

/// `doc` with the enrolling key added to the payload's `keys`, and to the
/// delegates if `controller` is set. A delegate stays one. `Full` if the
/// payload has the most keys it can.
pub fn enrolled_doc(doc: &Doc, enrollment: &Enrollment, controller: bool) -> Result<Doc, Error> {
    let mut raw = doc.clone().edit();
    let keys = raw_keys_mut(&mut raw.payload).ok_or(Error::Payload)?;
    keys.insert(
        enrollment.did.to_string(),
        serde_json::Value::String(enrollment.consent()),
    );
    if keys.len() > MAX_KEYS {
        return Err(Error::Full);
    }
    if controller && !raw.delegates.contains(&enrollment.did) {
        raw.delegates.push(enrollment.did);
    }
    Ok(Doc::try_from(raw)?)
}

/// `doc` without `did` in the payload's `keys` or the delegates, with the
/// threshold lowered to fit the delegates left.
pub fn removed_doc(doc: &Doc, did: &Did) -> Result<Doc, Error> {
    let mut raw = doc.clone().edit();
    raw_keys_mut(&mut raw.payload)
        .ok_or(Error::Payload)?
        .remove(&did.to_string());
    raw.delegates.retain(|delegate| delegate != did);
    raw.threshold = raw.threshold.min(raw.delegates.len());
    Ok(Doc::try_from(raw)?)
}

/// `doc` with `retired` set in the actor payload and nothing else changed.
pub fn retired_doc(doc: &Doc) -> Result<Doc, Error> {
    let mut raw = doc.clone().edit();
    raw.payload
        .get_mut(&payload_id())
        .and_then(|payload| payload.as_object_mut())
        .ok_or(Error::Payload)?
        .insert("retired".into(), true.into());

    Ok(Doc::try_from(raw)?)
}

/// Whether `proposed` changes only the actor's keys and the delegates, which
/// is all Desktop shows of a change. The threshold may only drop to fit the
/// delegates left.
pub fn changes_only_keys(doc: &Doc, proposed: &Doc) -> bool {
    let fitted = doc.threshold().min(proposed.delegates().len());
    let without_keys = |doc: &Doc| {
        let mut raw = doc.clone().edit();
        // The field goes whole, so an empty map and a missing one read alike.
        if let Some(payload) = raw
            .payload
            .get_mut(&payload_id())
            .and_then(|payload| payload.as_object_mut())
        {
            payload.remove("keys");
        }
        raw.delegates.clear();
        raw.threshold = 0;
        raw
    };
    proposed.threshold() == fitted && without_keys(doc) == without_keys(proposed)
}

/// The keys whose entry under the payload's `keys` differs between `doc` and
/// `proposed`.
pub fn changed_key_entries(doc: &Doc, proposed: &Doc) -> Vec<String> {
    let entries = |doc: &Doc| raw_keys(doc.payload()).cloned().unwrap_or_default();
    let (before, after) = (entries(doc), entries(proposed));
    let mut changed = before
        .keys()
        .chain(after.keys())
        .filter(|key| before.get(*key) != after.get(*key))
        .cloned()
        .collect::<Vec<_>>();
    changed.sort();
    changed.dedup();
    changed
}

/// The signature in a `keys` entry, which must be multibase base58btc.
fn consent_signature(value: &str) -> Option<Signature> {
    let (multibase::Base::Base58Btc, bytes) = multibase::decode(value).ok()? else {
        return None;
    };
    Signature::from_slice(&bytes).ok()
}

/// Whether `signature` is `did`'s consent to joining `rid` on top of `parent`.
fn consents(rid: RepoId, did: Did, parent: git::Oid, signature: &Signature) -> bool {
    let Ok(key) = radicle::crypto::VerifyingKey::try_from(&*did) else {
        return false;
    };
    key.verify(consent_message(rid, did, parent).as_bytes(), signature)
        .is_ok()
}

/// The repository name for a display name: the characters a project name
/// allows, any other run as one dash, at most 255 bytes. Falls back to
/// `fallback`, then to "actor". Dots alone count as empty, since a clone would
/// land in `.` or `..`.
pub fn repo_name(display_name: &str, fallback: &str) -> String {
    fn clean(value: &str) -> String {
        let name = value
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || ProjectName::ALLOWED_CHARS.contains(&c) {
                    c
                } else {
                    '-'
                }
            })
            .fold(String::new(), |mut name, c| {
                if !(c == '-' && name.ends_with('-')) {
                    name.push(c);
                }
                name
            });
        let mut name = name.trim_matches('-').to_string();
        while name.len() > MAX_REPO_NAME {
            name.pop();
        }
        let name = name.trim_end_matches('-');
        if name.chars().all(|c| c == '.') {
            return String::new();
        }
        name.to_string()
    }

    [clean(display_name), clean(fallback)]
        .into_iter()
        .find(|name| !name.is_empty())
        .unwrap_or_else(|| "actor".to_string())
}

/// The identity document of a new actor: a project payload, which a default
/// branch needs, and an actor payload with `did` as the only key.
pub fn initial_doc(name: &str, default_branch: &str, did: Did) -> Result<Doc, Error> {
    let name = ProjectName::try_from(name.to_string())?;
    let branch = git::fmt::RefString::try_from(default_branch)?;
    let project = Project::new(name, "Actor repository".to_string(), branch).map_err(|errs| {
        errs.into_iter()
            .next()
            .expect("a failed Project::new returns at least one error")
    })?;
    let payload = serde_json::to_value(ActorPayload::founding(did))?;
    let doc = Doc::initial(project, did, Visibility::Public).with_edits(|raw| {
        raw.payload.insert(payload_id(), Payload::from(payload));
    })?;

    Ok(doc)
}

#[cfg(test)]
mod tests;
