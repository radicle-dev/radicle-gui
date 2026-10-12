use std::ops::Deref;
use std::path::PathBuf;
use std::sync::Arc;

use axum::Router;
use axum::body::Bytes;
use axum::extract::{FromRequestParts, Request, State};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::post;
use hyper::HeaderMap;
use hyper::Method;
use hyper::header::{CONTENT_TYPE, HeaderName, HeaderValue};
use hyper::http::request::Parts;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};
use tower_http::cors::{self, CorsLayer};

use radicle::cob::cache::COBS_DB_FILE;
use radicle::crypto::ssh::Passphrase;
use radicle::node::{NOTIFICATIONS_DB_FILE, NodeId};
use radicle::storage::{ReadRepository as _, ReadStorage as _};
use radicle::{git, identity};
use radicle_types as types;
use radicle_types::cobs::CobOptions;
use radicle_types::cobs::FromRadicleAction;
use radicle_types::cobs::issue;
use radicle_types::cobs::issue::NewIssue;
use radicle_types::config::Version;
use radicle_types::domain::inbox::models::notification;
use radicle_types::domain::inbox::service::Service as InboxService;
use radicle_types::domain::issue::service::Service as IssueService;
use radicle_types::domain::issue::traits::IssueService as _;
use radicle_types::domain::patch::models;
use radicle_types::domain::patch::service::Service;
use radicle_types::domain::patch::traits::PatchService;
use radicle_types::error::Error;
use radicle_types::outbound::sqlite::Sqlite;
use radicle_types::traits::Profile;
use radicle_types::traits::artifact_node::ArtifactNode;
use radicle_types::traits::cobs::Cobs;
use radicle_types::traits::identity::Identity;
use radicle_types::traits::inbox::Inbox;
use radicle_types::traits::issue::{Issues, IssuesMut};
use radicle_types::traits::job::Jobs;
use radicle_types::traits::patch::{Patches, PatchesMut};
use radicle_types::traits::release::{ReleaseFilter, Releases};
use radicle_types::traits::release_mut::ReleasesMut;
use radicle_types::traits::repo::{Repo, Show};
use radicle_types::traits::thread::Thread;

#[derive(Clone)]
pub struct Context {
    profile: Arc<radicle::Profile>,
    patches: Arc<Service<Sqlite>>,
    issues: Arc<IssueService<Sqlite>>,
    inbox: Arc<InboxService<Sqlite>>,
}

impl Repo for Context {}
impl Cobs for Context {}
impl Identity for Context {}
impl Inbox for Context {}
impl Thread for Context {}
impl Issues for Context {}
impl IssuesMut for Context {}
impl Jobs for Context {}
impl Patches for Context {}
impl PatchesMut for Context {}
impl Releases for Context {}
impl ReleasesMut for Context {}
impl ArtifactNode for Context {}
impl Profile for Context {
    fn profile(&self) -> radicle::Profile {
        self.profile.deref().clone()
    }
}

impl Context {
    fn load() -> Result<Self, Error> {
        let profile = radicle::Profile::load()?;
        let cobs_db = Sqlite::reader(profile.cobs().join(COBS_DB_FILE))?;
        let inbox_db = Sqlite::reader(profile.node().join(NOTIFICATIONS_DB_FILE))?;

        Ok(Self {
            profile: Arc::new(profile),
            patches: Arc::new(Service::new(cobs_db.clone())),
            issues: Arc::new(IssueService::new(cobs_db)),
            inbox: Arc::new(InboxService::new(inbox_db)),
        })
    }
}

/// Loads the profile on first use, so the server can run before `init`.
#[derive(Clone, Default)]
pub struct Shared {
    ctx: Arc<RwLock<Option<Context>>>,
}

pub struct Ctx(Context);

impl FromRequestParts<Shared> for Ctx {
    type Rejection = Error;

    async fn from_request_parts(_: &mut Parts, shared: &Shared) -> Result<Self, Error> {
        if let Some(ctx) = shared.ctx.read().await.as_ref() {
            return Ok(Ctx(ctx.clone()));
        }
        let mut guard = shared.ctx.write().await;
        let ctx = match guard.as_ref() {
            Some(ctx) => ctx.clone(),
            None => guard.insert(Context::load()?).clone(),
        };

        Ok(Ctx(ctx))
    }
}

// The API acts on a real profile, so only the app's own dev servers may call
// it: Vite on 1420 (`npm run start`) and the e2e preview on 3001.
const ALLOWED_ORIGINS: [&str; 4] = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
];

pub fn router(shared: Shared) -> Router {
    let writes = Router::new()
        .route("/seed", post(seed_handler))
        .route("/unseed", post(unseed_handler))
        .route("/clean", post(clean_handler))
        .route("/create_issue", post(create_issue_handler))
        .route("/create_issue_comment", post(create_issue_comment_handler))
        .route("/create_patch_comment", post(create_patch_comment_handler))
        .route("/rebuild_issue_cache", post(rebuild_issue_cache_handler))
        .route("/rebuild_patch_cache", post(rebuild_patch_cache_handler))
        .route("/save_embed_by_path", post(save_embed_by_path_handler))
        .route("/save_embed_by_bytes", post(save_embed_by_bytes_handler))
        .route("/clear_notifications", post(clear_notifications_handler))
        .route("/init", post(init_handler))
        .route("/edit_issue", post(edit_issue_handler))
        .route("/delete_issue", post(delete_issue_handler))
        .route("/edit_patch", post(edit_patch_handler))
        .route("/create_patch_review", post(create_patch_review_handler))
        .route("/delete_patch", post(delete_patch_handler))
        .route(
            "/create_or_open_release",
            post(create_or_open_release_handler),
        )
        .route("/register_artifact", post(register_artifact_handler))
        .route("/attest_artifact", post(attest_artifact_handler))
        .route(
            "/set_artifact_metadata",
            post(set_artifact_metadata_handler),
        )
        .route(
            "/remove_artifact_metadata",
            post(remove_artifact_metadata_handler),
        )
        .route(
            "/add_artifact_location",
            post(add_artifact_location_handler),
        )
        .route(
            "/remove_artifact_location",
            post(remove_artifact_location_handler),
        )
        .route("/redact_artifact", post(redact_artifact_handler))
        .route("/delete_release", post(delete_release_handler))
        .route("/seed_artifact", post(seed_artifact_handler))
        .route("/unseed_artifact", post(unseed_artifact_handler))
        .route("/download_artifact", post(download_artifact_handler))
        .route_layer(middleware::from_fn_with_state(
            Arc::new(Mutex::new(())),
            serialize_writes,
        ));

    Router::new()
        .route("/startup", post(startup_handler))
        .route("/config", post(config_handler))
        .route("/alias", post(alias_handler))
        .route("/search_aliases", post(search_aliases_handler))
        .route("/authenticate", post(auth_handler))
        .route("/check_radicle_cli", post(check_radicle_cli_handler))
        .route("/node_running", post(node_running_handler))
        .route("/repo_count", post(repo_count_handler))
        .route("/list_repos", post(repo_root_handler))
        .route("/list_repos_summary", post(list_repos_summary_handler))
        .route(
            "/seeded_not_replicated",
            post(seeded_not_replicated_handler),
        )
        .route("/repo_by_id", post(repo_handler))
        .route("/list_repo_refs", post(list_repo_refs_handler))
        .route("/list_canonical_tags", post(list_canonical_tags_handler))
        .route("/identity_by_repo", post(identity_handler))
        .route("/version", post(version_handler))
        .route("/git_info", post(git_info_handler))
        .route("/diff_stats", post(diff_stats_handler))
        .route(
            "/activity_by_issue",
            post(activity_issue_handler::<radicle::issue::Action, issue::Action>),
        )
        .route(
            "/activity_by_patch",
            post(activity_patch_handler::<radicle::patch::Action, models::patch::Action>),
        )
        .route("/repo_readme", post(readme_handler))
        .route("/repo_tree", post(tree_handler))
        .route("/repo_blob", post(blob_handler))
        .route("/repo_blob_bytes", post(blob_bytes_handler))
        .route("/get_diff", post(diff_handler))
        .route("/get_diff_text", post(diff_text_handler))
        .route("/save_diff_to_disk", post(save_diff_handler))
        .route("/get_commit_diff", post(commit_diff_handler))
        .route("/list_commits", post(list_commits_handler))
        .route("/list_repo_commits", post(list_repo_commits_handler))
        .route("/repo_commit_count", post(repo_commit_count_handler))
        .route("/repo_commit", post(repo_commit_handler))
        .route(
            "/repo_commits_by_prefix",
            post(repo_commits_by_prefix_handler),
        )
        .route("/repo_split_tree_path", post(repo_split_tree_path_handler))
        .route("/list_issues", post(issues_handler))
        .route("/issue_by_id", post(issue_handler))
        .route("/comment_threads_by_issue_id", post(issue_threads_handler))
        .route("/list_patches", post(patches_handler))
        .route("/patch_by_id", post(patch_handler))
        .route("/revisions_by_patch", post(revision_handler))
        .route("/get_embed", post(get_embeds_handler))
        .route("/save_embed_to_disk", post(save_embed_to_disk_handler))
        .route("/list_releases", post(releases_handler))
        .route("/release_by_id", post(release_handler))
        .route("/release_counts", post(release_counts_handler))
        .route("/compute_artifact_cid", post(compute_artifact_cid_handler))
        .route(
            "/artifact_node_running",
            post(artifact_node_running_handler),
        )
        .route("/artifact_binaries", post(artifact_binaries_handler))
        .route("/artifact_node_status", post(artifact_node_status_handler))
        .route("/seeded_artifacts", post(seeded_artifacts_handler))
        .route("/list_jobs", post(jobs_handler))
        .route("/list_notifications", post(list_notifications_handler))
        .route("/notification_count", post(notification_count_handler))
        .merge(writes)
        .layer(middleware::from_fn(read_body))
        .layer(
            CorsLayer::new()
                .allow_origin(cors::AllowOrigin::list(
                    ALLOWED_ORIGINS.map(HeaderValue::from_static),
                ))
                .allow_methods([Method::POST, Method::GET])
                .allow_headers([CONTENT_TYPE, HeaderName::from_static("rid")]),
        )
        .with_state(shared)
}

/// Hyper closes the keep-alive connection when a handler leaves the body
/// unread, and browsers don't retry the next POST on it.
async fn read_body(request: Request, next: Next) -> Response {
    let (parts, body) = request.into_parts();
    match axum::body::to_bytes(body, usize::MAX).await {
        Ok(bytes) => {
            next.run(Request::from_parts(parts, axum::body::Body::from(bytes)))
                .await
        }
        Err(e) => (hyper::StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn serialize_writes(
    State(lock): State<Arc<Mutex<()>>>,
    request: Request,
    next: Next,
) -> Response {
    let _guard = lock.lock().await;
    next.run(request).await
}

async fn config_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    let config = ctx.config();

    Ok::<_, Error>(Json(config))
}

async fn startup_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    ctx.check_cobs_cache()?;

    Ok::<_, Error>(Json(ctx.config()))
}

#[derive(Deserialize)]
struct AliasBody {
    pub nid: NodeId,
}

async fn alias_handler(
    Ctx(ctx): Ctx,
    Json(AliasBody { nid }): Json<AliasBody>,
) -> impl IntoResponse {
    Ok::<_, Error>(Json(ctx.alias(nid)))
}

#[derive(Deserialize)]
struct AuthBody {
    #[serde(default)]
    pub passphrase: Option<String>,
}

async fn auth_handler(
    Ctx(ctx): Ctx,
    Json(AuthBody { passphrase }): Json<AuthBody>,
) -> impl IntoResponse {
    radicle_types::auth::authenticate(&ctx.profile, passphrase.map(Passphrase::from))?;

    Ok::<_, Error>(Json(()))
}

#[derive(Deserialize)]
struct InitBody {
    pub alias: String,
    pub passphrase: String,
}

async fn init_handler(Json(InitBody { alias, passphrase }): Json<InitBody>) -> impl IntoResponse {
    radicle_types::auth::init(alias, Passphrase::from(passphrase))?;

    Ok::<_, Error>(Json(()))
}

async fn check_radicle_cli_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    radicle_types::binaries::check_radicle_cli(&ctx.profile)?;

    Ok::<_, Error>(Json(()))
}

async fn node_running_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    Ok::<_, Error>(Json(ctx.node_running()))
}

#[derive(Deserialize)]
struct SearchAliasesBody {
    pub query: Option<String>,
}

async fn search_aliases_handler(
    Ctx(ctx): Ctx,
    Json(SearchAliasesBody { query }): Json<SearchAliasesBody>,
) -> impl IntoResponse {
    Ok::<_, Error>(Json(ctx.search_aliases(query)))
}

#[derive(Serialize, Deserialize)]
pub struct Options {
    show: Show,
}

async fn repo_root_handler(
    Ctx(ctx): Ctx,
    Json(Options { show }): Json<Options>,
) -> impl IntoResponse {
    let repos = ctx.list_repos(show)?;

    Ok::<_, Error>(Json(repos))
}

async fn repo_count_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    let repos = ctx.repo_count()?;
    Ok::<_, Error>(Json(repos))
}

async fn list_repos_summary_handler(
    Ctx(ctx): Ctx,
    Json(Options { show }): Json<Options>,
) -> impl IntoResponse {
    let repos = ctx.list_repos_summary(show)?;
    Ok::<_, Error>(Json(repos))
}

async fn seeded_not_replicated_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    let rids = ctx.seeded_not_replicated()?;
    Ok::<_, Error>(Json(rids))
}

async fn seed_handler(Ctx(ctx): Ctx, Json(RepoBody { rid }): Json<RepoBody>) -> impl IntoResponse {
    ctx.seed(rid)?;

    Ok::<_, Error>(Json(()))
}

async fn unseed_handler(
    Ctx(ctx): Ctx,
    Json(RepoBody { rid }): Json<RepoBody>,
) -> impl IntoResponse {
    ctx.unseed(rid)?;

    Ok::<_, Error>(Json(()))
}

async fn clean_handler(Ctx(ctx): Ctx, Json(RepoBody { rid }): Json<RepoBody>) -> impl IntoResponse {
    ctx.clean(rid)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Deserialize)]
struct ListNotificationsBody {
    pub params: notification::RepoGroupParams,
}

async fn list_notifications_handler(
    Ctx(ctx): Ctx,
    Json(ListNotificationsBody { params }): Json<ListNotificationsBody>,
) -> impl IntoResponse {
    let notifications = ctx.list_notifications(&ctx.inbox, params)?;

    Ok::<_, Error>(Json(notifications))
}

async fn notification_count_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    let count = ctx.notification_count(&ctx.inbox)?;

    Ok::<_, Error>(Json(count))
}

#[derive(Deserialize)]
struct ClearNotificationsBody {
    pub params: notification::SetStatusNotifications,
}

async fn clear_notifications_handler(
    Ctx(ctx): Ctx,
    Json(ClearNotificationsBody { params }): Json<ClearNotificationsBody>,
) -> impl IntoResponse {
    ctx.clear_notifications(params)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
struct RepoBody {
    pub rid: identity::RepoId,
}

async fn repo_handler(Ctx(ctx): Ctx, Json(RepoBody { rid }): Json<RepoBody>) -> impl IntoResponse {
    let info = ctx.repo_by_id(rid)?;

    Ok::<_, Error>(Json(info))
}

async fn identity_handler(
    Ctx(ctx): Ctx,
    Json(RepoBody { rid }): Json<RepoBody>,
) -> impl IntoResponse {
    let identity = ctx.identity_by_repo(rid)?;

    Ok::<_, Error>(Json(identity))
}

async fn list_repo_refs_handler(
    Ctx(ctx): Ctx,
    Json(RepoBody { rid }): Json<RepoBody>,
) -> impl IntoResponse {
    let refs = ctx.list_repo_refs(rid)?;

    Ok::<_, Error>(Json(refs))
}

async fn list_canonical_tags_handler(
    Ctx(ctx): Ctx,
    Json(RepoBody { rid }): Json<RepoBody>,
) -> impl IntoResponse {
    let tags = ctx.list_canonical_tags(rid)?;

    Ok::<_, Error>(Json(tags))
}

async fn git_info_handler() -> impl IntoResponse {
    Ok::<_, Error>(Json(types::binaries::git_info()))
}

async fn version_handler() -> impl IntoResponse {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../radicle-tauri/tauri.conf.json"))?;
    let version = Version {
        version: config["version"].as_str().unwrap_or("unknown").to_string(),
        head: env!("GIT_HEAD").to_string(),
    };

    Ok::<_, Error>(Json(version))
}

#[derive(Serialize, Deserialize)]
struct DiffStatsBody {
    pub rid: identity::RepoId,
    pub base: git::Oid,
    pub head: git::Oid,
}

async fn diff_stats_handler(
    Ctx(ctx): Ctx,
    Json(DiffStatsBody { rid, base, head }): Json<DiffStatsBody>,
) -> impl IntoResponse {
    let info = ctx.diff_stats(rid, base, head)?;

    Ok::<_, Error>(Json(info))
}

#[derive(Serialize, Deserialize)]
struct DiffBody {
    pub rid: identity::RepoId,
    pub options: types::cobs::diff::DiffOptions,
}

#[derive(Serialize, Deserialize)]
struct ReadmeBody {
    pub rid: identity::RepoId,
    #[serde(default)]
    pub sha: Option<git::Oid>,
    #[serde(default)]
    pub peer: Option<NodeId>,
    #[serde(default)]
    pub revision: Option<String>,
}

async fn readme_handler(
    Ctx(ctx): Ctx,
    Json(ReadmeBody {
        rid,
        sha,
        peer,
        revision,
    }): Json<ReadmeBody>,
) -> impl IntoResponse {
    let readme = ctx.repo_readme(rid, sha, peer, revision)?;

    Ok::<_, Error>(Json(readme))
}

#[derive(Serialize, Deserialize)]
struct TreeBody {
    pub rid: identity::RepoId,
    pub path: PathBuf,
    #[serde(default)]
    pub sha: Option<git::Oid>,
    #[serde(default)]
    pub peer: Option<NodeId>,
    #[serde(default)]
    pub revision: Option<String>,
}

async fn tree_handler(
    Ctx(ctx): Ctx,
    Json(TreeBody {
        rid,
        path,
        sha,
        peer,
        revision,
    }): Json<TreeBody>,
) -> impl IntoResponse {
    let info = ctx.repo_tree(rid, path, sha, peer, revision)?;

    Ok::<_, Error>(Json(info))
}

#[derive(Serialize, Deserialize)]
struct BlobBody {
    pub rid: identity::RepoId,
    pub path: PathBuf,
    #[serde(default)]
    pub sha: Option<git::Oid>,
}

async fn blob_handler(
    Ctx(ctx): Ctx,
    Json(BlobBody { rid, path, sha }): Json<BlobBody>,
) -> impl IntoResponse {
    let info = ctx.repo_blob(rid, path, sha)?;

    Ok::<_, Error>(Json(info))
}

#[derive(Deserialize)]
struct BlobBytesBody {
    pub rid: identity::RepoId,
    pub path: PathBuf,
    pub sha: git::Oid,
}

async fn blob_bytes_handler(
    Ctx(ctx): Ctx,
    Json(BlobBytesBody { rid, path, sha }): Json<BlobBytesBody>,
) -> impl IntoResponse {
    let bytes = ctx.repo_blob_bytes(rid, path, sha)?;

    Ok::<_, Error>(([(CONTENT_TYPE, "application/octet-stream")], bytes))
}

async fn diff_handler(
    Ctx(ctx): Ctx,
    Json(DiffBody { rid, options }): Json<DiffBody>,
) -> impl IntoResponse {
    let info = ctx.get_diff(rid, options)?;

    Ok::<_, Error>(Json(info))
}

#[derive(Serialize, Deserialize)]
struct DiffTextBody {
    pub rid: identity::RepoId,
    pub base: Option<git::Oid>,
    pub head: git::Oid,
    pub unified: Option<u32>,
    pub path: Option<String>,
}

async fn diff_text_handler(
    Ctx(ctx): Ctx,
    Json(DiffTextBody {
        rid,
        base,
        head,
        unified,
        path,
    }): Json<DiffTextBody>,
) -> impl IntoResponse {
    let text = ctx.get_diff_text(rid, base, head, unified, path)?;

    Ok::<_, Error>(Json(text))
}

#[derive(Serialize, Deserialize)]
struct SaveDiffBody {
    pub name: String,
    pub content: String,
}

/// Mirrors the Tauri `save_diff_to_disk` command. There is no native save
/// dialog on this driver, so the file lands in the OS temp directory under
/// the suggested name (reduced to its basename — the server is reachable
/// over the network, so `name` must not traverse paths). The web frontend
/// normally falls back to a browser download instead of calling this; the
/// route exists to keep the command surface mirrored and testable.
async fn save_diff_handler(
    Json(SaveDiffBody { name, content }): Json<SaveDiffBody>,
) -> impl IntoResponse {
    std::fs::write(temp_file_path(&name)?, content)?;

    Ok::<_, Error>(Json(()))
}

/// The server is reachable over the network, so a suggested file name is
/// reduced to its basename and must not traverse paths.
fn temp_file_path(name: &str) -> Result<PathBuf, Error> {
    let name = PathBuf::from(name);
    let Some(file_name) = name.file_name() else {
        return Err(Error::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "suggested file name has no basename component",
        )));
    };

    Ok(std::env::temp_dir().join(file_name))
}

#[derive(Serialize, Deserialize)]
struct CommitDiffBody {
    pub rid: identity::RepoId,
    pub sha: git::Oid,
}

async fn commit_diff_handler(
    Ctx(ctx): Ctx,
    Json(CommitDiffBody { rid, sha }): Json<CommitDiffBody>,
) -> impl IntoResponse {
    let diff = ctx.get_commit_diff(rid, sha)?;

    Ok::<_, Error>(Json(diff))
}

#[derive(Deserialize)]
struct ListCommitsBody {
    pub rid: identity::RepoId,
    pub base: String,
    pub head: String,
}

async fn list_commits_handler(
    Ctx(ctx): Ctx,
    Json(ListCommitsBody { rid, base, head }): Json<ListCommitsBody>,
) -> impl IntoResponse {
    let commits = ctx.list_commits(rid, base, head)?;

    Ok::<_, Error>(Json(commits))
}

#[derive(Serialize, Deserialize)]
struct ListRepoCommitsBody {
    pub rid: identity::RepoId,
    pub head: Option<git::Oid>,
    #[serde(default)]
    pub peer: Option<NodeId>,
    #[serde(default)]
    pub revision: Option<String>,
    pub skip: Option<usize>,
    pub take: Option<usize>,
}

async fn list_repo_commits_handler(
    Ctx(ctx): Ctx,
    Json(ListRepoCommitsBody {
        rid,
        head,
        peer,
        revision,
        skip,
        take,
    }): Json<ListRepoCommitsBody>,
) -> impl IntoResponse {
    let commits = ctx.list_repo_commits(rid, head, peer, revision, skip, take)?;

    Ok::<_, Error>(Json(commits))
}

#[derive(Serialize, Deserialize)]
struct RepoCommitCountBody {
    pub rid: identity::RepoId,
    pub head: git::Oid,
}

async fn repo_commit_count_handler(
    Ctx(ctx): Ctx,
    Json(RepoCommitCountBody { rid, head }): Json<RepoCommitCountBody>,
) -> impl IntoResponse {
    let count = ctx.repo_commit_count(rid, head)?;

    Ok::<_, Error>(Json(count))
}

#[derive(Serialize, Deserialize)]
struct RepoCommitBody {
    pub rid: identity::RepoId,
    #[serde(default)]
    pub sha: Option<git::Oid>,
    #[serde(default)]
    pub peer: Option<NodeId>,
    #[serde(default)]
    pub revision: Option<String>,
}

async fn repo_commit_handler(
    Ctx(ctx): Ctx,
    Json(RepoCommitBody {
        rid,
        sha,
        peer,
        revision,
    }): Json<RepoCommitBody>,
) -> impl IntoResponse {
    let commit = ctx.repo_commit(rid, sha, peer, revision)?;

    Ok::<_, Error>(Json(commit))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoCommitsByPrefixBody {
    pub rid: identity::RepoId,
    pub prefix: String,
}

async fn repo_commits_by_prefix_handler(
    Ctx(ctx): Ctx,
    Json(RepoCommitsByPrefixBody { rid, prefix }): Json<RepoCommitsByPrefixBody>,
) -> impl IntoResponse {
    let commits = ctx.repo_commits_by_prefix(rid, prefix)?;

    Ok::<_, Error>(Json(commits))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoSplitTreePathBody {
    pub rid: identity::RepoId,
    #[serde(default)]
    pub peer: Option<NodeId>,
    pub path: String,
}

async fn repo_split_tree_path_handler(
    Ctx(ctx): Ctx,
    Json(RepoSplitTreePathBody { rid, peer, path }): Json<RepoSplitTreePathBody>,
) -> impl IntoResponse {
    let split = ctx.repo_split_tree_path(rid, peer, path)?;

    Ok::<_, Error>(Json(split))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssuesBody {
    pub rid: identity::RepoId,
    pub status: Option<types::cobs::query::IssueStatus>,
    pub skip: Option<usize>,
    pub take: Option<usize>,
}

async fn issues_handler(
    Ctx(ctx): Ctx,
    Json(IssuesBody {
        rid,
        status,
        skip,
        take,
    }): Json<IssuesBody>,
) -> impl IntoResponse {
    let aliases = ctx.profile.aliases();
    let page = ctx
        .issues
        .list_paginated(rid, status.unwrap_or_default(), skip, take, &aliases)?;

    Ok::<_, Error>(Json(page))
}

#[derive(Serialize, Deserialize)]
struct CreateIssuesBody {
    pub rid: identity::RepoId,
    pub opts: CobOptions,
    pub new: NewIssue,
}

async fn create_issue_handler(
    Ctx(ctx): Ctx,
    Json(CreateIssuesBody { rid, opts, new }): Json<CreateIssuesBody>,
) -> impl IntoResponse {
    let issues = ctx.create_issue(rid, new, opts)?;

    Ok::<_, Error>(Json(issues))
}

#[derive(Serialize, Deserialize)]
struct CreateIssueCommentBody {
    pub rid: identity::RepoId,
    pub new: types::cobs::thread::NewIssueComment,
    pub opts: types::cobs::CobOptions,
}

async fn create_issue_comment_handler(
    Ctx(ctx): Ctx,
    Json(CreateIssueCommentBody { rid, opts, new }): Json<CreateIssueCommentBody>,
) -> impl IntoResponse {
    let comment = ctx.create_issue_comment(rid, new, opts)?;

    Ok::<_, Error>(Json(comment))
}

#[derive(Deserialize)]
struct CreatePatchCommentBody {
    pub rid: identity::RepoId,
    pub new: types::cobs::thread::NewPatchComment,
    pub opts: types::cobs::CobOptions,
}

async fn create_patch_comment_handler(
    Ctx(ctx): Ctx,
    Json(CreatePatchCommentBody { rid, opts, new }): Json<CreatePatchCommentBody>,
) -> impl IntoResponse {
    let comment = ctx.create_patch_comment(rid, new, opts)?;

    Ok::<_, Error>(Json(comment))
}

async fn rebuild_issue_cache_handler(
    Ctx(ctx): Ctx,
    Json(RepoBody { rid }): Json<RepoBody>,
) -> impl IntoResponse {
    ctx.rebuild_issue_cache(rid, |_| Ok(()))?;

    Ok::<_, Error>(Json(()))
}

async fn rebuild_patch_cache_handler(
    Ctx(ctx): Ctx,
    Json(RepoBody { rid }): Json<RepoBody>,
) -> impl IntoResponse {
    ctx.rebuild_patch_cache(rid, |_| Ok(()))?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditIssuesBody {
    pub rid: identity::RepoId,
    pub cob_id: git::Oid,
    pub action: issue::Action,
    pub opts: CobOptions,
}

async fn edit_issue_handler(
    Ctx(ctx): Ctx,
    Json(EditIssuesBody {
        rid,
        cob_id,
        action,
        opts,
    }): Json<EditIssuesBody>,
) -> impl IntoResponse {
    let issues = ctx.edit_issue(rid, cob_id, action, opts)?;

    Ok::<_, Error>(Json(issues))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivityBody {
    pub rid: identity::RepoId,
    pub id: git::Oid,
}

async fn activity_issue_handler<
    A: serde::Serialize + serde::de::DeserializeOwned,
    B: FromRadicleAction<A> + serde::Serialize,
>(
    Ctx(ctx): Ctx,
    Json(ActivityBody { rid, id }): Json<ActivityBody>,
) -> impl IntoResponse {
    let activity = ctx.activity_by_id::<A, B>(rid, &radicle::cob::issue::TYPENAME, id)?;

    Ok::<_, Error>(Json(activity))
}

async fn activity_patch_handler<
    A: serde::Serialize + serde::de::DeserializeOwned,
    B: FromRadicleAction<A> + serde::Serialize,
>(
    Ctx(ctx): Ctx,
    Json(ActivityBody { rid, id }): Json<ActivityBody>,
) -> impl IntoResponse {
    let activity = ctx.activity_by_id::<A, B>(rid, &radicle::cob::patch::TYPENAME, id)?;

    Ok::<_, Error>(Json(activity))
}

#[derive(Serialize, Deserialize)]
struct EmbedBody {
    pub rid: identity::RepoId,
    pub name: Option<String>,
    pub oid: git::Oid,
}

async fn get_embeds_handler(
    Ctx(ctx): Ctx,
    Json(EmbedBody { rid, name, oid }): Json<EmbedBody>,
) -> impl IntoResponse {
    let embed = ctx.get_embed(rid, name, oid)?;

    Ok::<_, Error>((
        [(CONTENT_TYPE, "application/octet-stream")],
        embed.into_bytes(),
    ))
}

#[derive(Deserialize)]
struct SaveEmbedByPathBody {
    pub rid: identity::RepoId,
    pub path: PathBuf,
}

async fn save_embed_by_path_handler(
    Ctx(ctx): Ctx,
    Json(SaveEmbedByPathBody { rid, path }): Json<SaveEmbedByPathBody>,
) -> impl IntoResponse {
    let oid = ctx.save_embed_by_path(rid, path)?;

    Ok::<_, Error>(Json(oid))
}

async fn save_embed_by_bytes_handler(
    Ctx(ctx): Ctx,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let rid = headers
        .get("rid")
        .and_then(|rid| rid.to_str().ok())
        .and_then(|rid| rid.parse().ok())
        .ok_or(Error::SaveEmbedError)?;
    let (name, bytes) = types::cobs::split_embed_upload(&body).ok_or(Error::SaveEmbedError)?;
    let oid = ctx.save_embed_by_bytes(rid, name, bytes)?;

    Ok::<_, Error>(Json(oid))
}

#[derive(Deserialize)]
struct SaveEmbedToDiskBody {
    pub rid: identity::RepoId,
    pub oid: git::Oid,
    pub name: String,
}

async fn save_embed_to_disk_handler(
    Ctx(ctx): Ctx,
    Json(SaveEmbedToDiskBody { rid, oid, name }): Json<SaveEmbedToDiskBody>,
) -> impl IntoResponse {
    let path = temp_file_path(&name)?;
    ctx.save_embed_to_disk(rid, oid, path)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
struct IssueBody {
    pub rid: identity::RepoId,
    pub id: git::Oid,
}

async fn issue_handler(
    Ctx(ctx): Ctx,
    Json(IssueBody { rid, id }): Json<IssueBody>,
) -> impl IntoResponse {
    let issue = ctx.issue_by_id(rid, id)?;

    Ok::<_, Error>(Json(issue))
}

async fn issue_threads_handler(
    Ctx(ctx): Ctx,
    Json(IssueBody { rid, id }): Json<IssueBody>,
) -> impl IntoResponse {
    let issue_threads = ctx.comment_threads_by_issue_id(rid, id)?;

    Ok::<_, Error>(Json(issue_threads))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleasesBody {
    pub rid: identity::RepoId,
    pub filter: Option<ReleaseFilter>,
    pub skip: Option<usize>,
    pub take: Option<usize>,
}

async fn releases_handler(
    Ctx(ctx): Ctx,
    Json(ReleasesBody {
        rid,
        filter,
        skip,
        take,
    }): Json<ReleasesBody>,
) -> impl IntoResponse {
    let releases = ctx.list_releases(rid, filter, skip, take)?;

    Ok::<_, Error>(Json(releases))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseBody {
    pub rid: identity::RepoId,
    pub id: git::Oid,
}

async fn release_handler(
    Ctx(ctx): Ctx,
    Json(ReleaseBody { rid, id }): Json<ReleaseBody>,
) -> impl IntoResponse {
    let release = ctx.release_by_id(rid, id)?;

    Ok::<_, Error>(Json(release))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseCountsBody {
    pub rid: identity::RepoId,
}

async fn release_counts_handler(
    Ctx(ctx): Ctx,
    Json(ReleaseCountsBody { rid }): Json<ReleaseCountsBody>,
) -> impl IntoResponse {
    let counts = ctx.release_counts(rid)?;

    Ok::<_, Error>(Json(counts))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ComputeArtifactCidBody {
    pub path: std::path::PathBuf,
}

async fn compute_artifact_cid_handler(
    Ctx(ctx): Ctx,
    Json(ComputeArtifactCidBody { path }): Json<ComputeArtifactCidBody>,
) -> impl IntoResponse {
    let digest = ctx.compute_artifact_cid(path)?;

    Ok::<_, Error>(Json(digest))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateOrOpenReleaseBody {
    pub rid: identity::RepoId,
    pub oid: git::Oid,
    pub tag: Option<git::Oid>,
}

async fn create_or_open_release_handler(
    Ctx(ctx): Ctx,
    Json(CreateOrOpenReleaseBody { rid, oid, tag }): Json<CreateOrOpenReleaseBody>,
) -> impl IntoResponse {
    let id = ctx.create_or_open_release(rid, oid, tag)?;

    Ok::<_, Error>(Json(id))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterArtifactBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub name: String,
    pub size_bytes: u64,
}

async fn register_artifact_handler(
    Ctx(ctx): Ctx,
    Json(RegisterArtifactBody {
        rid,
        release_id,
        cid,
        name,
        size_bytes,
    }): Json<RegisterArtifactBody>,
) -> impl IntoResponse {
    ctx.register_artifact(rid, release_id, cid, name, size_bytes)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttestArtifactBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub path: std::path::PathBuf,
}

async fn attest_artifact_handler(
    Ctx(ctx): Ctx,
    Json(AttestArtifactBody {
        rid,
        release_id,
        cid,
        path,
    }): Json<AttestArtifactBody>,
) -> impl IntoResponse {
    ctx.attest_artifact(rid, release_id, cid, path)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetArtifactMetadataBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub key: String,
    pub value: serde_json::Value,
}

async fn set_artifact_metadata_handler(
    Ctx(ctx): Ctx,
    Json(SetArtifactMetadataBody {
        rid,
        release_id,
        cid,
        key,
        value,
    }): Json<SetArtifactMetadataBody>,
) -> impl IntoResponse {
    ctx.set_artifact_metadata(rid, release_id, cid, key, value)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveArtifactMetadataBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub key: String,
}

async fn remove_artifact_metadata_handler(
    Ctx(ctx): Ctx,
    Json(RemoveArtifactMetadataBody {
        rid,
        release_id,
        cid,
        key,
    }): Json<RemoveArtifactMetadataBody>,
) -> impl IntoResponse {
    ctx.remove_artifact_metadata(rid, release_id, cid, key)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactLocationBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub url: String,
}

async fn add_artifact_location_handler(
    Ctx(ctx): Ctx,
    Json(ArtifactLocationBody {
        rid,
        release_id,
        cid,
        url,
    }): Json<ArtifactLocationBody>,
) -> impl IntoResponse {
    ctx.add_location(rid, release_id, cid, url)?;

    Ok::<_, Error>(Json(()))
}

async fn remove_artifact_location_handler(
    Ctx(ctx): Ctx,
    Json(ArtifactLocationBody {
        rid,
        release_id,
        cid,
        url,
    }): Json<ArtifactLocationBody>,
) -> impl IntoResponse {
    ctx.remove_location(rid, release_id, cid, url)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RedactArtifactBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub reason: String,
}

async fn redact_artifact_handler(
    Ctx(ctx): Ctx,
    Json(RedactArtifactBody {
        rid,
        release_id,
        cid,
        reason,
    }): Json<RedactArtifactBody>,
) -> impl IntoResponse {
    ctx.redact_and_unseed_artifact(rid, release_id, cid, reason)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteReleaseBody {
    pub rid: identity::RepoId,
    pub release_id: String,
}

async fn delete_release_handler(
    Ctx(ctx): Ctx,
    Json(DeleteReleaseBody { rid, release_id }): Json<DeleteReleaseBody>,
) -> impl IntoResponse {
    ctx.delete_and_unseed_release(rid, release_id)?;

    Ok::<_, Error>(Json(()))
}

async fn artifact_node_running_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    Ok::<_, Error>(Json(ctx.artifact_node_running()))
}

async fn artifact_binaries_handler() -> impl IntoResponse {
    Ok::<_, Error>(Json(radicle_types::binaries::artifact_binaries()))
}

async fn artifact_node_status_handler(Ctx(ctx): Ctx) -> impl IntoResponse {
    let status = ctx.artifact_node_status()?;

    Ok::<_, Error>(Json(status))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeededArtifactsBody {
    pub rid: identity::RepoId,
    pub release_id: String,
}

async fn seeded_artifacts_handler(
    Ctx(ctx): Ctx,
    Json(SeededArtifactsBody { rid, release_id }): Json<SeededArtifactsBody>,
) -> impl IntoResponse {
    let seeded = ctx.seeded_artifacts(rid, release_id)?;

    Ok::<_, Error>(Json(seeded))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedArtifactBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub source_path: std::path::PathBuf,
}

async fn seed_artifact_handler(
    Ctx(ctx): Ctx,
    Json(SeedArtifactBody {
        rid,
        release_id,
        cid,
        source_path,
    }): Json<SeedArtifactBody>,
) -> impl IntoResponse {
    let url = ctx.seed_artifact(rid, release_id, cid, source_path)?;

    Ok::<_, Error>(Json(url))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnseedArtifactBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
}

async fn unseed_artifact_handler(
    Ctx(ctx): Ctx,
    Json(UnseedArtifactBody {
        rid,
        release_id,
        cid,
    }): Json<UnseedArtifactBody>,
) -> impl IntoResponse {
    ctx.unseed_artifact(rid, release_id, cid)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadArtifactBody {
    pub rid: identity::RepoId,
    pub release_id: String,
    pub cid: String,
    pub save_as: Option<String>,
    pub seed: bool,
}

/// Mirrors the Tauri command minus its progress events, which have no HTTP
/// equivalent; the call simply returns once the download finishes. There is
/// no native save dialog on this driver, so a saved artifact lands in the OS
/// temp directory under its name, as with `save_embed_to_disk`.
async fn download_artifact_handler(
    Ctx(ctx): Ctx,
    Json(DownloadArtifactBody {
        rid,
        release_id,
        cid,
        save_as,
        seed,
    }): Json<DownloadArtifactBody>,
) -> impl IntoResponse {
    let dest = save_as.as_deref().map(temp_file_path).transpose()?;
    ctx.download_artifact(rid, release_id, cid, dest.as_deref(), seed, |_| {})?;

    Ok::<_, Error>(Json(true))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchesBody {
    pub rid: identity::RepoId,
    pub skip: Option<usize>,
    pub take: Option<usize>,
    pub status: Option<types::cobs::query::PatchStatus>,
}

async fn patches_handler(
    Ctx(ctx): Ctx,
    Json(PatchesBody {
        rid,
        skip,
        take,
        status,
    }): Json<PatchesBody>,
) -> impl IntoResponse {
    let aliases = ctx.profile.aliases();
    let doc = ctx.profile.storage.repository(rid)?.identity_doc()?;
    let page = ctx
        .patches
        .list_paginated(rid, status, skip, take, &doc, &aliases)?;

    Ok::<_, Error>(Json(page))
}

#[derive(Serialize, Deserialize)]
struct PatchBody {
    pub rid: identity::RepoId,
    pub id: git::Oid,
}

async fn patch_handler(
    Ctx(ctx): Ctx,
    Json(PatchBody { rid, id }): Json<PatchBody>,
) -> impl IntoResponse {
    let patch = ctx.get_patch(rid, id)?;

    Ok::<_, Error>(Json(patch))
}

async fn revision_handler(
    Ctx(ctx): Ctx,
    Json(PatchBody { rid, id }): Json<PatchBody>,
) -> impl IntoResponse {
    let revisions = ctx.revisions_by_patch(rid, id)?;

    Ok::<_, Error>(Json(revisions))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditPatchBody {
    pub rid: identity::RepoId,
    pub cob_id: git::Oid,
    pub action: models::patch::Action,
    pub opts: CobOptions,
}

async fn edit_patch_handler(
    Ctx(ctx): Ctx,
    Json(EditPatchBody {
        rid,
        cob_id,
        action,
        opts,
    }): Json<EditPatchBody>,
) -> impl IntoResponse {
    let patch = ctx.edit_patch(rid, cob_id, action, opts)?;

    Ok::<_, Error>(Json(patch))
}

// Deserialize only: `CreateReviewArgs` is an inbound type and isn't Serialize.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePatchReviewBody {
    pub args: models::patch::CreateReviewArgs,
}

async fn create_patch_review_handler(
    Ctx(ctx): Ctx,
    Json(CreatePatchReviewBody { args }): Json<CreatePatchReviewBody>,
) -> impl IntoResponse {
    let review_id = ctx.create_patch_review(args)?;

    Ok::<_, Error>(Json(review_id))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteIssueBody {
    pub rid: identity::RepoId,
    pub cob_id: git::Oid,
    pub opts: CobOptions,
}

async fn delete_issue_handler(
    Ctx(ctx): Ctx,
    Json(DeleteIssueBody { rid, cob_id, opts }): Json<DeleteIssueBody>,
) -> impl IntoResponse {
    ctx.delete_issue(rid, cob_id, opts)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeletePatchBody {
    pub rid: identity::RepoId,
    pub cob_id: git::Oid,
    pub opts: CobOptions,
}

async fn delete_patch_handler(
    Ctx(ctx): Ctx,
    Json(DeletePatchBody { rid, cob_id, opts }): Json<DeletePatchBody>,
) -> impl IntoResponse {
    ctx.delete_patch(rid, cob_id, opts)?;

    Ok::<_, Error>(Json(()))
}

#[derive(Serialize, Deserialize)]
struct JobsBody {
    pub rid: identity::RepoId,
    pub sha: git::Oid,
}

async fn jobs_handler(
    Ctx(ctx): Ctx,
    Json(JobsBody { rid, sha }): Json<JobsBody>,
) -> impl IntoResponse {
    let jobs = ctx.list_jobs(rid, sha)?;

    Ok::<_, Error>(Json(jobs))
}
