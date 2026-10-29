use axum::http::{header, StatusCode};
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

    /// The configured search backend is unreachable or serving
    /// incompatible documents.
    #[error("search backend unavailable")]
    SearchUnavailable,

    /// A call to the search backend failed. Kept distinct from
    /// [`Error::SearchUnavailable`] (backend not configured) purely so the
    /// underlying cause is preserved for logging; both map to the same
    /// client-facing 503 response.
    #[error("search backend unavailable")]
    SearchFailed(#[from] radicle_search::query::SearchError),
}

impl Error {
    /// Whether this error belongs to the not-found family. Mirrors exactly
    /// the variants [`IntoResponse::into_response`] maps to
    /// [`StatusCode::NOT_FOUND`], so callers that need to special-case
    /// not-found (e.g. skipping a row rather than failing a listing) stay in
    /// sync with the response classification.
    pub(crate) fn is_not_found(&self) -> bool {
        match self {
            Error::NotFound => true,
            Error::CobStore(radicle::cob::store::Error::NotFound(_, _)) => true,
            Error::Surf(radicle_surf::Error::Git(e)) => e.is_not_found(),
            Error::Surf(radicle_surf::Error::Directory(
                radicle_surf::fs::error::Directory::PathNotFound(_),
            )) => true,
            Error::Git2(e) => e.is_not_found(),
            Error::Storage(e) => e.is_not_found(),
            Error::Repository(e) => e.is_not_found(),
            Error::StorageRef(e) => e.is_not_found(),
            _ => false,
        }
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        if self.is_not_found() {
            let msg = match &self {
                Error::CobStore(e) => Some(e.to_string()),
                Error::Surf(radicle_surf::Error::Git(e)) => Some(e.message().to_owned()),
                Error::Surf(radicle_surf::Error::Directory(e)) => Some(e.to_string()),
                Error::Git2(e) => Some(e.message().to_owned()),
                Error::Storage(e) => Some(e.to_string()),
                Error::Repository(e) => Some(e.to_string()),
                Error::StorageRef(e) => Some(e.to_string()),
                _ => None,
            };
            let body = Json(json!({
                "error": msg.or_else(|| StatusCode::NOT_FOUND.canonical_reason().map(|r| r.to_string())),
                "code": StatusCode::NOT_FOUND.as_u16()
            }));
            return (StatusCode::NOT_FOUND, body).into_response();
        }

        let message = self.to_string();
        let service_unavailable = || {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                [(header::RETRY_AFTER, "5")],
                Json(json!({
                    "error": message.clone(),
                    "code": StatusCode::SERVICE_UNAVAILABLE.as_u16()
                })),
            )
                .into_response()
        };
        let (status, msg) = match self {
            Error::SearchUnavailable => return service_unavailable(),
            Error::SearchFailed(e) => {
                tracing::warn!("search backend call failed: {e:#}");
                return service_unavailable();
            }
            Error::Crypto(msg) => (StatusCode::BAD_REQUEST, Some(msg.to_string())),
            Error::Git2(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Some(e.message().to_owned()),
            ),
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

    #[tokio::test]
    async fn search_unavailable_maps_to_503() {
        let response = Error::SearchUnavailable.into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers().get(header::RETRY_AFTER).unwrap(), "5");
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "error": "search backend unavailable",
                "code": 503
            })
        );
    }

    #[test]
    fn search_error_conversion_preserves_source() {
        use std::error::Error as _;

        let err: Error = radicle_search::query::SearchError::Timeout.into();
        assert!(matches!(err, Error::SearchFailed(_)));
        assert!(err.source().is_some());
    }

    #[tokio::test]
    async fn search_failed_maps_to_503() {
        let err: Error = radicle_search::query::SearchError::SchemaMismatch.into();
        let response = err.into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers().get(header::RETRY_AFTER).unwrap(), "5");

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "error": "search backend unavailable",
                "code": 503
            })
        );
    }
}
