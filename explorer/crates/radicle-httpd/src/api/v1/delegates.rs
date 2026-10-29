use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};

use radicle::identity::{Did, RepoId};
use radicle::storage::ReadStorage;
use radicle_search::index::repo;

use crate::api::error::Error;
use crate::api::query::{PaginationQuery, RepoQuery, MAX_PER_PAGE};
use crate::api::{Backend, Context};
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

    let infos = match ctx.source() {
        crate::Source::Meilisearch => {
            let backend = ctx.search().ok_or(Error::SearchUnavailable)?;
            let pinned_rids: Vec<RepoId> = pinned.iter().copied().collect();
            let mut docs = delegate_docs(backend, &did, &show, &pinned_rids).await?;
            docs.sort_by_key(|d| d.rid);
            let docs = docs
                .into_iter()
                .skip(page.saturating_mul(per_page))
                .take(per_page)
                .collect();
            super::repos::listing::hydrate_docs(&ctx, docs).await?
        }
        crate::Source::Sqlite => {
            crate::api::blocking(move || {
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
                        let Ok(meta) = ctx.repo_meta_sqlite(&repo, &doc.doc) else {
                            return None;
                        };
                        let Ok(repo_info) = ctx.repo_info(&repo, doc, meta) else {
                            return None;
                        };

                        Some(repo_info)
                    })
                    .skip(page.saturating_mul(per_page))
                    .take(per_page)
                    .collect::<Vec<_>>();
                Ok::<_, Error>(infos)
            })
            .await?
        }
    };

    Ok::<_, Error>(Json(infos))
}

/// Resolve the repo docs for `did` under `show`.
///
/// `show=pinned` resolves the (small, fixed) pinned set directly rather than
/// filtering it out of `repos_by_delegate`'s capped, unsorted results — a
/// pinned repo ranked beyond the cap must still be found.
async fn delegate_docs(
    backend: &Backend,
    did: &Did,
    show: &RepoQuery,
    pinned: &[RepoId],
) -> Result<Vec<repo::Document>, Error> {
    match show {
        RepoQuery::Pinned => Ok(backend
            .get_repo_docs(pinned)
            .await?
            .into_iter()
            .filter(|d| d.delegates.iter().any(|del| del == did))
            .collect()),
        RepoQuery::All => {
            let rids = backend
                .repos_by_delegate(did, super::repos::DELEGATE_REPOS_MAX)
                .await?;
            Ok(backend.get_repo_docs(&rids).await?)
        }
    }
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
                      "releases": 0,
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
                      "releases": 0,
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
                      "releases": 0,
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
                      "releases": 0,
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

    #[tokio::test]
    async fn test_delegates_repos_meili_mode() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed_meili(tmp.path());
        let app =
            super::router(ctx).layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));

        let response = get(&app, format!("/delegates/{DID}/repos?show=all")).await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await;
        assert_eq!(body.as_array().unwrap().len(), 1);
        assert_eq!(body[0]["rid"], RID);
    }

    #[tokio::test]
    async fn test_delegates_repos_meili_mode_pinned_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed_meili(tmp.path());
        let app =
            super::router(ctx).layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));

        let response = get(&app, format!("/delegates/{DID}/repos?show=pinned")).await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await;
        assert_eq!(body.as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_delegate_docs_finds_pinned_repo_beyond_delegate_cap() {
        use radicle::identity::doc::Delegates;
        use radicle::identity::{Did, RepoId};
        use std::str::FromStr;

        fn rid_from(i: u64) -> RepoId {
            let mut bytes = [0u8; 20];
            bytes[..8].copy_from_slice(&i.to_be_bytes());
            RepoId::from(radicle::git::Oid::from_sha1(bytes))
        }

        fn doc_by(rid: RepoId, delegate: Did) -> radicle_search::index::repo::Document {
            radicle_search::index::repo::Document {
                v: radicle_search::index::SCHEMA_VERSION,
                id: radicle_search::index::repo::DocumentKey::new(rid),
                rid,
                rid_hex: radicle_search::index::repo::rid_hex(rid),
                name: "x".to_string(),
                description: String::new(),
                default_branch: radicle::git::fmt::RefString::try_from("master").unwrap(),
                delegates: Delegates::from(delegate),
                seeding_count: 0,
                issue_counts: Default::default(),
                patch_counts: Default::default(),
                release_count: 0,
                activity: radicle_search::index::repo::Activity {
                    head: None,
                    head_committer_time: None,
                    activity_timestamps: vec![],
                },
            }
        }

        let did = Did::from_str(DID).unwrap();
        let mut repos: Vec<_> = (0..super::super::repos::DELEGATE_REPOS_MAX as u64)
            .map(|i| doc_by(rid_from(i), did))
            .collect();
        let far_rid = rid_from(super::super::repos::DELEGATE_REPOS_MAX as u64);
        repos.push(doc_by(far_rid, did));

        let fake = crate::api::backend::fake::Fake {
            repos,
            ..Default::default()
        };
        let backend = crate::api::Backend::Fake(fake);

        let all = super::delegate_docs(&backend, &did, &super::RepoQuery::All, &[])
            .await
            .unwrap();
        assert!(!all.iter().any(|d| d.rid == far_rid));

        let pinned = super::delegate_docs(&backend, &did, &super::RepoQuery::Pinned, &[far_rid])
            .await
            .unwrap();
        assert_eq!(pinned.len(), 1);
        assert_eq!(pinned[0].rid, far_rid);
    }
}
