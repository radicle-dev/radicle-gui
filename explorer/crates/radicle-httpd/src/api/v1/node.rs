use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::json;
use tokio::time::{timeout, Duration};

use radicle::crypto::ssh::fmt;
use radicle::identity::Did;
use radicle::node::address::Store as AddressStore;
use radicle::node::routing::Store;
use radicle::node::{AliasStore, Config, Handle, NodeId, UserAgent};
use radicle::web;
use radicle::Node;

use crate::api::error::Error;
use crate::api::Context;
use crate::axum_extra::{cached_response, Path};

const SOCKET_QUERY_TIMEOUT_MS: Duration = Duration::from_millis(500);

pub fn router(ctx: Context) -> Router {
    Router::new()
        .route("/node", get(node_handler))
        .route("/node/policies/repos", get(node_policies_repos_handler))
        .route(
            "/node/policies/repos/{rid}",
            get(node_policies_repo_handler),
        )
        .route("/nodes/{nid}", get(nodes_handler))
        .route("/nodes/{nid}/inventory", get(nodes_inventory_handler))
        .with_state(ctx)
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Response {
    id: String,
    agent: Option<UserAgent>,
    config: Option<Config>,
    state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    banner_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

impl Response {
    fn new(
        nid: NodeId,
        agent: Option<UserAgent>,
        config: Option<Config>,
        state: String,
        web_config: web::Config,
    ) -> Self {
        Response {
            id: nid.to_string(),
            agent,
            config,
            state,
            avatar_url: web_config.avatar_url,
            banner_url: web_config.banner_url,
            description: web_config.description,
        }
    }
}

/// Build the local node response. Used by `GET /node` and by the
/// `GET /info` aggregate.
pub(crate) async fn build_response(ctx: &Context) -> Result<Response, Error> {
    let node_id = ctx.profile.public_key;
    let home = ctx.profile.database()?;
    let agent = AddressStore::get(&home, &node_id)
        .unwrap_or_default()
        .map(|node| node.agent);

    // The call to `is_running` is a blocking call, which has been, anecdotally, slow to respond.
    // Spawn a thread with a timeout to ensure that the call to `is_running` does not slow down the
    // response of the route too much.
    let node_state = {
        let socket = ctx.profile.socket_from_env();
        let is_running = timeout(
            SOCKET_QUERY_TIMEOUT_MS,
            tokio::task::spawn_blocking(move || Node::new(socket).is_running()),
        )
        .await
        .ok() // Handle timeout.
        .and_then(|r| r.ok()) // Handle JoinError.
        .unwrap_or(false);

        if is_running {
            "running"
        } else {
            "stopped"
        }
    };
    let config = {
        let socket = ctx.profile.socket_from_env();
        match timeout(
            SOCKET_QUERY_TIMEOUT_MS,
            tokio::task::spawn_blocking(move || Node::new(socket).config()),
        )
        .await
        {
            Ok(Ok(result)) => match result {
                Ok(config) => Some(config),
                Err(err) => {
                    tracing::error!("Error getting node config: {:#}", err);
                    None
                }
            },
            _ => None, // Timeout or join error - node likely not running.
        }
    };

    Ok(Response::new(
        node_id,
        agent,
        config,
        node_state.to_string(),
        ctx.web_config().read().await,
    ))
}

/// Return local node information.
/// `GET /node`
async fn node_handler(State(ctx): State<Context>) -> impl IntoResponse {
    let response = build_response(&ctx).await?;
    Ok::<_, Error>(cached_response(response, 600))
}

/// Return stored information about other nodes.
/// `GET /nodes/:nid`
async fn nodes_handler(State(ctx): State<Context>, Path(nid): Path<NodeId>) -> impl IntoResponse {
    let aliases = ctx.profile.aliases();
    let response = json!({
        "alias": aliases.alias(&nid),
        "did": Did::from(nid),
        "ssh": {
            "full": fmt::key(&nid),
            "hash": fmt::fingerprint(&nid)
        }
    });

    Ok::<_, Error>(Json(response))
}

/// Return stored information about other nodes.
/// `GET /nodes/:nid/inventory`
async fn nodes_inventory_handler(
    State(ctx): State<Context>,
    Path(nid): Path<NodeId>,
) -> impl IntoResponse {
    let db = &ctx.profile.database()?;
    let resources = db.get_inventory(&nid)?;

    Ok::<_, Error>(Json(resources))
}

/// Return local repo policies information.
/// `GET /node/policies/repos`
async fn node_policies_repos_handler(State(ctx): State<Context>) -> impl IntoResponse {
    let policies = ctx.profile.policies()?;
    let policies = policies.seed_policies()?.collect::<Result<Vec<_>, _>>()?;

    Ok::<_, Error>(Json(policies))
}

/// Return local repo policy information.
/// `GET /node/policies/repos/:rid`
async fn node_policies_repo_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let policies = ctx.profile.policies()?;
    let policy = policies.seed_policy(&rid)?;

    Ok::<_, Error>(Json(*policy))
}

#[cfg(test)]
mod routes {
    use std::net::SocketAddr;

    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use pretty_assertions::assert_eq;
    use serde_json::{json, Value};

    use crate::test::*;

    #[tokio::test]
    async fn test_node_repos_policies() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/node/policies/repos").await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!([
                {
                    "rid": "rad:zLuTzcmoWMcdK37xqArS8eckp9vK",
                    "policy": {
                        "policy": "block",
                    }
                },
                {
                    "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                    "policy": {
                        "policy": "allow",
                        "scope": "all",
                    }
                },
                {
                    "rid": "rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE",
                    "policy": {
                        "policy": "allow",
                        "scope" : "followed"
                    }
                },
            ])
        );
    }

    #[tokio::test]
    async fn test_node_repo_policies() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(
            &app,
            "/node/policies/repos/rad:zLuTzcmoWMcdK37xqArS8eckp9vK",
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "policy": "block",
            })
        );
    }

    #[tokio::test]
    async fn test_nodes() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let nid = seed.profile().id();
        let response = get(&app, format!("/nodes/{nid}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "alias": "seed",
                "did": "did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi",
                "ssh": {
                    "full": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHahWSBEpuT1ESZbynOmBNkLBSnR32Ar4woZqSV2YNH1",
                    "hash": "SHA256:UIedaL6Cxm6OUErh9GQUzzglSk7VpQlVTI1TAFB/HWA",
                },
            })
        );
    }

    #[tokio::test]
    async fn test_nodes_inventory() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let nid = seed.profile().public_key;
        let response = get(&app, format!("/nodes/{nid}/inventory")).await;

        assert_eq!(response.status(), StatusCode::OK);
        let json_response = response.json().await;

        let mut arr = match json_response {
            Value::Array(arr) => arr,
            _ => panic!("Expected JSON array in response"),
        };

        arr.sort_by(|a, b| a.as_str().cmp(&b.as_str()));

        assert_eq!(
            arr,
            vec![
                json!("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp"),
                json!("rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE"),
            ]
        );
    }

    #[tokio::test]
    async fn test_node_uses_reloadable_config() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());

        {
            seed.web_config
                .update(|config| {
                    config.description = Some("Test node description".to_string());
                    config.avatar_url = Some("https://example.com/avatar.png".to_string());
                    config.banner_url = Some("https://example.com/banner.png".to_string());
                })
                .await;
        }

        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/node").await;

        assert_eq!(response.status(), StatusCode::OK);
        let json_response = response.json().await;

        assert_eq!(json_response["description"], json!("Test node description"));
        assert_eq!(
            json_response["avatarUrl"],
            json!("https://example.com/avatar.png")
        );
        assert_eq!(
            json_response["bannerUrl"],
            json!("https://example.com/banner.png")
        );
    }

    #[tokio::test]
    async fn test_node_endpoint_responds_quickly() {
        use std::time::Instant;

        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));

        let start = Instant::now();
        let response = get(&app, "/node").await;
        let elapsed = start.elapsed();

        // Endpoint should respond within 2 seconds even if node.is_running() is slow
        // (500ms timeout + overhead)
        assert!(
            elapsed.as_secs() < 2,
            "Request took too long: {:?}",
            elapsed
        );
        assert_eq!(response.status(), StatusCode::OK);

        let json_response = response.json().await;
        assert!(json_response["state"].is_string());
        let state = json_response["state"].as_str().unwrap();
        assert!(state == "running" || state == "stopped");
    }
}
