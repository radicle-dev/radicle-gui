use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use serde::Serialize;

use crate::api::error::Error;
use crate::api::v1::node;
use crate::api::Context;
use crate::axum_extra::cached_response;

pub fn router(ctx: Context) -> Router {
    Router::new()
        .route("/info", get(info_handler))
        .with_state(ctx)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpdInfo {
    /// Whether an external search index is configured for this httpd.
    /// Reflects only configuration — `true` does not guarantee the
    /// backend is currently reachable.
    search_available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Info {
    node: node::Response,
    httpd: HttpdInfo,
}

/// Aggregate state about this httpd plus the node it sits in front of.
/// Allows clients to bootstrap with a single request instead of hitting
/// `/node` plus any future per-feature endpoints.
/// `GET /info`
async fn info_handler(State(ctx): State<Context>) -> impl IntoResponse {
    let node = node::build_response(&ctx).await?;
    let httpd = HttpdInfo {
        search_available: ctx.search().is_some(),
    };
    Ok::<_, Error>(cached_response(Info { node, httpd }, 600))
}

#[cfg(test)]
mod routes {
    use std::net::SocketAddr;

    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use pretty_assertions::assert_eq;
    use serde_json::Value;

    use crate::test::*;

    #[tokio::test]
    async fn test_info_without_search() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/info").await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: Value = response.json().await;
        assert_eq!(body["httpd"]["searchAvailable"], false);
        assert!(body["node"].is_object());
    }
}
