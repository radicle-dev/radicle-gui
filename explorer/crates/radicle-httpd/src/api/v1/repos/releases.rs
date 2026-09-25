use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

use radicle::git::Oid;
use radicle::identity::doc::Delegates;
use radicle::identity::RepoId;
use radicle::node::AliasStore;
use radicle::storage::git::Repository;

use radicle_artifact::{cache_db_path, Artifact, Cid, Release, ReleaseId, Releases};
use radicle_search::index::release;
use radicle_search::query::ReleaseView;

use crate::api;
use crate::api::error::Error;
use crate::api::json::Author;
use crate::api::query::{ReleasesQuery, ReleasesSearchQuery, MAX_PER_PAGE, MAX_QUERY_LEN};
use crate::api::Context;
use crate::axum_extra::{Path, Query};

pub(crate) const DEFAULT_PER_PAGE: usize = 30;

fn view_from(all_authors: Option<bool>, show_redacted: Option<bool>) -> ReleaseView {
    ReleaseView {
        all_authors: all_authors.unwrap_or(false),
        show_redacted: show_redacted.unwrap_or(false),
    }
}

fn show_artifact(view: ReleaseView, artifact: &Artifact, delegates: &Delegates) -> bool {
    (view.all_authors || delegates.contains(artifact.author()))
        && (view.show_redacted || !release::redacted_by_trusted(artifact, delegates))
}

pub(crate) fn in_view(release: &Release, view: ReleaseView, delegates: &Delegates) -> bool {
    (view.all_authors || delegates.contains(release.creator()))
        && (view.show_redacted || !release::fully_redacted(release, delegates))
}

fn releases_in_view(
    repo: &Repository,
    cache: std::path::PathBuf,
    view: ReleaseView,
    delegates: &Delegates,
) -> Result<Vec<(ReleaseId, Release)>, Error> {
    let mut releases: Vec<(ReleaseId, Release)> = Releases::open_cached(repo, cache)?
        .all()?
        .into_iter()
        .filter_map(|r| {
            let (id, release) = r.ok()?;
            in_view(&release, view, delegates).then_some((ReleaseId::from(id), release))
        })
        .collect();
    releases.sort_by_key(|(_, release)| std::cmp::Reverse(release.timestamp()));
    Ok(releases)
}

/// Serialize a single artifact. Locations are flattened across contributors
/// into `{ user, url }` entries; attestations are the attesting nodes;
/// redactions carry the flagging user and its reason.
fn artifact_json(cid: &Cid, artifact: &Artifact, aliases: &impl AliasStore) -> Value {
    let locations = artifact
        .locations()
        .iter()
        .flat_map(|(did, urls)| {
            urls.iter()
                .map(move |url| json!({ "user": Author::new(did).as_json(aliases), "url": url }))
        })
        .collect::<Vec<_>>();
    let attestations = artifact
        .attestations()
        .iter()
        .map(|did| Author::new(did).as_json(aliases))
        .collect::<Vec<_>>();
    let redactions = artifact
        .redactions()
        .iter()
        .map(|(did, reason)| json!({ "user": Author::new(did).as_json(aliases), "reason": reason }))
        .collect::<Vec<_>>();

    json!({
        "cid": cid.to_string(),
        "name": artifact.name(),
        "author": Author::new(artifact.author()).as_json(aliases),
        "locations": locations,
        "attestations": attestations,
        "redactions": redactions,
        "metadata": artifact.metadata(),
    })
}

pub(crate) fn release_json(
    id: ReleaseId,
    release: &Release,
    title: Option<String>,
    tag_name: Option<String>,
    aliases: &impl AliasStore,
    delegates: &Delegates,
    view: Option<ReleaseView>,
) -> Value {
    let artifacts = release
        .artifacts()
        .iter()
        .filter(|(_, artifact)| view.is_none_or(|view| show_artifact(view, artifact, delegates)))
        .map(|(cid, artifact)| artifact_json(cid, artifact, aliases))
        .collect::<Vec<_>>();

    json!({
        "id": id.to_string(),
        "oid": release.oid(),
        "tag": release.tag(),
        "tagName": tag_name,
        "title": title,
        "createdAt": release.timestamp().as_secs(),
        "creator": Author::new(release.creator()).as_json(aliases),
        "artifacts": artifacts,
    })
}

fn from_doc(doc: &release::Document) -> Result<(ReleaseId, Release), Error> {
    let oid: Oid = doc.cob_id.parse().map_err(|e| {
        tracing::error!(
            "release {} has unparsable cob id {}: {e}",
            doc.id,
            doc.cob_id
        );
        Error::SearchUnavailable
    })?;
    let release: Release = serde_json::from_str(&doc.cob).map_err(|e| {
        tracing::error!("release {} failed to deserialize: {e}", doc.id);
        Error::SearchUnavailable
    })?;
    Ok((ReleaseId::from(oid), release))
}

pub(crate) async fn serialize_docs(
    ctx: &Context,
    rid: RepoId,
    docs: Vec<release::Document>,
    view: Option<ReleaseView>,
) -> Result<Vec<Value>, Error> {
    let backend = ctx.search().ok_or(Error::SearchUnavailable)?;
    let nids = api::unique_nids(
        docs.iter()
            .flat_map(|d| d.dids.iter().map(|did| *did.as_key())),
    );
    let aliases = backend.get_aliases(&nids).await?;
    let delegates = {
        let ctx = ctx.clone();
        api::blocking(move || {
            let (_, doc) = ctx.repo(rid)?;
            Ok::<_, Error>(doc.delegates().clone())
        })
        .await?
    };
    Ok(docs
        .into_iter()
        .filter_map(|d| {
            let (id, release) = from_doc(&d).ok()?;
            Some(release_json(
                id, &release, d.title, d.tag_name, &aliases, &delegates, view,
            ))
        })
        .collect())
}

/// Get repo releases list, newest first.
/// `GET /repos/:rid/releases`
///
/// Scoped to releases created by a delegate and artifacts authored by a
/// delegate (hiding those redacted by a trusted party) unless widened with
/// `allAuthors=true` / `showRedacted=true`. A release whose artifacts were all
/// redacted is hidden with them.
pub(super) async fn list_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
    Query(qs): Query<ReleasesQuery>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let ReleasesQuery {
        page,
        per_page,
        all_authors,
        show_redacted,
    } = qs;
    let page = page.unwrap_or(0);
    let per_page = per_page.unwrap_or(DEFAULT_PER_PAGE).min(MAX_PER_PAGE);
    let view = view_from(all_authors, show_redacted);

    let releases = match ctx.source() {
        crate::Source::Meilisearch => {
            let backend = ctx.search().ok_or(Error::SearchUnavailable)?;
            let docs = backend
                .list_releases(rid, view, page.saturating_mul(per_page), per_page)
                .await?;
            serialize_docs(&ctx, rid, docs, Some(view)).await?
        }
        crate::Source::Sqlite => {
            api::blocking(move || {
                let (repo, doc) = ctx.repo(rid)?;
                let delegates = doc.delegates();
                let aliases = ctx.profile.aliases();

                // Read through the SQLite cache; it self-warms on read and is shared
                // with other release reads on this node.
                let cache = cache_db_path(ctx.profile.cobs());
                let releases = releases_in_view(&repo, cache, view, delegates)?;

                Ok::<_, Error>(
                    releases
                        .into_iter()
                        .skip(page.saturating_mul(per_page))
                        .take(per_page)
                        .map(|(id, release)| {
                            let text = release::text(&repo, &release);
                            release_json(
                                id,
                                &release,
                                text.title,
                                text.tag_name,
                                &aliases,
                                delegates,
                                Some(view),
                            )
                        })
                        .collect::<Vec<_>>(),
                )
            })
            .await?
        }
    };

    Ok::<_, Error>(Json(json!(releases)))
}

/// Get a single repo release by id, with all its artifacts.
/// `GET /repos/:rid/releases/:id`
pub(super) async fn get_handler(
    State(ctx): State<Context>,
    Path((rid, release_id)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;

    let value = match ctx.source() {
        crate::Source::Meilisearch => {
            let backend = ctx.search().ok_or(Error::SearchUnavailable)?;
            let doc = backend
                .get_release(rid, &release_id.to_string())
                .await?
                .ok_or(Error::NotFound)?;
            from_doc(&doc)?;
            let mut releases = serialize_docs(&ctx, rid, vec![doc], None).await?;
            releases.pop().ok_or(Error::NotFound)?
        }
        crate::Source::Sqlite => {
            api::blocking(move || {
                let (repo, doc) = ctx.repo(rid)?;
                let delegates = doc.delegates();
                let aliases = ctx.profile.aliases();
                let cache = cache_db_path(ctx.profile.cobs());
                let release = Releases::open_cached(&repo, cache)?
                    .get(&ReleaseId::from(release_id))?
                    .ok_or(Error::NotFound)?;
                let text = release::text(&repo, &release);

                Ok::<_, Error>(release_json(
                    ReleaseId::from(release_id),
                    &release,
                    text.title,
                    text.tag_name,
                    &aliases,
                    delegates,
                    None,
                ))
            })
            .await?
        }
    };

    Ok::<_, Error>(Json(value))
}

/// Search a repo's releases.
/// `GET /repos/:rid/releases/search`
pub(super) async fn search_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
    Query(qs): Query<ReleasesSearchQuery>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    if ctx.source() != crate::Source::Meilisearch {
        return Err(Error::SearchNotSupported);
    }
    let backend = ctx.search().ok_or(Error::SearchUnavailable)?;
    let q: String =
        qs.q.unwrap_or_default()
            .chars()
            .take(MAX_QUERY_LEN)
            .collect();
    let page = qs.page.unwrap_or(0);
    let per_page = qs.per_page.unwrap_or(DEFAULT_PER_PAGE).min(MAX_PER_PAGE);
    let view = view_from(qs.all_authors, qs.show_redacted);
    let docs = backend
        .search_releases(rid, &q, view, page.saturating_mul(per_page), per_page)
        .await?;
    let releases = serialize_docs(&ctx, rid, docs, Some(view)).await?;
    Ok::<_, Error>(Json(json!(releases)))
}

#[cfg(test)]
mod routes {
    use std::net::SocketAddr;
    use std::str::FromStr;

    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use axum::Router;
    use pretty_assertions::assert_eq;
    use serde_json::json;

    use radicle::cob::ObjectId;
    use radicle::crypto::{Seed, SigningKey};
    use radicle::git::Oid;
    use radicle::identity::RepoId;
    use radicle::storage::{ReadStorage, WriteStorage};

    use radicle_artifact::{Cid, Releases};
    use radicle_search::index::release;
    use url::Url;

    use crate::api::backend::Backend;
    use crate::api::Context;
    use crate::test::{get, seed, DID, HEAD, RID};

    /// A valid CIDv1 string; the release COB stores it verbatim.
    const CID: &str = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    /// A second, distinct CIDv1 string, for releases with more than one
    /// artifact.
    const CID_2: &str = "bafkr4ihjtgc6jaulcccny3jhc3ezxfjdgnp4vvt23nf6qqlrhpk764ufbu";
    const LOCATION: &str = "https://example.com/linux-amd64.tar.gz";

    /// The delegate signer seeded by `test::seed` (alias "seed").
    const DELEGATE_SEED: [u8; 32] = [0xff; 32];
    /// A signer that is not a delegate of the seeded repo.
    const NON_DELEGATE_SEED: [u8; 32] = [0xee; 32];

    fn app(ctx: Context) -> Router {
        super::super::router(ctx).layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))))
    }

    /// Create a release on the seeded repo at `HEAD`, signed by `seed`, with a
    /// single artifact and location. Returns the release id string.
    fn create_release(ctx: &Context, signer_seed: [u8; 32]) -> String {
        let signer = SigningKey::from_seed(Seed::new(signer_seed));
        let rid = RepoId::from_str(RID).unwrap();
        let repo = ctx.profile().storage.repository_mut(rid).unwrap();
        let oid = Oid::from_str(HEAD).unwrap();

        let mut releases = Releases::open(&repo).unwrap();
        let mut release = releases.create(oid, None, &signer).unwrap();
        let cid = Cid::from_str(CID).unwrap();
        release
            .register_artifact(cid, "linux-amd64".to_string(), &signer)
            .unwrap();
        release
            .add_location(cid, Url::parse(LOCATION).unwrap(), &signer)
            .unwrap();

        release.id().oid().to_string()
    }

    fn create_release_entry(
        ctx: &Context,
        signer_seed: [u8; 32],
    ) -> (ObjectId, radicle_artifact::Release) {
        let id = create_release(ctx, signer_seed);
        let rid = RepoId::from_str(RID).unwrap();
        let repo = ctx.profile().storage.repository(rid).unwrap();
        let oid = Oid::from_str(&id).unwrap();
        let release = Releases::open(&repo)
            .unwrap()
            .get(&radicle_artifact::ReleaseId::from(oid))
            .unwrap()
            .unwrap();
        (ObjectId::from(oid), release)
    }

    fn release_doc(
        ctx: &Context,
        id: &ObjectId,
        release: &radicle_artifact::Release,
    ) -> release::Document {
        let rid = RepoId::from_str(RID).unwrap();
        let repo = ctx.profile().storage.repository(rid).unwrap();
        let doc_at = radicle::storage::ReadRepository::identity_doc(&repo).unwrap();
        release::Document::new(
            rid,
            id,
            release,
            release::text(&repo, release),
            doc_at.delegates(),
        )
        .unwrap()
    }

    fn seed_meili_releases(dir: &std::path::Path, seeds: &[[u8; 32]]) -> (Context, Vec<String>) {
        let mut ctx = crate::test::seed_meili(dir);
        let mut ids = Vec::new();
        let mut fake = match ctx.search() {
            Some(Backend::Fake(fake)) => fake.clone(),
            _ => unreachable!("seed_meili installs a fake backend"),
        };
        for seed in seeds {
            let (id, release) = create_release_entry(&ctx, *seed);
            fake.releases.push(release_doc(&ctx, &id, &release));
            ids.push(id.to_string());
        }
        fake.repos[0].release_count = seeds.len() as u64;
        ctx.set_search_backend(crate::Source::Meilisearch, Backend::Fake(fake));
        (ctx, ids)
    }

    #[tokio::test]
    async fn test_meili_releases_list_matches_sqlite_shape() {
        let tmp = tempfile::tempdir().unwrap();
        let (ctx, ids) = seed_meili_releases(tmp.path(), &[DELEGATE_SEED]);
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases")).await;
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.json().await;
        assert!(body[0]["createdAt"].as_u64().unwrap() > 0);
        body[0]["createdAt"].take();

        assert_eq!(
            body,
            json!([{
                "id": ids[0],
                "oid": HEAD,
                "tag": null,
                "tagName": null,
                "title": "Add another folder",
                "createdAt": null,
                "creator": { "id": DID, "alias": "seed" },
                "artifacts": [{
                    "cid": CID,
                    "name": "linux-amd64",
                    "author": { "id": DID, "alias": "seed" },
                    "locations": [
                        { "user": { "id": DID, "alias": "seed" }, "url": LOCATION }
                    ],
                    "attestations": [],
                    "redactions": [],
                    "metadata": {},
                }],
            }])
        );
    }

    #[tokio::test]
    async fn test_meili_releases_list_applies_view_flags() {
        let tmp = tempfile::tempdir().unwrap();
        let (ctx, _) = seed_meili_releases(tmp.path(), &[NON_DELEGATE_SEED]);
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases")).await;
        assert_eq!(response.json().await, json!([]));

        let response = get(&app, format!("/repos/{RID}/releases?allAuthors=true")).await;
        assert_eq!(response.json().await.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_meili_release_by_id_and_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let (ctx, ids) = seed_meili_releases(tmp.path(), &[DELEGATE_SEED]);
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases/{}", ids[0])).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.json().await;
        assert_eq!(body["id"], json!(ids[0]));
        assert_eq!(body["title"], json!("Add another folder"));
        assert_eq!(body["artifacts"][0]["cid"], json!(CID));

        let response = get(
            &app,
            format!("/repos/{RID}/releases/ffffffffffffffffffffffffffffffffffffffff"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_meili_release_corrupt_doc_is_skipped_in_lists_and_503_by_id() {
        let tmp = tempfile::tempdir().unwrap();
        let (mut ctx, ids) = seed_meili_releases(tmp.path(), &[DELEGATE_SEED, NON_DELEGATE_SEED]);
        let mut fake = match ctx.search() {
            Some(Backend::Fake(fake)) => fake.clone(),
            _ => unreachable!("seed_meili_releases installs a fake backend"),
        };
        fake.releases[1].cob = "not json".to_string();
        ctx.set_search_backend(crate::Source::Meilisearch, Backend::Fake(fake));
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases?allAuthors=true")).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.json().await;
        let listed: Vec<&str> = body
            .as_array()
            .unwrap()
            .iter()
            .map(|release| release["id"].as_str().unwrap())
            .collect();
        assert_eq!(listed, vec![ids[0].as_str()]);

        let response = get(&app, format!("/repos/{RID}/releases/{}", ids[1])).await;
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn test_repos_releases_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let app = app(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/releases")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json().await, json!([]));
    }

    #[tokio::test]
    async fn test_repos_releases_list() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        let id = create_release(&ctx, DELEGATE_SEED);
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases")).await;
        assert_eq!(response.status(), StatusCode::OK);

        // `createdAt` is stamped at COB-creation time, so drop it before
        // comparing against the fixed shape.
        let mut body = response.json().await;
        assert!(body[0]["createdAt"].as_u64().unwrap() > 0);
        body[0]["createdAt"].take();

        assert_eq!(
            body,
            json!([{
                "id": id,
                "oid": HEAD,
                "tag": null,
                "tagName": null,
                "title": "Add another folder",
                "createdAt": null,
                "creator": { "id": DID, "alias": "seed" },
                "artifacts": [{
                    "cid": CID,
                    "name": "linux-amd64",
                    "author": { "id": DID, "alias": "seed" },
                    "locations": [
                        { "user": { "id": DID, "alias": "seed" }, "url": LOCATION }
                    ],
                    "attestations": [],
                    "redactions": [],
                    "metadata": {},
                }],
            }])
        );
    }

    #[tokio::test]
    async fn test_repos_release_by_id() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        let id = create_release(&ctx, DELEGATE_SEED);
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases/{id}")).await;
        assert_eq!(response.status(), StatusCode::OK);

        let body = response.json().await;
        assert_eq!(body["id"], json!(id));
        assert_eq!(body["oid"], json!(HEAD));
        assert_eq!(body["title"], json!("Add another folder"));
        assert_eq!(body["artifacts"][0]["cid"], json!(CID));
    }

    #[tokio::test]
    async fn test_repos_release_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let app = app(seed(tmp.path()));
        let response = get(
            &app,
            format!("/repos/{RID}/releases/ffffffffffffffffffffffffffffffffffffffff"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_releases_hides_non_delegate_creator() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        create_release(&ctx, NON_DELEGATE_SEED);
        let app = app(ctx);

        // Default view is scoped to delegate creators.
        let response = get(&app, format!("/repos/{RID}/releases")).await;
        assert_eq!(response.json().await, json!([]));

        // `allAuthors=true` widens it to include non-delegate creators.
        let response = get(&app, format!("/repos/{RID}/releases?allAuthors=true")).await;
        let body = response.json().await;
        assert_eq!(body.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_repos_releases_list_hides_non_delegate_artifact() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());

        // The delegate creates a release with two artifacts: its own, and
        // one registered by a non-delegate.
        {
            let signer = SigningKey::from_seed(Seed::new(DELEGATE_SEED));
            let other_signer = SigningKey::from_seed(Seed::new(NON_DELEGATE_SEED));
            let rid = RepoId::from_str(RID).unwrap();
            let repo = ctx.profile().storage.repository_mut(rid).unwrap();
            let oid = Oid::from_str(HEAD).unwrap();
            let mut releases = Releases::open(&repo).unwrap();
            let mut release = releases.create(oid, None, &signer).unwrap();

            let cid = Cid::from_str(CID).unwrap();
            release
                .register_artifact(cid, "linux-amd64".to_string(), &signer)
                .unwrap();

            let other_cid = Cid::from_str(CID_2).unwrap();
            release
                .register_artifact(other_cid, "eve-build".to_string(), &other_signer)
                .unwrap();
        }
        let app = app(ctx);

        // The release itself stays visible: its creator is a delegate. Only
        // the non-delegate's artifact is dropped from the list view.
        let response = get(&app, format!("/repos/{RID}/releases")).await;
        let body = response.json().await;
        let artifacts = body[0]["artifacts"].as_array().unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0]["cid"], json!(CID));

        // `allAuthors=true` widens it to include the non-delegate's artifact.
        let response = get(&app, format!("/repos/{RID}/releases?allAuthors=true")).await;
        let body = response.json().await;
        let artifacts = body[0]["artifacts"].as_array().unwrap();
        assert_eq!(artifacts.len(), 2);
    }

    #[tokio::test]
    async fn test_repos_releases_hides_redacted_artifact() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());

        // The delegate creates a release, then redacts its own artifact.
        {
            let signer = SigningKey::from_seed(Seed::new(DELEGATE_SEED));
            let rid = RepoId::from_str(RID).unwrap();
            let repo = ctx.profile().storage.repository_mut(rid).unwrap();
            let oid = Oid::from_str(HEAD).unwrap();
            let mut releases = Releases::open(&repo).unwrap();
            let mut release = releases.create(oid, None, &signer).unwrap();
            let cid = Cid::from_str(CID).unwrap();
            release
                .register_artifact(cid, "linux-amd64".to_string(), &signer)
                .unwrap();
            release
                .redact(cid, "bad build".to_string(), &signer)
                .unwrap();
        }
        let app = app(ctx);

        // With its only artifact redacted by a trusted party, the release has
        // nothing left to show and is hidden too.
        let response = get(&app, format!("/repos/{RID}/releases")).await;
        assert_eq!(response.json().await, json!([]));

        // `showRedacted=true` surfaces it, carrying the redaction reason.
        let response = get(&app, format!("/repos/{RID}/releases?showRedacted=true")).await;
        let body = response.json().await;
        assert_eq!(body[0]["artifacts"][0]["cid"], json!(CID));
        assert_eq!(
            body[0]["artifacts"][0]["redactions"][0]["reason"],
            json!("bad build")
        );
    }

    #[tokio::test]
    async fn test_repos_releases_alias_resolution() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ctx = seed(tmp.path());
        ctx.set_repo_aliases(std::collections::HashMap::from_iter([(
            "hello".to_string(),
            RepoId::from_str(RID).unwrap(),
        )]));
        let id = create_release(&ctx, DELEGATE_SEED);
        let app = app(ctx);

        // Both release routes accept a configured alias in place of the RID.
        let response = get(&app, "/repos/hello/releases").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json().await[0]["id"], json!(id));

        let response = get(&app, format!("/repos/hello/releases/{id}")).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json().await["id"], json!(id));

        // An unknown alias is not found.
        let response = get(&app, "/repos/nope/releases").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_releases_per_page_is_clamped() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        create_release(&ctx, DELEGATE_SEED);
        let app = app(ctx);

        // A caller requesting more than MAX_PER_PAGE must not be able to
        // widen the page beyond the cap.
        let response = get(&app, format!("/repos/{RID}/releases?perPage=1000")).await;
        assert_eq!(response.status(), StatusCode::OK);
        let len = response.json().await.as_array().unwrap().len();
        assert!(len <= crate::api::query::MAX_PER_PAGE);
    }

    #[tokio::test]
    async fn test_meili_release_search_hits_text_and_dids() {
        let tmp = tempfile::tempdir().unwrap();
        let (ctx, ids) = seed_meili_releases(tmp.path(), &[DELEGATE_SEED]);
        let app = app(ctx);

        for q in ["amd64", "another%20folder", "example.com", DID] {
            let response = get(&app, format!("/repos/{RID}/releases/search?q={q}")).await;
            assert_eq!(response.status(), StatusCode::OK, "query {q}");
            let body = response.json().await;
            assert_eq!(body.as_array().unwrap().len(), 1, "query {q}");
            assert_eq!(body[0]["id"], json!(ids[0]), "query {q}");
        }

        let response = get(&app, format!("/repos/{RID}/releases/search?q=windows")).await;
        assert_eq!(response.json().await, json!([]));
    }

    #[tokio::test]
    async fn test_meili_release_search_respects_the_view() {
        let tmp = tempfile::tempdir().unwrap();
        let (ctx, _) = seed_meili_releases(tmp.path(), &[NON_DELEGATE_SEED]);
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases/search?q=amd64")).await;
        assert_eq!(response.json().await, json!([]));

        let response = get(
            &app,
            format!("/repos/{RID}/releases/search?q=amd64&allAuthors=true"),
        )
        .await;
        assert_eq!(response.json().await.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_sqlite_release_search_is_not_supported() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases/search?q=amd64")).await;
        assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
        assert_eq!(response.json().await["code"], json!(501));
    }

    #[tokio::test]
    async fn test_release_search_route_wins_over_release_id() {
        let tmp = tempfile::tempdir().unwrap();
        let (ctx, _) = seed_meili_releases(tmp.path(), &[]);
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases/search")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json().await, json!([]));
    }
}
