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

use crate::api::{Context, API_VERSION, RADICLE_VERSION};

pub fn router(ctx: Context) -> Router {
    let root_router = Router::new()
        .route("/", get(root_handler))
        .with_state(ctx.clone());

    let routes = Router::new()
        .merge(root_router)
        .merge(info::router(ctx.clone()))
        .merge(node::router(ctx.clone()))
        .merge(delegates::router(ctx.clone()))
        .merge(repos::router(ctx.clone()))
        .merge(stats::router(ctx));

    Router::new().nest("/v1", routes)
}

async fn root_handler(State(ctx): State<Context>) -> impl IntoResponse {
    let response = json!({
        "message": "Welcome!",
        "service": "radicle-httpd",
        "version": format!("{}-{}", RADICLE_VERSION, env!("GIT_HEAD")),
        "apiVersion": API_VERSION,
        "nid": ctx.profile.public_key,
        "path": "/api/v1",
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

    Json(response)
}
