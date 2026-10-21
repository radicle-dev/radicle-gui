use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

use radicle::git::Oid;
use radicle::identity::doc::Delegates;
use radicle::node::AliasStore;
use radicle::storage::git::Repository;

use radicle_artifact::display::{CommitTitle, TagName};
use radicle_artifact::{cache_db_path, Artifact, Cid, Release, ReleaseId, Releases};

use crate::api;
use crate::api::error::Error;
use crate::api::json::Author;
use crate::api::query::{ReleasesQuery, MAX_PER_PAGE};
use crate::api::Context;
use crate::axum_extra::{Path, Query};

/// Default number of releases returned per page.
const DEFAULT_PER_PAGE: usize = 30;

/// Whether an artifact was redacted by its own author or by a delegate.
fn redacted_by_trusted(artifact: &Artifact, delegates: &Delegates) -> bool {
    artifact
        .redactions()
        .keys()
        .any(|did| did == artifact.author() || delegates.contains(did))
}

/// How far the caller widened the default, delegate-scoped release view.
#[derive(Clone, Copy)]
struct Filter {
    /// Include releases and artifacts authored by non-delegates.
    all_authors: bool,
    /// Include artifacts redacted by their author or a delegate.
    show_redacted: bool,
}

impl Filter {
    /// Whether an artifact is shown under this view: authored by a delegate
    /// (or `all_authors`), and not redacted by its author or a delegate (or
    /// `show_redacted`).
    fn show_artifact(&self, artifact: &Artifact, delegates: &Delegates) -> bool {
        (self.all_authors || delegates.contains(artifact.author()))
            && (self.show_redacted || !redacted_by_trusted(artifact, delegates))
    }

    /// Whether a release is shown under this view: created by a delegate (or
    /// `all_authors`), and not left with all of its artifacts redacted by a
    /// trusted party (or `show_redacted`).
    fn show_release(&self, release: &Release, delegates: &Delegates) -> bool {
        (self.all_authors || delegates.contains(release.creator()))
            && (self.show_redacted || !release_redacted(release, delegates))
    }
}

/// Whether every artifact of a release was redacted by a trusted party. A
/// release without artifacts is not redacted; it has nothing to redact.
fn release_redacted(release: &Release, delegates: &Delegates) -> bool {
    let artifacts = release.artifacts();

    !artifacts.is_empty()
        && artifacts
            .values()
            .all(|artifact| redacted_by_trusted(artifact, delegates))
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

/// Serialize a release. The COB has no title field: it is resolved from the
/// tag message when a tag is linked, otherwise the commit summary. `filter`
/// omits the artifacts hidden under the current view; `None` keeps all of
/// them, as a release fetched by id does.
fn release_json(
    id: ReleaseId,
    release: &Release,
    repo: &Repository,
    aliases: &impl AliasStore,
    delegates: &Delegates,
    filter: Option<Filter>,
) -> Value {
    let title = release
        .tag()
        .and_then(|tag| repo.title(tag))
        .or_else(|| repo.title(release.oid()));
    let tag_name = release.tag().and_then(|tag| repo.tag_name(tag));

    let artifacts = release
        .artifacts()
        .iter()
        .filter(|(_, artifact)| {
            filter.is_none_or(|filter| filter.show_artifact(artifact, delegates))
        })
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

/// Get repo releases list, newest first.
/// `GET /repos/:rid/releases`
///
/// Scoped to releases created by a delegate and artifacts authored by a
/// delegate (hiding those redacted by a trusted party) unless widened with
/// `allAuthors=true` / `showRedacted=true`. A release whose artifacts were all
/// redacted is hidden with them.
pub async fn list_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
    Query(qs): Query<ReleasesQuery>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let releases = api::blocking(move || {
        let (repo, doc) = ctx.repo(rid)?;
        let delegates = doc.delegates();
        let aliases = ctx.profile.aliases();
        let ReleasesQuery {
            page,
            per_page,
            all_authors,
            show_redacted,
        } = qs;
        let page = page.unwrap_or(0);
        let per_page = per_page.unwrap_or(DEFAULT_PER_PAGE).min(MAX_PER_PAGE);
        let filter = Filter {
            all_authors: all_authors.unwrap_or(false),
            show_redacted: show_redacted.unwrap_or(false),
        };

        // Read through the SQLite cache; it self-warms on read and is shared
        // with other release reads on this node.
        let cache = cache_db_path(ctx.profile.cobs());
        let mut releases: Vec<_> = Releases::open_cached(&repo, cache)?
            .all()?
            .into_iter()
            .filter_map(|r| {
                let (id, release) = r.ok()?;
                filter
                    .show_release(&release, delegates)
                    .then_some((id, release))
            })
            .collect();
        releases.sort_by_key(|(_, release)| std::cmp::Reverse(release.timestamp()));

        Ok::<_, Error>(
            releases
                .into_iter()
                .skip(page * per_page)
                .take(per_page)
                .map(|(id, release)| {
                    release_json(
                        ReleaseId::from(id),
                        &release,
                        &repo,
                        &aliases,
                        delegates,
                        Some(filter),
                    )
                })
                .collect::<Vec<_>>(),
        )
    })
    .await?;

    Ok::<_, Error>(Json(releases))
}

/// Get a single repo release by id, with all its artifacts.
/// `GET /repos/:rid/releases/:id`
pub async fn get_handler(
    State(ctx): State<Context>,
    Path((rid, release_id)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let value = api::blocking(move || {
        let (repo, doc) = ctx.repo(rid)?;
        let delegates = doc.delegates();
        let aliases = ctx.profile.aliases();
        let cache = cache_db_path(ctx.profile.cobs());
        let release = Releases::open_cached(&repo, cache)?
            .get(&ReleaseId::from(release_id))?
            .ok_or(Error::NotFound)?;

        Ok::<_, Error>(release_json(
            ReleaseId::from(release_id),
            &release,
            &repo,
            &aliases,
            delegates,
            None,
        ))
    })
    .await?;

    Ok::<_, Error>(Json(value))
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

    use radicle::crypto::{Seed, SigningKey};
    use radicle::git::Oid;
    use radicle::identity::RepoId;
    use radicle::storage::WriteStorage;

    use radicle_artifact::{Cid, Releases};
    use url::Url;

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
}
