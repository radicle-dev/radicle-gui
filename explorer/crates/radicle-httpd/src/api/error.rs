use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use radicle::git::raw::ErrorExt;

/// Errors relating to the API backend.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The entity was not found.
    #[error("entity not found")]
    NotFound,

    /// A blocking task failed to complete.
    #[error(transparent)]
    Task(#[from] tokio::task::JoinError),

    /// An error occurred with env variables.
    #[error(transparent)]
    Env(#[from] std::env::VarError),

    /// Profile error.
    #[error(transparent)]
    Profile(#[from] radicle::profile::Error),

    /// Crypto error.
    #[error(transparent)]
    Crypto(#[from] radicle::crypto::signature::Error),

    /// Storage error.
    #[error(transparent)]
    Storage(#[from] radicle::storage::Error),

    /// Cob cache error.
    #[error(transparent)]
    CobCache(#[from] radicle::cob::cache::Error),

    /// Cob issue cache error.
    #[error(transparent)]
    CacheIssue(#[from] radicle::cob::issue::cache::Error),

    /// Cob issue error.
    #[error(transparent)]
    CobIssue(#[from] radicle::cob::issue::Error),

    /// Cob patch error.
    #[error(transparent)]
    CobPatch(#[from] radicle::cob::patch::Error),

    /// Cob patch cache error.
    #[error(transparent)]
    CachePatch(#[from] radicle::cob::patch::cache::Error),

    /// Cob store error.
    #[error(transparent)]
    CobStore(#[from] radicle::cob::store::Error),

    /// Repository error.
    #[error(transparent)]
    Repository(#[from] radicle::storage::RepositoryError),

    /// Routing error.
    #[error(transparent)]
    Routing(#[from] radicle::node::routing::Error),

    /// Project doc error.
    #[error(transparent)]
    ProjectDoc(#[from] radicle::identity::doc::PayloadError),

    /// Surf directory error.
    #[error(transparent)]
    SurfDir(#[from] radicle_surf::fs::error::Directory),

    /// Surf error.
    #[error(transparent)]
    Surf(#[from] radicle_surf::Error),

    /// Git2 error.
    #[error(transparent)]
    Git2(#[from] radicle::git::raw::Error),

    /// Storage refs error.
    #[error(transparent)]
    StorageRef(#[from] radicle::storage::refs::Error),

    /// Identity doc error.
    #[error(transparent)]
    IdentityDoc(#[from] radicle::identity::doc::DocError),

    /// Canonical refs error.
    #[error(transparent)]
    CanonicalRefs(#[from] radicle::identity::doc::CanonicalRefsError),

    /// Tracking store error.
    #[error(transparent)]
    TrackingStore(#[from] radicle::node::policy::store::Error),

    /// Node database error.
    #[error(transparent)]
    Database(#[from] radicle::node::db::Error),

    /// Node error.
    #[error(transparent)]
    Node(#[from] radicle::node::Error),
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let message = self.to_string();
        let (status, msg) = match self {
            Error::NotFound => (StatusCode::NOT_FOUND, None),
            Error::CobStore(e @ radicle::cob::store::Error::NotFound(_, _)) => {
                (StatusCode::NOT_FOUND, Some(e.to_string()))
            }
            Error::Crypto(msg) => (StatusCode::BAD_REQUEST, Some(msg.to_string())),
            Error::Surf(radicle_surf::Error::Git(e)) if e.is_not_found() => {
                (StatusCode::NOT_FOUND, Some(e.message().to_owned()))
            }
            Error::Surf(radicle_surf::Error::Directory(
                e @ radicle_surf::fs::error::Directory::PathNotFound(_),
            )) => (StatusCode::NOT_FOUND, Some(e.to_string())),
            Error::Git2(e) if e.is_not_found() => {
                (StatusCode::NOT_FOUND, Some(e.message().to_owned()))
            }
            Error::Git2(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Some(e.message().to_owned()),
            ),
            Error::Storage(err) if err.is_not_found() => {
                (StatusCode::NOT_FOUND, Some(err.to_string()))
            }
            Error::Repository(err) if err.is_not_found() => {
                (StatusCode::NOT_FOUND, Some(err.to_string()))
            }
            Error::StorageRef(err) if err.is_not_found() => {
                (StatusCode::NOT_FOUND, Some(err.to_string()))
            }
            other => {
                tracing::error!("Error: {message}");
                tracing::debug!("Error Debug: {:?}", other);

                if cfg!(debug_assertions) {
                    (StatusCode::INTERNAL_SERVER_ERROR, Some(other.to_string()))
                } else {
                    (StatusCode::INTERNAL_SERVER_ERROR, None)
                }
            }
        };

        let body = Json(json!({
            "error": msg.or_else(|| status.canonical_reason().map(|r| r.to_string())),
            "code": status.as_u16()
        }));

        (status, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_found_maps_to_404() {
        let response = Error::NotFound.into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
