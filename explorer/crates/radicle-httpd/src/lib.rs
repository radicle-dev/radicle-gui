#![allow(clippy::type_complexity)]
#![allow(clippy::too_many_arguments)]
#![recursion_limit = "256"]
pub mod error;

use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::process::Command;
use std::str;
use std::sync::Arc;
use std::time::Duration;

#[cfg(unix)]
use tokio::signal::unix::{signal, SignalKind};

use anyhow::Context as _;
use axum::body::Body;
use axum::http::Request;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{middleware, Json, Router};
use axum_listener::{DualAddr, DualListener};
use hyper::body::Body as _;
use hyper::header::CONTENT_TYPE;
use hyper::Method;
use tower_http::cors;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::Span;

use radicle::identity::RepoId;
use radicle::Profile;

use crate::api::RADICLE_VERSION;
use crate::tracing_extra::{log_response, tracing_middleware, RequestId, TracingInfo};

mod api;
mod axum_extra;
mod cache;
mod git;
pub mod logger;
mod raw;
#[cfg(test)]
mod test;
mod tracing_extra;

/// Default cache HTTP size.
pub const DEFAULT_CACHE_SIZE: NonZeroUsize = NonZeroUsize::new(100).unwrap();

/// Resolve a repo path segment to a [`RepoId`]. The segment may be either a
/// canonical RID or one of the aliases configured via `--alias`. Returns
/// `None` when it is neither, letting each caller map that to its own error.
pub(crate) fn resolve_rid(name: &str, aliases: &HashMap<String, RepoId>) -> Option<RepoId> {
    name.parse::<RepoId>()
        .ok()
        .or_else(|| aliases.get(name).copied())
}

#[derive(Debug, Clone)]
pub struct Options {
    pub aliases: HashMap<String, RepoId>,
    pub listen: DualAddr,
    pub cache: Option<NonZeroUsize>,
    /// Search backend configuration. `None` disables search at runtime and
    /// falls back to the built-in storage walk.
    pub search: Option<SearchOptions>,
}

#[derive(Debug, Clone)]
pub struct SearchOptions {
    pub url: String,
    pub api_key: Option<String>,
    pub index_name: String,
    pub query_timeout: std::time::Duration,
}

/// Run the Server.
pub async fn run(options: Options) -> anyhow::Result<()> {
    let git_version = Command::new("git")
        .arg("version")
        .output()
        .context("'git' command must be available")?
        .stdout;

    tracing::info!("{}", str::from_utf8(&git_version)?.trim());

    // Listing a repo's refs resolves every remote's signed refs through libgit2,
    // opening a descriptor per packfile. Radicle storage can hold thousands of
    // packfiles, so under a low default limit reads exhaust file descriptors and
    // objects in unopened packs fail with spurious "missing" errors.
    if let Err(e) = radicle::io::set_file_limit(4096) {
        tracing::warn!("Unable to set open file limit: {e}");
    }

    let listener = DualListener::bind(&options.listen).await?;
    tracing::info!("listening on {:?}", &options.listen);

    let profile = Profile::load()?;
    let request_id = RequestId::new();

    tracing::info!("using radicle home at {}", profile.home().path().display());

    let web_config = api::WebConfig::from_profile(&profile);
    let profile = Arc::new(profile);
    let ctx = api::Context::new(profile.clone(), web_config.clone(), &options)?;

    #[cfg(unix)]
    tokio::spawn(async move {
        let mut sighup = signal(SignalKind::hangup()).expect("Failed to register SIGHUP handler");

        loop {
            sighup.recv().await;
            tracing::info!("Received SIGHUP, reloading web configuration");

            match Profile::load() {
                Ok(new_profile) => {
                    web_config
                        .update(|config| {
                            *config = new_profile.config.web.clone();
                        })
                        .await;
                    tracing::info!("Web configuration reloaded successfully");
                }
                Err(e) => {
                    tracing::error!("Failed to reload configuration: {:#}", e);
                    tracing::warn!("Continuing with previous configuration");
                }
            }
        }
    });

    let app = router(options, profile, ctx)?
        .layer(middleware::from_fn(tracing_middleware))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(move |request: &Request<Body>| {
                    if let Some(forwarded) = request.headers().get("X-Forwarded-For").and_then(|s| s.to_str().ok()) {
                        tracing::info_span!("request", id = %request_id.clone().next(), "X-Forwarded-For" = forwarded)
                    } else {
                        tracing::info_span!("request", id = %request_id.clone().next())
                    }
                })
                .on_response(
                    |response: &hyper::Response<Body>, latency: Duration, _span: &Span| {
                        if let Some(info) = response.extensions().get::<TracingInfo>() {
                            log_response(
                                logger::format(),
                                info,
                                response.status(),
                                latency,
                                response.body().size_hint().exact(),
                            );
                        } else {
                            tracing::info!("Processed");
                        }
                    },
                )
        ).into_make_service_with_connect_info::<DualAddr>();

    axum::serve(listener, app)
        .await
        .map_err(anyhow::Error::from)
}

/// Create a router consisting of other sub-routers.
fn router(options: Options, profile: Arc<Profile>, ctx: api::Context) -> anyhow::Result<Router> {
    let api_router = api::router(ctx);
    let aliases = Arc::new(options.aliases);
    let git_router = git::router(profile.clone(), aliases.clone());
    let raw_router = raw::router(profile, aliases);

    let app = Router::new()
        .route("/", get(root_index_handler))
        .merge(git_router)
        .nest("/api", api_router)
        .nest("/raw", raw_router)
        .layer(
            CorsLayer::new()
                .max_age(Duration::from_secs(86400))
                .allow_origin(cors::Any)
                .allow_methods([Method::GET])
                .allow_headers([CONTENT_TYPE]),
        );

    Ok(app)
}

async fn root_index_handler() -> impl IntoResponse {
    let response = serde_json::json!({
        "welcome": "Welcome to the radicle-httpd JSON API, this service doesn't serve the Radicle Explorer web client.",
        "version": format!("{}-{}", RADICLE_VERSION, env!("GIT_HEAD")),
        "path": "/",
        "links": [
            {
                "href": "/api",
                "rel": "api",
                "type": "GET"
            },
            {
                "href": "/raw/:rid/:sha/*path",
                "rel": "file_by_commit",
                "type": "GET"
            },
            {
                "href": "/raw/:rid/head/*path",
                "rel": "file_by_canonical_head",
                "type": "GET"
            },
            {
                "href": "/raw/:rid/blobs/:oid",
                "rel": "file_by_oid",
                "type": "GET"
            },
            {
                "href": "/:rid/*request",
                "rel": "git",
                "type": "GET"
            }
        ]
    });

    Json(response)
}

#[cfg(test)]
mod routes {
    use std::collections::HashMap;
    use std::net::SocketAddr;

    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use axum_listener::DualAddr;

    use crate::test;

    #[tokio::test]
    async fn test_invalid_route_returns_404() {
        let tmp = tempfile::tempdir().unwrap();
        let options = super::Options {
            aliases: HashMap::new(),
            listen: DualAddr::Tcp(SocketAddr::from(([0, 0, 0, 0], 8080))),
            cache: None,
            search: None,
        };
        let profile = test::profile(tmp.path(), [0xff; 32]);
        let web_config = crate::api::WebConfig::from_profile(&profile);
        let profile = std::sync::Arc::new(profile);
        let ctx = crate::api::Context::new(profile.clone(), web_config, &options).unwrap();
        let app = super::router(options, profile, ctx)
            .unwrap()
            .layer(MockConnectInfo(DualAddr::Tcp(SocketAddr::from((
                [0, 0, 0, 0],
                8080,
            )))));

        let response = test::get(&app, "/aa/a").await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
