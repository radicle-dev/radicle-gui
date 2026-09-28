use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};

use radicle::identity::Did;
use radicle::storage::ReadStorage;

use crate::api::error::Error;
use crate::api::query::{PaginationQuery, RepoQuery, MAX_PER_PAGE};
use crate::api::Context;
use crate::axum_extra::{Path, Query};

pub fn router(ctx: Context) -> Router {
    Router::new()
        .route("/delegates/{did}/repos", get(delegates_repos_handler))
        .with_state(ctx)
}

/// List all repos which delegate is a part of.
/// `GET /delegates/:did/repos`
async fn delegates_repos_handler(
    State(ctx): State<Context>,
    Path(did): Path<Did>,
    Query(qs): Query<PaginationQuery>,
) -> impl IntoResponse {
    let PaginationQuery {
        show,
        page,
        per_page,
        ..
    } = qs;
    let page = page.unwrap_or(0);
    let per_page = per_page.unwrap_or(10).min(MAX_PER_PAGE);
    let pinned = ctx.web_config().read().await.pinned.repositories.clone();

    let infos = crate::api::blocking(move || {
        let storage = &ctx.profile.storage;
        let mut repos = match show {
            RepoQuery::All => storage
                .repositories()?
                .into_iter()
                .filter(|repo| repo.doc.visibility().is_public())
                .filter(|repo| repo.doc.delegates().iter().any(|d| *d == did))
                .collect::<Vec<_>>(),
            RepoQuery::Pinned => storage
                .repositories_by_id(pinned.iter())
                .filter_map(|result| match result {
                    Ok(repo) => Some(repo),
                    Err(e) => {
                        tracing::warn!("Failed to load pinned repository: {}", e);
                        None
                    }
                })
                .filter(|repo| repo.doc.visibility().is_public())
                .filter(|repo| repo.doc.delegates().iter().any(|d| *d == did))
                .collect::<Vec<_>>(),
        };
        repos.sort_by_key(|p| p.rid);

        let infos = repos
            .into_iter()
            .filter_map(|id| {
                let Ok((repo, doc)) = ctx.repo(id.rid) else {
                    return None;
                };
                let Ok(repo_info) = ctx.repo_info(&repo, doc) else {
                    return None;
                };

                Some(repo_info)
            })
            .skip(page * per_page)
            .take(per_page)
            .collect::<Vec<_>>();
        Ok::<_, Error>(infos)
    })
    .await?;

    Ok::<_, Error>(Json(infos))
}

#[cfg(test)]
mod routes {
    use std::net::SocketAddr;

    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use serde_json::json;

    use crate::test::{self, get, CONTRIBUTOR_ALIAS, DID, HEAD, RID};

    #[tokio::test]
    async fn test_delegates_repos() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = test::seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(
            &app,
            "/delegates/did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi/repos?show=all",
        )
        .await;

        assert_eq!(
            response.status(),
            StatusCode::OK,
            "failed response: {:?}",
            response.json().await
        );
        assert_eq!(
            response.json().await,
            json!([
              {
                "payloads": {
                  "xyz.radicle.project": {
                    "data": {
                      "defaultBranch": "master",
                      "description": "Rad repository for tests",
                      "name": "hello-world",
                    },
                    "meta": {
                      "head": HEAD,
                      "patches": {
                        "open": 1,
                        "draft": 0,
                        "archived": 0,
                        "merged": 0,
                      },
                      "issues": {
                        "open": 1,
                        "closed": 0,
                      },
                    }
                  }
                },
                "delegates": [
                  {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS
                  }
                ],
                "threshold": 1,
                "visibility": {
                  "type": "public"
                },
                "rid": RID,
                "seeding": 1,
                "refs": { "tags": {}, "refs": { "refs/heads/master": HEAD } }
              },
              {
                "payloads": {
                  "xyz.radicle.project": {
                    "data": {
                      "defaultBranch": "master",
                      "description": "Rad repository for sorting",
                      "name": "again-hello-world",
                    },
                    "meta": {
                      "head": "344dcd184df5bf37aab6c107fa9371a1c5b3321a",
                      "patches": {
                        "open": 0,
                        "draft": 0,
                        "archived": 0,
                        "merged": 0,
                      },
                      "issues": {
                        "open": 0,
                        "closed": 0,
                      },
                    }
                  }
                },
                "delegates": [
                  {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS
                  },
                ],
                "threshold": 1,
                "visibility": {
                  "type": "public"
                },
                "rid": "rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE",
                "seeding": 1,
                "refs": { "tags": {}, "refs": { "refs/heads/master": "344dcd184df5bf37aab6c107fa9371a1c5b3321a" } }
              }
            ])
        );

        let app = super::router(seed).layer(MockConnectInfo(SocketAddr::from((
            [192, 168, 13, 37],
            8080,
        ))));
        let response = get(
            &app,
            "/delegates/did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi/repos?show=all",
        )
        .await;

        assert_eq!(
            response.status(),
            StatusCode::OK,
            "failed response: {:?}",
            response.json().await
        );
        assert_eq!(
            response.json().await,
            json!([
              {
                "payloads": {
                  "xyz.radicle.project": {
                    "data": {
                      "defaultBranch": "master",
                      "description": "Rad repository for tests",
                      "name": "hello-world",
                    },
                    "meta": {
                      "head": HEAD,
                      "patches": {
                        "open": 1,
                        "draft": 0,
                        "archived": 0,
                        "merged": 0,
                      },
                      "issues": {
                        "open": 1,
                        "closed": 0,
                      },
                    }
                  }
                },
                "delegates": [
                  {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS
                  }
                ],
                "threshold": 1,
                "visibility": {
                  "type": "public"
                },
                "rid": RID,
                "seeding": 1,
                "refs": { "tags": {}, "refs": { "refs/heads/master": HEAD } }
              },
              {
                "payloads": {
                  "xyz.radicle.project": {
                    "data": {
                      "defaultBranch": "master",
                      "description": "Rad repository for sorting",
                      "name": "again-hello-world",
                    },
                    "meta": {
                      "head": "344dcd184df5bf37aab6c107fa9371a1c5b3321a",
                      "patches": {
                        "open": 0,
                        "draft": 0,
                        "archived": 0,
                        "merged": 0,
                      },
                      "issues": {
                        "open": 0,
                        "closed": 0,
                      },
                    }
                  }
                },
                "delegates": [
                  {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS
                  },
                ],
                "threshold": 1,
                "visibility": {
                  "type": "public"
                },
                "rid": "rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE",
                "seeding": 1,
                "refs": { "tags": {}, "refs": { "refs/heads/master": "344dcd184df5bf37aab6c107fa9371a1c5b3321a" } }
              }
            ])
        );
    }
}
