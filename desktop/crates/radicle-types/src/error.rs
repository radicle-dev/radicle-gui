use axum::body::Body;
use axum::http::{Response, StatusCode};
use axum::response::IntoResponse;
use serde::Serialize;

use crate::cobs::stream;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Profile error.
    #[error(transparent)]
    ProfileError(#[from] radicle::profile::Error),

    /// Profile signer error.
    #[error(transparent)]
    Signer(#[from] radicle::profile::SignerError),

    /// Radicle error.
    #[error("radicle is not installed")]
    RadicleNotInstalled,

    /// Missing SSH Agent error.
    #[error("ssh agent not running")]
    AgentNotRunning,

    /// File size too big
    #[error("file size too large: {0}")]
    FileTooLarge(usize),

    /// Generic Cob cache error.
    #[error(transparent)]
    Cache(#[from] radicle::cob::cache::Error),

    /// Embeds error.
    #[error("not able to save embed")]
    SaveEmbedError,

    /// A second review of the same revision by the same author.
    #[error("you have already reviewed this revision")]
    ReviewExists,

    /// Unseeding had no effect because the node seeds everything by default.
    #[error(
        "this node's default seeding policy is 'allow', so it keeps seeding this repository; \
         change `node.seedingPolicy` in your Radicle config to stop"
    )]
    DefaultPolicySeeds,

    /// Init Error error.
    #[error(transparent)]
    InitError(#[from] radicle::rad::InitError),

    /// Alias error.
    #[error(transparent)]
    AliasError(#[from] radicle::node::AliasError),

    /// Tauri Plugin Fs error.
    #[error(transparent)]
    TauriPluginFs(#[from] tauri_plugin_fs::Error),

    /// Tauri error.
    #[error(transparent)]
    Tauri(#[from] tauri::Error),

    /// Project error.
    #[error(transparent)]
    ProjectError(#[from] radicle::identity::project::ProjectError),

    /// List notification error.
    #[error(transparent)]
    ListNotificationsError(
        #[from] crate::domain::inbox::models::notification::ListNotificationsError,
    ),

    /// CobStore error.
    #[error(transparent)]
    ListPatchesError(#[from] crate::domain::patch::models::patch::ListPatchesError),

    #[error(transparent)]
    PatchCountsError(#[from] crate::domain::patch::models::patch::CountsError),

    #[error(transparent)]
    ListIssuesError(#[from] crate::domain::issue::models::issue::ListIssuesError),

    /// CobStore error.
    #[error(transparent)]
    CobStore(#[from] radicle::cob::store::Error),

    /// Io error.
    #[error(transparent)]
    Io(#[from] std::io::Error),

    /// Sqlite error.
    #[error(transparent)]
    Sqlite(#[from] sqlite::Error),

    /// Io error.
    #[error(transparent)]
    Actions(#[from] stream::error::Actions),

    /// CobStream error.
    #[error(transparent)]
    CobStream(#[from] stream::error::Stream),

    /// Inbox error.
    #[error(transparent)]
    Inbox(#[from] radicle::node::notifications::Error),

    /// Crypto error.
    #[error(transparent)]
    Crypto(#[from] radicle::crypto::ssh::keystore::Error),

    /// SSH Agent error.
    #[error(transparent)]
    Agent(#[from] radicle::crypto::ssh::agent::AgentError),

    /// SSH Agent connection error.
    #[error(transparent)]
    AgentConnect(#[from] radicle::crypto::ssh::agent::ConnectError),

    /// Node database error.
    #[error(transparent)]
    Database(#[from] radicle::node::db::Error),

    /// Repository error.
    #[error(transparent)]
    SurfFsError(#[from] radicle_surf::fs::error::Directory),

    /// Repository error.
    #[error(transparent)]
    Repository(#[from] radicle::storage::RepositoryError),

    /// Policy store error.
    #[error(transparent)]
    PolicyStore(#[from] radicle::node::policy::store::Error),

    /// Cob patch cache error.
    #[error(transparent)]
    CachePatch(#[from] radicle::cob::patch::cache::Error),

    /// Diff error.
    #[error(transparent)]
    Diff(#[from] radicle_surf::diff::git::error::Diff),

    /// Storage error.
    #[error(transparent)]
    Storage(#[from] radicle::storage::Error),

    /// Storage refs error.
    #[error(transparent)]
    StorageRefs(#[from] radicle::storage::refs::Error),

    /// Revision not found.
    #[error("revision not found: {0}")]
    RevisionNotFound(String),

    /// Commit not found in the repository.
    #[error("commit not found: {0}")]
    CommitNotFound(radicle::git::Oid),

    /// A location URL that peers could not fetch an artifact from.
    #[error("invalid location: {0}")]
    InvalidLocation(String),

    /// Surf error.
    #[error(transparent)]
    Surf(#[from] radicle_surf::Error),

    /// Git2 error.
    #[error(transparent)]
    Git2(#[from] radicle::git::raw::Error),

    /// Cob issue cache error.
    #[error(transparent)]
    CacheIssue(#[from] radicle::cob::issue::cache::Error),

    /// Patch error.
    #[error(transparent)]
    Patch(#[from] radicle::patch::Error),

    /// Issue error.
    #[error(transparent)]
    Issue(#[from] radicle::issue::Error),

    /// Invalid title.
    #[error(transparent)]
    Title(#[from] radicle::cob::TitleError),

    /// Node error.
    #[error(transparent)]
    Node(#[from] radicle::node::Error),

    /// Cob remove error.
    #[error(transparent)]
    CobRemove(#[from] radicle::cob::error::Remove),

    /// Serde JSON error.
    #[error(transparent)]
    SerdeJSON(#[from] serde_json::error::Error),

    /// Release creation error.
    #[error(transparent)]
    ReleaseCreate(#[from] radicle_artifact::error::Create),

    /// Artifact metadata error.
    #[error(transparent)]
    ArtifactMetadata(#[from] radicle_artifact::error::Metadata),

    /// Artifact redaction error.
    #[error(transparent)]
    ArtifactRedact(#[from] radicle_artifact::error::Redact),

    /// Artifact content id, key or I/O error.
    #[error(transparent)]
    ArtifactCore(#[from] radicle_artifact_core::Error),

    /// Object id parse error.
    #[error(transparent)]
    ParseObjectId(#[from] radicle::cob::object::ParseObjectId),

    /// A config change that would leave `config.json` unreadable.
    #[error("invalid config: {0}")]
    InvalidConfig(String),

    /// URL parse error.
    #[error(transparent)]
    UrlParse(#[from] url::ParseError),

    /// Artifact node client error.
    #[error(transparent)]
    ArtifactClient(#[from] radicle_artifact_client::ClientError),
}

impl Error {
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Error::ProjectError(radicle::identity::project::ProjectError::Name(_)) => {
                "ProjectError.InvalidName"
            }
            Error::ProjectError(radicle::identity::project::ProjectError::Description(_)) => {
                "ProjectError.InvalidDescription"
            }
            Error::Crypto(radicle::crypto::ssh::keystore::Error::Ssh(ssh_key::Error::Crypto))
            | Error::Crypto(radicle::crypto::ssh::keystore::Error::PassphraseMissing) => {
                "PassphraseError.InvalidPassphrase"
            }
            Error::AliasError(radicle::node::AliasError::Empty) => "AliasError.EmptyAlias",
            Error::AliasError(radicle::node::AliasError::MaxBytesExceeded) => {
                "AliasError.TooLongAlias"
            }
            Error::ProfileError(radicle::profile::Error::NotFound(_)) => {
                "IdentityError.MissingProfile"
            }
            Error::AliasError(radicle::node::AliasError::InvalidCharacter) => {
                "AliasError.InvalidAlias"
            }
            Error::InvalidConfig(_) => "ConfigError.Invalid",
            Error::FileTooLarge(_) => "PayloadError.TooLarge",
            Error::ReviewExists => "PatchError.ReviewExists",
            Error::CommitNotFound(_) => "RepoError.CommitNotFound",
            Error::InvalidLocation(_) => "ArtifactError.InvalidLocation",
            Error::ArtifactCore(radicle_artifact_core::Error::CidMismatch { .. }) => {
                "ArtifactError.CidMismatch"
            }
            _ => "UnknownError",
        }
    }
}

#[derive(Serialize, ts_rs::TS, Debug)]
#[ts(export)]
#[ts(export_to = "error/")]
pub struct ErrorWrapper {
    code: String,
    #[ts(optional)]
    message: Option<String>,
}

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        use serde::ser::SerializeStruct;

        let mut state = serializer.serialize_struct("ErrorWrapper", 2)?;
        state.serialize_field("code", &self.code().to_string())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> Response<Body> {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::to_string(&self).unwrap(),
        )
            .into_response()
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use crate::error::Error;

    #[test]
    fn serialize_nested_errors() {
        let serialized = serde_json::to_string(&Error::Crypto(
            radicle::crypto::ssh::keystore::Error::Ssh(ssh_key::Error::Crypto),
        ))
        .unwrap();
        assert_eq!(
            serialized,
            "{\"code\":\"PassphraseError.InvalidPassphrase\",\"message\":\"ssh keygen: cryptographic error\"}"
        );
    }

    #[test]
    fn serialize_unknown_errors() {
        let serialized =
            serde_json::to_string(&Error::Issue(radicle::issue::Error::MissingIdentity)).unwrap();
        assert_eq!(
            serialized,
            "{\"code\":\"UnknownError\",\"message\":\"identity document missing\"}"
        );
    }
}
