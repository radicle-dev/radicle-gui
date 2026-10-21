use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use radicle::node::routing::Store;

use crate::api::error::Error;
use crate::api::Context;

pub fn router(ctx: Context) -> Router {
    Router::new()
        .route("/stats", get(stats_handler))
        .with_state(ctx)
}

/// Return the stats for the node.
/// `GET /stats`
async fn stats_handler(State(ctx): State<Context>) -> impl IntoResponse {
    let total_seeded = crate::api::blocking(move || {
        let db = ctx.profile.database()?;
        let nid = ctx.profile.public_key;

        Ok::<_, Error>(db.get_inventory(&nid)?.len())
    })
    .await?;

    Ok::<_, Error>(Json(json!({ "repos": { "total": total_seeded } })))
}

#[cfg(test)]
mod routes {
    use axum::http::StatusCode;
    use serde_json::json;

    use crate::test::{self, get};

    #[tokio::test]
    async fn test_stats() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(test::seed(tmp.path()));
        let response = get(&app, "/stats").await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json().await, json!({ "repos": { "total": 2 } }));
    }
}
