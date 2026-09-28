use std::collections::BTreeSet;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

use radicle::git::Oid;
use radicle::identity::Did;
use radicle::node::AliasStore;
use radicle::storage::git::Repository;

use radicle_artifact::display::{CommitTitle, TagName};
use radicle_artifact::trust::{Scope, Trust};
use radicle_artifact::{cache_db_path, Artifact, Cid, Filters, Release, ReleaseId, Releases};

use crate::api;
use crate::api::error::Error;
use crate::api::json::Author;
use crate::api::query::{ReleaseScope, ReleasesQuery, MAX_PER_PAGE};
use crate::api::Context;
use crate::axum_extra::{Path, Query};

/// Default number of releases returned per page.
const DEFAULT_PER_PAGE: usize = 30;

/// Serialize a single artifact. Locations are flattened across contributors
/// into `{ user, url }` entries; attestations are the attesting nodes;
/// redactions carry the flagging user and its reason; metadata is only what
/// its author or a delegate wrote.
fn artifact_json(
    cid: &Cid,
    artifact: &Artifact,
    delegates: &BTreeSet<Did>,
    aliases: &impl AliasStore,
) -> Value {
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
        "metadata": artifact.trusted_metadata(delegates),
    })
}

/// Serialize a release. The COB has no title field: it is resolved from the
/// tag message when a tag is linked, otherwise the commit summary. `filters`
/// omits the artifacts hidden under the current view; `None` keeps all of
/// them, as a release fetched by id does.
fn release_json(
    id: ReleaseId,
    release: &Release,
    repo: &Repository,
    aliases: &impl AliasStore,
    delegates: &BTreeSet<Did>,
    filters: Option<Filters>,
) -> Value {
    let title = release
        .tag()
        .and_then(|tag| repo.title(tag))
        .or_else(|| repo.title(release.oid()));
    let tag_name = release.tag().and_then(|tag| repo.tag_name(tag));

    let artifacts = match filters {
        Some(filters) => filters
            .artifacts(release)
            .map(|(cid, artifact)| artifact_json(cid, artifact, delegates, aliases))
            .collect::<Vec<_>>(),
        None => release
            .artifacts()
            .iter()
            .map(|(cid, artifact)| artifact_json(cid, artifact, delegates, aliases))
            .collect::<Vec<_>>(),
    };

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

/// The filters a listed release shows its artifacts under. With no artifact by
/// an author in scope, every author's are shown, as the release page does, so
/// a teaser never counts fewer artifacts than its page lists.
fn listed_filters<'a>(release: &Release, filters: Filters<'a>) -> Filters<'a> {
    if release
        .artifacts()
        .values()
        .any(|artifact| filters.trust.admits(filters.scope, artifact.author()))
    {
        return filters;
    }
    Filters {
        scope: Scope::All,
        ..filters
    }
}

/// Get repo releases list, newest first.
/// `GET /repos/:rid/releases`
///
/// Scoped to releases created by a delegate and artifacts authored by a
/// delegate, or with `scope=untrusted` to those by non-delegates, so the two
/// scopes never overlap. Artifacts redacted by a trusted party are hidden
/// unless `showRedacted=true`. A release with no artifact in scope shows every
/// author's. A release whose artifacts were all redacted is hidden
/// with them; a release with no artifacts is shown. This is the view
/// `rad-artifact list` gives.
pub async fn list_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
    Query(qs): Query<ReleasesQuery>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let releases = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let aliases = ctx.profile.aliases();
        let ReleasesQuery {
            page,
            per_page,
            scope,
            show_redacted,
        } = qs;
        let page = page.unwrap_or(0);
        let per_page = per_page.unwrap_or(DEFAULT_PER_PAGE).min(MAX_PER_PAGE);

        // Read through the SQLite cache; it self-warms on read and is shared
        // with other release reads on this node. `list` is sorted newest
        // first and lazy, so only the rows up to the requested page are read.
        let store = Releases::open_cached(&repo, cache_db_path(ctx.profile.cobs()))?;
        // A web node has no local user, so only delegates are trusted unless
        // widened.
        let filters = Filters {
            trust: Trust::new(store.delegates(), None),
            scope: match scope.unwrap_or_default() {
                ReleaseScope::Trusted => Scope::Trusted,
                ReleaseScope::Untrusted => Scope::Untrusted,
            },
            include_redacted: show_redacted.unwrap_or(false),
        };
        let releases = store
            .list()?
            .filter_map(Result::ok)
            .filter(|(_, release)| filters.shows_release(release))
            .skip(page * per_page)
            .take(per_page)
            .map(|(id, release)| {
                release_json(
                    ReleaseId::from(id),
                    &release,
                    &repo,
                    &aliases,
                    store.delegates(),
                    Some(listed_filters(&release, filters)),
                )
            })
            .collect::<Vec<_>>();

        Ok::<_, Error>(releases)
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
        let (repo, _) = ctx.repo(rid)?;
        let aliases = ctx.profile.aliases();
        let cache = cache_db_path(ctx.profile.cobs());
        let store = Releases::open_cached(&repo, cache)?;
        let release = store
            .get(&ReleaseId::from(release_id))?
            .ok_or(Error::NotFound)?;

        Ok::<_, Error>(release_json(
            ReleaseId::from(release_id),
            &release,
            &repo,
            &aliases,
            store.delegates(),
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
    use crate::test::{get, seed, DID, HEAD, PARENT, RID};

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
    async fn test_repos_releases_scopes_are_disjoint() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        let delegate_id = create_release(&ctx, DELEGATE_SEED);
        let other_id = create_release(&ctx, NON_DELEGATE_SEED);
        let app = app(ctx);
        let ids = |body: serde_json::Value| {
            body.as_array()
                .unwrap()
                .iter()
                .map(|release| release["id"].as_str().unwrap().to_owned())
                .collect::<Vec<_>>()
        };

        // Default view is scoped to delegate creators.
        let response = get(&app, format!("/repos/{RID}/releases")).await;
        assert_eq!(ids(response.json().await), [delegate_id]);

        // `scope=untrusted` shows only non-delegate creators.
        let response = get(&app, format!("/repos/{RID}/releases?scope=untrusted")).await;
        assert_eq!(ids(response.json().await), [other_id]);
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

        // A delegate created it, so it is not among the others' releases.
        let response = get(&app, format!("/repos/{RID}/releases?scope=untrusted")).await;
        assert_eq!(response.json().await, json!([]));
    }

    #[tokio::test]
    async fn test_repos_releases_list_falls_back_to_every_author() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());

        // A delegate release with only a non-delegate artifact, and one where
        // the delegate's own artifact is redacted.
        {
            let signer = SigningKey::from_seed(Seed::new(DELEGATE_SEED));
            let other_signer = SigningKey::from_seed(Seed::new(NON_DELEGATE_SEED));
            let rid = RepoId::from_str(RID).unwrap();
            let repo = ctx.profile().storage.repository_mut(rid).unwrap();
            let mut releases = Releases::open(&repo).unwrap();
            let cid = Cid::from_str(CID).unwrap();
            let other_cid = Cid::from_str(CID_2).unwrap();

            let mut release = releases
                .create(Oid::from_str(HEAD).unwrap(), None, &signer)
                .unwrap();
            release
                .register_artifact(other_cid, "eve-build".to_string(), &other_signer)
                .unwrap();

            let mut release = releases
                .create(Oid::from_str(PARENT).unwrap(), None, &signer)
                .unwrap();
            release
                .register_artifact(cid, "linux-amd64".to_string(), &signer)
                .unwrap();
            release
                .redact(cid, "bad build".to_string(), &signer)
                .unwrap();
            release
                .register_artifact(other_cid, "eve-build".to_string(), &other_signer)
                .unwrap();
        }
        let app = app(ctx);

        let response = get(&app, format!("/repos/{RID}/releases")).await;
        let body = response.json().await;
        let counts = body
            .as_array()
            .unwrap()
            .iter()
            .map(|release| {
                (
                    release["oid"].as_str().unwrap().to_owned(),
                    release["artifacts"].as_array().unwrap().len(),
                )
            })
            .collect::<std::collections::BTreeMap<_, _>>();

        // With no delegate artifact, the non-delegate's is shown.
        assert_eq!(counts[HEAD], 1);
        // A redacted delegate artifact still scopes the release to
        // delegates, so nothing is left to show.
        assert_eq!(counts[PARENT], 0);
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
    async fn test_repos_releases_shows_empty_release() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        {
            let signer = SigningKey::from_seed(Seed::new(DELEGATE_SEED));
            let rid = RepoId::from_str(RID).unwrap();
            let repo = ctx.profile().storage.repository_mut(rid).unwrap();
            let mut releases = Releases::open(&repo).unwrap();
            releases
                .create(Oid::from_str(HEAD).unwrap(), None, &signer)
                .unwrap();
        }
        let app = app(ctx);

        // A release with no artifacts has nothing redacted, so the default
        // view shows it.
        let response = get(&app, format!("/repos/{RID}/releases")).await;
        let body = response.json().await;
        assert_eq!(body.as_array().unwrap().len(), 1);
        assert_eq!(body[0]["artifacts"], json!([]));
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
