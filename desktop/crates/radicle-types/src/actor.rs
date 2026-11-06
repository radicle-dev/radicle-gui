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
    ActorKind, ActorPayload, Enrollment, EnrollmentError, IdentityDocRevision, ResolvedActor,
    ResolvedKey, changed_key_entries, changes_only_keys, enrolled_doc, identity_history,
    initial_doc, open_revisions, removed_doc, repo_name, resolve,
};
pub use profile::{
    ActorProfile, PROFILE_PATH, ProfileFile, ProfileLink, profile_tree, read_profile,
};

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
    #[error("This key is bound to more than one profile: {}.", .0.iter().map(ToString::to_string).collect::<Vec<_>>().join(", "))]
    Ambiguous(Vec<RepoId>),

    /// The profile is from a newer client; rewriting it would drop fields.
    #[error("A newer version of Desktop has written this profile since the page loaded.")]
    ProfileNewer,

    /// The enrollment code cannot be read, or its signature is not the
    /// joining key's consent.
    #[error("That is not a valid enrollment code.")]
    InvalidCode,

    /// The enrollment code is for another actor.
    #[error("That code is for another profile, {0}.")]
    WrongActor(RepoId),

    /// The identity changed after the joining key consented.
    #[error("Your keys changed after that code was made. Make a new one on the other machine.")]
    Stale,

    /// The key is already bound to the actor.
    #[error("That key is already yours.")]
    AlreadyBound,

    /// The payload lists as many keys as it can hold.
    #[error("You have the most keys a profile can list.")]
    Full,

    /// Only a controller can change the identity.
    #[error("This machine's key cannot change which keys are yours. Use a key that can.")]
    NotController,

    /// The actor payload is from a newer client; changing it would drop fields.
    #[error("A newer version of Desktop wrote your keys, so this one cannot change them.")]
    PayloadNewer,

    /// The repository is not in storage.
    #[error("The profile's repository {0} is not on this machine.")]
    NotFetched(RepoId),

    /// The user blocked the repository, so nothing here seeds it.
    #[error("You blocked the repository {0}. Unblock it first, then join.")]
    Blocked(RepoId),

    /// The repository is not an individual actor that a key can join.
    #[error("The repository {0} is not a profile a key can join.")]
    NotJoinable(RepoId),

    /// Only the key that proposed an identity change can withdraw it.
    #[error("Only the key that proposed this change can withdraw it.")]
    NotAuthor,

    /// No open identity change has this id.
    #[error("The change {0} is no longer open.")]
    RevisionNotFound(git::Oid),

    /// A key cannot remove itself from the actor.
    #[error("This machine cannot revoke its own key. Revoke it from another controller.")]
    RemoveSelf,

    /// The actor has no such key.
    #[error("The key {0} is no longer part of your profile.")]
    KeyNotFound(Did),

    /// This key already voted on the identity change.
    #[error("This key already voted on that change.")]
    AlreadyVoted,

    /// This key already accepted another change at the same identity version.
    #[error("This key already approved another change; that one has to be settled first.")]
    VotedElsewhere,

    /// The change does more than Desktop can show, so the user cannot vote on it.
    #[error("This change does more than Desktop can show, so it cannot be signed here.")]
    RevisionUnreadable,

    /// The edit is on this key's branch, but the controllers' branches have
    /// split.
    #[error(
        "Saved on this machine only. The profile did not update because its controllers' copies have diverged."
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
            Self::NotFetched(_) => "ActorError.NotFetched",
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

/// The local actor as Desktop shows it.
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
}

/// An identity change open for votes; it applies once a majority of the
/// controllers accept it.
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
