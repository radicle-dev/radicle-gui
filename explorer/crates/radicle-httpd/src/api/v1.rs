mod delegates;
mod info;
mod node;
mod repos;
mod stats;

use axum::extract::State;
use axum::response::{IntoResponse, Json};
use axum::routing::get;
use axum::Router;
use serde_json::json;

use crate::api::{released_at, Context, RADICLE_VERSION};

pub fn router(ctx: Context) -> Router {
    let root_router = Router::new()
        .route("/", get(root_handler))
        .with_state(ctx.clone());

    Router::new()
        .merge(root_router)
        .merge(info::router(ctx.clone()))
        .merge(node::router(ctx.clone()))
        .merge(delegates::router(ctx.clone()))
        .merge(repos::router(ctx.clone()))
        .merge(stats::router(ctx))
}

async fn root_handler(State(ctx): State<Context>) -> impl IntoResponse {
    let mut response = json!({
        "message": "Welcome!",
        "service": "radicle-httpd",
        "version": format!("{}-{}", RADICLE_VERSION, env!("GIT_HEAD")),
        // Compat: older explorers check this against a required range. It is
        // frozen and no longer changes. Server: remove 6 months after release,
        // see docs/api-changes.md.
        "apiVersion": "6.3.0",
        "nid": ctx.profile.public_key,
        "path": "/api",
        "links": [
            {
                "href": "/repos",
                "rel": "repos",
                "type": "GET"
            },
            {
                "href": "/repos/:rid",
                "rel": "repo",
                "type": "GET"
            },
            {
                "href": "/info",
                "rel": "info",
                "type": "GET"
            },
            {
                "href": "/node",
                "rel": "node",
                "type": "GET"
            },
            {
                "href": "/nodes/:nid",
                "rel": "node",
                "type": "GET"
            },
            {
                "href": "/delegates/:did/repos",
                "rel": "repos",
                "type": "GET"
            },
            {
                "href": "/stats",
                "rel": "stats",
                "type": "GET"
            }
        ]
    });
    if let Some(released_at) = released_at() {
        response["releasedAt"] = json!(released_at);
    }

    Json(response)
}
