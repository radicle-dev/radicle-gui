//! Actor repositories: what an actor is and what Desktop shows of one.
//! Nothing here signs or talks to a node; `traits::actor` does.

use serde::Serialize;
use ts_rs::TS;

use radicle::git;
use radicle::identity::{Did, RepoId};
use radicle::node::Alias;

mod identity;
mod profile;

// The public interface of the actor rules.
pub use identity::{
    ActorKind, ActorPayload, ClosedIdentityRevision, Enrollment, EnrollmentError,
    IdentityDocRevision, OpenIdentityRevision, ResolvedActor, ResolvedKey, RevisionState,
    changed_key_entries, changes_only_keys, closed_revisions, enrolled_doc, identity_history,
    initial_doc, open_revisions, removed_doc, repo_name, resolve, retired_doc,
};
pub use profile::{
    ActorProfile, PROFILE_PATH, ProfileFile, ProfileImage, ProfileImages, ProfileLink,
    changed_fields, profile_changes, profile_tree, profile_tree_with, read_profile,
};

/// Drops the entries of `object` that `fields` does not name, and says whether
/// there were any.
fn retain_fields(object: &mut serde_json::Map<String, serde_json::Value>, fields: &[&str]) -> bool {
    let before = object.len();
    object.retain(|key, _| fields.contains(&key.as_str()));

    object.len() != before
}

/// Every way an actor operation can fail. Desktop shows the messages to the
/// user as they are.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The profile fails `ActorProfile::validate`; the message names the field.
    #[error("Invalid profile: {0}.")]
    Profile(String),

    /// The local key is already bound to an actor repository.
    #[error("This key already has a profile, {0}.")]
    Exists(RepoId),

    /// The key had an actor of that name, retired or left over.
    #[error("A profile named {0} is already in storage. Pick another display name.")]
    NameTaken(String),

    /// No actor repository binds the local key.
    #[error("The profile is no longer in storage.")]
    NotFound,

    /// More than one actor binds the local key.
    #[error("This key belongs to more than one profile: {}.", .0.iter().map(ToString::to_string).collect::<Vec<_>>().join(", "))]
    Ambiguous(Vec<RepoId>),

    /// The profile is from a newer client; rewriting it would drop fields.
    #[error("A newer version of Desktop has written this profile since the page loaded.")]
    ProfileNewer,

    /// The enrollment code cannot be read, or its signature is not the
    /// joining key's consent.
    #[error("That is not a valid code.")]
    InvalidCode,

    /// The enrollment code is for another actor.
    #[error("That code is for another profile, {0}.")]
    WrongActor(RepoId),

    /// An actor binds the key, and what it is cannot be read.
    #[error(
        "This key belongs to a profile, {0}, written by a newer app that this version of Desktop cannot read. Update Desktop."
    )]
    ActorNewer(RepoId),

    /// The identity changed while a change to it was being prepared.
    #[error("Your keys changed just now. Check them and try again.")]
    Moved,

    /// The identity changed after the joining key consented.
    #[error("Your keys changed after that code was created. Create a new one on the other device.")]
    Stale,

    /// The key is already bound to the actor.
    #[error("That key is already yours.")]
    AlreadyBound,

    /// The payload lists as many keys as it can hold.
    #[error("You have the most keys a profile can list.")]
    Full,

    /// Only a controller can change the identity.
    #[error("This device's key cannot change which keys are yours. Use a key that can.")]
    NotController,

    /// The actor payload holds more than this client knows; a change would
    /// sign what it cannot read.
    #[error(
        "Your keys hold fields this version of Desktop does not know, so it cannot change them."
    )]
    PayloadNewer,

    /// The repository is not in storage.
    #[error("The profile {0} is not on this device.")]
    NotFetched(RepoId),

    /// The copy in storage has no head and none can be computed, so the node
    /// fetches nothing more into it.
    #[error(
        "This device fetched the profile while two of its devices had saved different versions, and it cannot update that copy. Save the profile on a device that controls it, then fetch it again here."
    )]
    CopyStuck(RepoId),

    /// The user blocked the repository, so nothing here seeds it.
    #[error("You blocked {0}. Unblock it first, then add this device.")]
    Blocked(RepoId),

    /// The repository is not an individual actor that a key can join.
    #[error("{0} is not a profile a device can be added to.")]
    NotJoinable(RepoId),

    /// Only the key that proposed an identity change can withdraw it.
    #[error("Only the key that proposed this change can withdraw it.")]
    NotAuthor,

    /// No open identity change has this id.
    #[error("The change {0} is no longer open.")]
    RevisionNotFound(git::Oid),

    /// A key cannot remove itself from the actor.
    #[error("This device cannot revoke its own key. Revoke it from another controller.")]
    RemoveSelf,

    /// The actor has no such key.
    #[error("The key {0} is no longer part of your profile.")]
    KeyNotFound(Did),

    /// No live individual actor of that id binds the local key.
    #[error("This device's key is not in the profile {0}.")]
    NotBound(RepoId),

    /// The local key is the actor's only controller, so its removal would
    /// leave the actor without one.
    #[error("This device's key is the only controller of {0}. That profile can only be retired.")]
    OnlyController(RepoId),

    /// The local key does not control the actor, so it has no vote on its own
    /// removal; the controllers are the keys that have.
    #[error("This device's key cannot approve changes in {rid}. A device that controls that profile has to revoke it: {}.", .controllers.iter().map(ToString::to_string).collect::<Vec<_>>().join(", "))]
    LeaveNeedsController { rid: RepoId, controllers: Vec<Did> },

    /// The local key has voted to leave another actor, and that change is
    /// still open.
    #[error(
        "This device is already leaving {0}. Cancel that leave first, or wait until it is approved or rejected."
    )]
    Leaving(RepoId),

    /// No open change by which the local key leaves the actor holds its vote.
    #[error("This device is not leaving {0}.")]
    NotLeaving(RepoId),

    /// Another key proposed the removal the local key accepted, and only the
    /// proposer withdraws a change.
    #[error(
        "Another device proposed removing this one from {0}, so only that device can withdraw it."
    )]
    LeaveNotOwn(RepoId),

    /// Retiring the actor would leave the local key with none.
    #[error("{0} is the only profile this device is in, so it is not retired from here.")]
    LastActor(RepoId),

    /// Other keys control the actor too, and Desktop has no way for them to
    /// sign a retirement.
    #[error(
        "Other devices control {0} too, so this device cannot retire it alone. Leave it instead."
    )]
    RetireShared(RepoId),

    /// This key already voted on the identity change.
    #[error("This key already voted on that change.")]
    AlreadyVoted,

    /// This key already accepted another change at the same identity version.
    #[error("This key already approved another change; that one has to be settled first.")]
    VotedElsewhere,

    /// The change does more than Desktop can show, so the user cannot vote on it.
    #[error("This change does more than Desktop can show, so it cannot be signed here.")]
    RevisionUnreadable,

    /// The edit is on this key's branch, signed, and announced if the node
    /// runs, but the controllers' branches have split.
    #[error(
        "Saved under this key only. The profile did not update because its controllers' copies have diverged. Open the profile on another device that controls it, once it has synced, and save there."
    )]
    Diverged,

    #[error(transparent)]
    Repository(#[from] radicle::storage::RepositoryError),
    #[error("the identity revision {0} is missing")]
    Missing(git::Oid),
    #[error("the identity document has no actor payload with keys")]
    Payload,
    #[error(transparent)]
    Doc(#[from] radicle::identity::doc::DocError),
    #[error(transparent)]
    Project(#[from] radicle::identity::project::ProjectError),
    #[error(transparent)]
    Branch(#[from] git::fmt::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Git(#[from] git::raw::Error),
}

impl Error {
    /// The code the frontend branches on; every other error shows its message.
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Exists(_) => "ActorError.Exists",
            Self::Ambiguous(_) => "ActorError.Ambiguous",
            Self::NotController => "ActorError.NotController",
            Self::PayloadNewer => "ActorError.PayloadNewer",
            Self::NotFetched(_) => "ActorError.NotFetched",
            Self::CopyStuck(_) => "ActorError.CopyStuck",
            _ => "UnknownError",
        }
    }
}

/// A key of the actor as Desktop shows it.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "actor/")]
pub struct ActorKey {
    #[ts(as = "String")]
    pub did: Did,
    /// The node alias, local to this machine and no part of the profile.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub alias: Option<Alias>,
    pub bound: bool,
    pub controller: bool,
    /// Seconds since the epoch.
    #[ts(type = "number")]
    pub added_at: i64,
}

/// An actor as Desktop shows it: the local one, or one the local key may
/// join.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "actor/")]
pub struct ActorInfo {
    #[ts(as = "String")]
    pub rid: RepoId,
    pub kind: ActorKind,
    /// The founding key first, then the other bound keys, then the
    /// controllers that are not bound.
    pub keys: Vec<ActorKey>,
    /// How many controllers must agree on a profile edit.
    pub threshold: usize,
    /// How many controllers must accept an identity change.
    pub majority: usize,
    /// The payload is from a newer client, so Desktop must not change it.
    pub payload_newer: bool,
    /// Unset when the default branch has no readable profile yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub profile: Option<ActorProfile>,
    /// The profile is from a newer client, so Desktop must not rewrite it.
    pub profile_newer: bool,
    /// The profile file cannot be read; a save replaces it.
    pub profile_unreadable: bool,
    /// The commit the profile was read from.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub head: Option<git::Oid>,
    /// Identity changes open for the controllers' votes.
    pub pending: Vec<ActorRevision>,
    /// The other controllers' versions of the profile that are not behind
    /// the one shown, when this key publishes alone; a save replaces them.
    pub forks: Vec<ActorFork>,
}

/// Another controller's version of the profile, on a branch that is not
/// behind the one this key reads.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "actor/")]
pub struct ActorFork {
    #[ts(as = "String")]
    pub did: Did,
    /// The commit that controller's branch is on.
    #[ts(as = "String")]
    pub head: git::Oid,
    /// Unset when that version holds no profile this Desktop can read.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub profile: Option<ActorProfile>,
    /// The profile as it was where the two versions split. Unset when they
    /// split at no one commit, or that commit holds no profile this Desktop
    /// can read in full.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub base: Option<ActorProfile>,
    /// What that version changed since the two split, as a unified diff of
    /// the profile cleaned as it is for display. Unset when `base` is, or
    /// that version holds no profile this Desktop can read.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub changes: Option<String>,
    /// That version changed files other than the profile since the two
    /// split or, when they split at no one commit, holds other files that
    /// differ from the version shown. A save here leaves those changes out.
    pub other_files: bool,
    /// That version is from a newer client, so Desktop must not replace it.
    pub profile_newer: bool,
}

/// A change to the actor's identity. One open for votes applies once a
/// majority of the controllers accept it. What it adds, removes and lowers is
/// told against the identity it was proposed on.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "actor/")]
pub struct ActorRevision {
    #[ts(as = "String")]
    pub id: git::Oid,
    #[ts(as = "String")]
    pub author: Did,
    /// Seconds since the epoch.
    #[ts(type = "number")]
    pub created_at: i64,
    /// The keys it adds or gives another role, with the roles they get.
    pub added: Vec<ActorKey>,
    #[ts(as = "Vec<String>")]
    pub removed: Vec<Did>,
    /// How many controllers a profile edit needs after the change, if it
    /// lowers that.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub threshold: Option<usize>,
    /// The controllers that accepted it, the author among them.
    #[ts(as = "Vec<String>")]
    pub accepted: Vec<Did>,
    /// The controllers that rejected it. The change stays open until it can no
    /// longer reach a majority.
    #[ts(as = "Vec<String>")]
    pub rejected: Vec<Did>,
    /// It changes more than Desktop can show, so Desktop must not sign it.
    pub unreadable: bool,
    pub state: RevisionState,
}

/// One version of the profile in the history of the one shown.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "actor/")]
pub struct ProfileEdit {
    #[ts(as = "String")]
    pub commit: git::Oid,
    /// The versions it was saved over: none for the first version, several
    /// for a save that joined versions that had split.
    #[ts(as = "Vec<String>")]
    pub parents: Vec<git::Oid>,
    /// Seconds since the epoch, by the clock of the device that saved it.
    #[ts(type = "number")]
    pub saved_at: i64,
    /// The key of the device that saved it, as the commit records it, which
    /// nothing verifies. Unset when the commit names no key.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>")]
    #[ts(optional)]
    pub author: Option<Did>,
    /// The fields of the profile, by their names in the file, that differ
    /// from the first of `parents`, or that the first version sets; `avatar`
    /// and `banner` also when the picture they name changed. Unset when this
    /// version or that parent holds a profile this Desktop cannot read in
    /// full.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fields: Option<Vec<String>>,
    /// It is in the history of the profile `actor` shows. Otherwise it is on
    /// this key's own branch, and waits for the other controllers.
    pub live: bool,
}

/// The key an enrollment code would bind, shown before a controller approves
/// it.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "actor/")]
pub struct EnrollmentPreview {
    #[ts(as = "String")]
    pub did: Did,
    /// The key's node alias, when this machine knows it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub alias: Option<Alias>,
    /// The key already controls the actor, as a recovery key does, and keeps
    /// that role.
    pub controller: bool,
}
