mod job;
#[cfg(feature = "artifacts")]
mod releases;

use std::collections::{BTreeMap, HashMap};

use axum::extract::{DefaultBodyLimit, State};
use axum::http::header;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use hyper::StatusCode;
use radicle_surf::blob::BlobRef;
use radicle_surf::{diff, Glob, Oid, Repository};
use serde::{Deserialize, Serialize};
use serde_json::json;

use radicle::cob::{issue::cache::Issues as _, patch::cache::Patches as _};
use radicle::git::fmt::{Qualified, RefString};
use radicle::node::{Alias, AliasStore, NodeId};
use radicle::storage::{ReadRepository, RemoteRepository};

use crate::api;
use crate::api::error::Error;
use crate::api::query::{CobsQuery, PaginationQuery, RepoQuery, MAX_PER_PAGE, MAX_QUERY_LEN};
use crate::api::search::SearchQueryString;
use crate::api::Context;
use crate::api::PeelToCommit;
use crate::axum_extra::{cached_response, immutable_response, Path, Query};

const MAX_BODY_LIMIT: usize = 4_194_304;

pub fn router(ctx: Context) -> Router {
    let router = Router::new()
        .route("/repos", get(repo_root_handler))
        .route("/repos/search", get(repo_search_handler))
        .route("/repos/{rid}", get(repo_handler))
        .route("/repos/{rid}/commits", get(history_handler))
        .route("/repos/{rid}/commits/{sha}", get(commit_handler))
        .route("/repos/{rid}/diff/{base}/{oid}", get(diff_handler))
        .route(
            "/repos/{rid}/diff/{base}/{oid}/stats",
            get(diff_stats_handler),
        )
        .route("/repos/{rid}/activity", get(activity_handler))
        .route("/repos/{rid}/tree/{sha}/", get(tree_handler_root))
        .route("/repos/{rid}/tree/{sha}/{*path}", get(tree_handler))
        .route("/repos/{rid}/stats/tree/{sha}", get(stats_tree_handler))
        .route(
            "/repos/{rid}/stats/commits/{sha}",
            get(stats_commits_handler),
        )
        .route("/repos/{rid}/remotes", get(remotes_handler))
        .route("/repos/{rid}/remotes/{peer}", get(remote_handler))
        .route("/repos/{rid}/blob/{sha}/{*path}", get(blob_handler))
        .route("/repos/{rid}/readme/{sha}", get(readme_handler))
        .route("/repos/{rid}/jobs/{sha}", get(job::handler))
        .route("/repos/{rid}/issues", get(issues_handler))
        .route("/repos/{rid}/issues/{id}", get(issue_handler))
        .route("/repos/{rid}/patches", get(patches_handler))
        .route("/repos/{rid}/patches/{id}", get(patch_handler));

    #[cfg(feature = "artifacts")]
    let router = router
        .route("/repos/{rid}/releases", get(releases::list_handler))
        .route("/repos/{rid}/releases/{id}", get(releases::get_handler));

    router
        .with_state(ctx)
        .layer(DefaultBodyLimit::max(MAX_BODY_LIMIT))
}

/// Storage-walk implementations for repo listing and search. Used directly
/// when no search backend is configured, and as a fallback for sort modes
/// the index doesn't serve (pinned, rid) or when a configured backend is
/// unreachable.
mod storage {
    use std::collections::BTreeSet;

    use radicle::node::routing::Store as _;
    use radicle::storage::{ReadRepository, ReadStorage};
    use radicle_surf::Repository;

    use crate::api;
    use crate::api::error::Error;
    use crate::api::query::{RepoQuery, RepoSort};
    use crate::api::search::SearchResult;
    use crate::api::Context;
    use crate::axum_extra::cached_response;

    /// Repo listing via storage walk. Activity/seeding sorts are collapsed
    /// to rid sort — walking storage for every repo per request is too
    /// expensive without a pre-computed index.
    #[allow(clippy::result_large_err)]
    pub fn list_repos(
        ctx: &Context,
        show: RepoQuery,
        sort: RepoSort,
        page: usize,
        per_page: usize,
        web_config: &radicle::web::Config,
    ) -> Result<Vec<api::repo::Info>, Error> {
        let sort = if matches!(show, RepoQuery::All)
            && matches!(sort, RepoSort::Activity | RepoSort::Seeding)
        {
            RepoSort::Rid
        } else {
            sort
        };

        let storage = &ctx.profile.storage;
        let pinned = &web_config.pinned;
        let policies = ctx.profile.policies()?;

        let repos = match show {
            RepoQuery::All => storage
                .repositories()?
                .into_iter()
                .filter(|repo| repo.doc.visibility().is_public())
                .collect::<Vec<_>>(),
            RepoQuery::Pinned => storage
                .repositories_by_id(pinned.repositories.iter())
                .filter_map(|result| match result {
                    Ok(repo) => Some(repo),
                    Err(e) => {
                        tracing::warn!("Failed to load pinned repository: {}", e);
                        None
                    }
                })
                .filter(|repo| repo.doc.visibility().is_public())
                .collect::<Vec<_>>(),
        };

        let infos = match sort {
            RepoSort::Rid => {
                let mut repos = repos;
                repos.sort_by_key(|p| p.rid);
                repos
                    .into_iter()
                    .filter_map(|info| {
                        if !policies.is_seeding(&info.rid).unwrap_or_default() {
                            return None;
                        }
                        let (repo, doc) = ctx.repo(info.rid).ok()?;
                        ctx.repo_info(&repo, doc).ok()
                    })
                    .skip(page * per_page)
                    .take(per_page)
                    .collect::<Vec<_>>()
            }
            RepoSort::Activity => {
                let mut with_time: Vec<(radicle::identity::RepoId, i64)> = repos
                    .into_iter()
                    .filter_map(|info| {
                        if !policies.is_seeding(&info.rid).unwrap_or_default() {
                            return None;
                        }
                        let (repo, _doc) = ctx.repo(info.rid).ok()?;
                        let surf = Repository::open(repo.path()).ok()?;
                        let head = surf.head().ok()?;
                        let commit = surf.commit(head).ok()?;
                        Some((info.rid, commit.committer.time.seconds()))
                    })
                    .collect();
                with_time.sort_by_key(|x| std::cmp::Reverse(x.1));
                with_time
                    .into_iter()
                    .skip(page * per_page)
                    .take(per_page)
                    .filter_map(|(rid, _)| {
                        let (repo, doc) = ctx.repo(rid).ok()?;
                        ctx.repo_info(&repo, doc).ok()
                    })
                    .collect::<Vec<_>>()
            }
            RepoSort::Seeding => {
                let db = ctx.profile.database()?;
                let mut with_count: Vec<(radicle::identity::RepoId, usize)> = repos
                    .into_iter()
                    .filter_map(|info| {
                        if !policies.is_seeding(&info.rid).unwrap_or_default() {
                            return None;
                        }
                        let count = db.count(&info.rid).unwrap_or_default();
                        Some((info.rid, count))
                    })
                    .collect();
                with_count.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
                with_count
                    .into_iter()
                    .skip(page * per_page)
                    .take(per_page)
                    .filter_map(|(rid, _)| {
                        let (repo, doc) = ctx.repo(rid).ok()?;
                        ctx.repo_info(&repo, doc).ok()
                    })
                    .collect::<Vec<_>>()
            }
        };

        Ok(infos)
    }

    /// Substring search via storage walk. Matches are sorted by position
    /// of the first match in the name (prefix matches first), with seeding
    /// count as tie-breaker. Results are cached for 10 minutes.
    #[allow(clippy::result_large_err)]
    pub async fn search_repos(
        ctx: &Context,
        q: &str,
        page: usize,
        per_page: usize,
    ) -> Result<axum::response::Response, Error> {
        use axum::response::IntoResponse;

        let ctx = ctx.clone();
        let q = q.to_owned();
        let found_repos = crate::api::blocking(move || {
            let storage = &ctx.profile.storage;
            let aliases = &ctx.profile.aliases();
            let db = &ctx.profile.database()?;
            let found_repos = storage
                .repositories()?
                .into_iter()
                .filter_map(|info| SearchResult::new(&q, info, db, aliases))
                .collect::<BTreeSet<SearchResult>>();

            Ok::<_, Error>(
                found_repos
                    .into_iter()
                    .skip(page * per_page)
                    .take(per_page)
                    .collect::<Vec<_>>(),
            )
        })
        .await?;

        Ok(cached_response(found_repos, 600).into_response())
    }
}

/// Repo listing and search dispatch. When a search backend is configured
/// (`ctx.search()` is `Some`), activity/seeding sorts and `/repos/search` are
/// served from the Meilisearch index, transparently falling back to the
/// storage walk on any backend failure. Without a backend, or for sort modes
/// the index doesn't serve (pinned, rid), everything uses the storage walk.
mod listing {
    use axum::response::IntoResponse;
    use axum::Json;
    use radicle::node::routing::Store as _;
    use radicle::node::AliasStore;
    use radicle_search::query::{SearchClient, SortField};
    use serde_json::json;

    use crate::api;
    use crate::api::error::Error;
    use crate::api::query::{RepoQuery, RepoSort};
    use crate::api::search::SearchResult;
    use crate::api::Context;

    #[allow(clippy::result_large_err)]
    pub async fn list_repos(
        ctx: &Context,
        show: RepoQuery,
        sort: RepoSort,
        page: usize,
        per_page: usize,
        web_config: &radicle::web::Config,
    ) -> Result<Vec<api::repo::Info>, Error> {
        let search_sort = match (&show, sort) {
            (RepoQuery::All, RepoSort::Activity) => Some(SortField::HeadCommitterTime),
            (RepoQuery::All, RepoSort::Seeding) => Some(SortField::SeedingCount),
            _ => None,
        };
        if let (Some(field), Some(client)) = (search_sort, ctx.search()) {
            match sorted_repos(ctx, client, field, page, per_page).await {
                Ok(infos) => return Ok(infos),
                Err(e) => {
                    tracing::warn!("search backend failed, falling back to storage walk ({e:#})")
                }
            }
        }
        let ctx = ctx.clone();
        let web_config = web_config.clone();
        crate::api::blocking(move || {
            super::storage::list_repos(&ctx, show, sort, page, per_page, &web_config)
        })
        .await
    }

    #[allow(clippy::result_large_err)]
    pub async fn search_repos(
        ctx: &Context,
        q: &str,
        page: usize,
        per_page: usize,
    ) -> Result<axum::response::Response, Error> {
        if let Some(client) = ctx.search() {
            match search_by_query(ctx, client, q, page, per_page).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    tracing::warn!("search backend failed, falling back to storage walk ({e:#})")
                }
            }
        }
        super::storage::search_repos(ctx, q, page, per_page).await
    }

    /// Full-text search via Meilisearch. Typo-tolerant prefix matching with
    /// seedingCount tie-breaking. Returns `Err` on any backend failure so the
    /// caller falls back to the storage walk.
    async fn search_by_query(
        ctx: &Context,
        client: &SearchClient,
        q: &str,
        page: usize,
        per_page: usize,
    ) -> anyhow::Result<axum::response::Response> {
        let rids = client.search_by_query(q, page * per_page, per_page).await?;
        let aliases = ctx.profile.aliases();
        let db = ctx.profile.database()?;
        let found_repos: Vec<SearchResult> = rids
            .into_iter()
            .enumerate()
            .filter_map(|(i, rid)| {
                let (_repo, doc_at) = ctx.repo(rid).ok()?;
                let seeds = db.count(&rid).unwrap_or_default();
                let delegates = doc_at
                    .doc
                    .delegates()
                    .iter()
                    .map(|did| match aliases.alias(did) {
                        Some(alias) => json!({ "id": did, "alias": alias }),
                        None => json!({ "id": did }),
                    })
                    .collect();
                Some(SearchResult {
                    rid,
                    payloads: doc_at.doc.payload().clone(),
                    delegates,
                    seeds,
                    index: i,
                })
            })
            .collect();
        Ok(Json(found_repos).into_response())
    }

    /// Sorted repo listing (activity/seeding) via the index. Returns `Err` on
    /// backend failure so the caller falls back to the storage walk.
    async fn sorted_repos(
        ctx: &Context,
        client: &SearchClient,
        field: SortField,
        page: usize,
        per_page: usize,
    ) -> anyhow::Result<Vec<api::repo::Info>> {
        let policies = ctx.profile.policies()?;
        let offset = page.saturating_mul(per_page);
        let rids = client.sorted_rids(field, offset, per_page).await?;
        Ok(rids
            .into_iter()
            .filter_map(|rid| {
                if !policies.is_seeding(&rid).unwrap_or_default() {
                    return None;
                }
                let (repo, doc) = ctx.repo(rid).ok()?;
                ctx.repo_info(&repo, doc).ok()
            })
            .collect())
    }
}

/// List all repos.
/// `GET /repos`
async fn repo_root_handler(
    State(ctx): State<Context>,
    Query(qs): Query<PaginationQuery>,
) -> impl IntoResponse {
    let PaginationQuery {
        show,
        sort,
        page,
        per_page,
    } = qs;
    let page = page.unwrap_or(0);
    let sort = sort.unwrap_or_default();
    let web_config = ctx.web_config().read().await;
    let per_page = match per_page {
        Some(n) => n.min(MAX_PER_PAGE),
        None => match show {
            RepoQuery::Pinned => web_config.pinned.repositories.len(),
            _ => 10,
        },
    };

    let infos = listing::list_repos(&ctx, show, sort, page, per_page, &web_config).await?;
    Ok::<_, Error>(Json(infos))
}

/// Search repositories by name.
/// `GET /repos/search?q=<query>`
async fn repo_search_handler(
    State(ctx): State<Context>,
    Query(SearchQueryString { q, per_page, page }): Query<SearchQueryString>,
) -> impl IntoResponse {
    let q: String = q.unwrap_or_default().chars().take(MAX_QUERY_LEN).collect();
    let page = page.unwrap_or(0);
    let per_page = per_page.unwrap_or(10).min(MAX_PER_PAGE);

    listing::search_repos(&ctx, &q, page, per_page).await
}

/// Get repo metadata.
/// `GET /repos/:rid`
async fn repo_handler(State(ctx): State<Context>, Path(rid): Path<String>) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let info = api::blocking(move || {
        let (repo, doc) = ctx.repo(rid)?;
        ctx.repo_info(&repo, doc)
    })
    .await?;

    Ok::<_, Error>(Json(info))
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitsQueryString {
    pub parent: Option<String>,
    pub since: Option<i64>,
    pub until: Option<i64>,
    pub page: Option<usize>,
    pub per_page: Option<usize>,
}

/// Get repo commit range.
/// `GET /repos/:rid/commits?parent=<sha>`
async fn history_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
    Query(qs): Query<CommitsQueryString>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let CommitsQueryString {
        since,
        until,
        parent,
        page,
        per_page,
    } = qs;

    // If the parent commit is provided, the response depends only on the query
    // string and not on the state of the repository. This means we can instruct
    // the caches to treat the response as immutable.
    let is_immutable = parent.is_some();

    let commits = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let (_, head) = repo.head()?;
        let sha = match parent {
            Some(commit) => commit,
            None => head.to_string(),
        };
        let repo = Repository::open(repo.path())?;

        // If a pagination is defined, we do not want to paginate the commits, and we return all of them on the first page.
        let page = page.unwrap_or(0);
        let per_page = if per_page.is_none() && (since.is_some() || until.is_some()) {
            usize::MAX
        } else {
            per_page.unwrap_or(30)
        };

        let commits = repo
            .history(&sha)?
            .filter_map(|commit| {
                let commit = commit.ok()?;
                let time = commit.committer.time.seconds();
                let commit = api::json::commit::Commit::new(&commit).as_json();
                match (since, until) {
                    (Some(since), Some(until)) if time >= since && time < until => Some(commit),
                    (Some(since), None) if time >= since => Some(commit),
                    (None, Some(until)) if time < until => Some(commit),
                    (None, None) => Some(commit),
                    _ => None,
                }
            })
            .skip(page * per_page)
            .take(per_page)
            .collect::<Vec<_>>();
        Ok::<_, Error>(commits)
    })
    .await?;

    if is_immutable {
        Ok::<_, Error>(immutable_response(commits).into_response())
    } else {
        Ok::<_, Error>(Json(commits).into_response())
    }
}

/// Get repo commit.
/// `GET /repos/:rid/commits/:sha`
async fn commit_handler(
    State(ctx): State<Context>,
    Path((rid, sha)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let response = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let repo = Repository::open(repo.path())?;
        let commit = repo.commit(sha)?;

        let diff = repo.diff_commit(commit.id)?;
        let glob = Glob::all_heads().branches().and(Glob::all_remotes());
        let branches: Vec<String> = repo
            .revision_branches(commit.id, glob)?
            .iter()
            .map(|b| b.refname().to_string())
            .collect();

        let mut files: HashMap<Oid, BlobRef<'_>> = HashMap::new();
        diff.files().for_each(|file_diff| match file_diff {
            diff::FileDiff::Added(added) => {
                if let Ok(blob) = repo.blob_ref(added.new.oid) {
                    files.insert(blob.id(), blob);
                }
            }
            diff::FileDiff::Deleted(deleted) => {
                if let Ok(old_blob) = repo.blob_ref(deleted.old.oid) {
                    files.insert(old_blob.id(), old_blob);
                }
            }
            diff::FileDiff::Modified(modified) => {
                if let (Ok(old_blob), Ok(new_blob)) = (
                    repo.blob_ref(modified.old.oid),
                    repo.blob_ref(modified.new.oid),
                ) {
                    files.insert(old_blob.id(), old_blob);
                    files.insert(new_blob.id(), new_blob);
                }
            }
            diff::FileDiff::Moved(moved) => {
                if let (Ok(old_blob), Ok(new_blob)) =
                    (repo.blob_ref(moved.old.oid), repo.blob_ref(moved.new.oid))
                {
                    files.insert(old_blob.id(), old_blob);
                    files.insert(new_blob.id(), new_blob);
                }
            }
            diff::FileDiff::Copied(copied) => {
                if let (Ok(old_blob), Ok(new_blob)) =
                    (repo.blob_ref(copied.old.oid), repo.blob_ref(copied.new.oid))
                {
                    files.insert(old_blob.id(), old_blob);
                    files.insert(new_blob.id(), new_blob);
                }
            }
        });

        Ok::<_, Error>(json!({
          "commit": api::json::commit::Commit::new(&commit).as_json(),
          "diff": api::json::diff::Diff::new(&diff).as_json(),
          "files": files,
          "branches": branches
        }))
    })
    .await?;
    Ok::<_, Error>(immutable_response(response))
}

/// Get diff between two commits
/// `GET /repos/:rid/diff/:base/:oid`
async fn diff_handler(
    State(ctx): State<Context>,
    Path((rid, base, oid)): Path<(String, Oid, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let response = api::blocking(move || {
        let (storage, _) = ctx.repo(rid)?;
        let repo = Repository::open(storage.path())?;
        let base = repo.commit(base)?;
        let commit = repo.commit(oid)?;
        let diff = repo.diff(base.id, commit.id)?;
        let mut files: HashMap<Oid, BlobRef<'_>> = HashMap::new();
        diff.files().for_each(|file_diff| match file_diff {
            diff::FileDiff::Added(added) => {
                if let Ok(new_blob) = repo.blob_ref(added.new.oid) {
                    files.insert(new_blob.id(), new_blob);
                }
            }
            diff::FileDiff::Deleted(deleted) => {
                if let Ok(old_blob) = repo.blob_ref(deleted.old.oid) {
                    files.insert(old_blob.id(), old_blob);
                }
            }
            diff::FileDiff::Modified(modified) => {
                if let (Ok(new_blob), Ok(old_blob)) = (
                    repo.blob_ref(modified.old.oid),
                    repo.blob_ref(modified.new.oid),
                ) {
                    files.insert(new_blob.id(), new_blob);
                    files.insert(old_blob.id(), old_blob);
                }
            }
            diff::FileDiff::Moved(moved) => {
                if let (Ok(new_blob), Ok(old_blob)) =
                    (repo.blob_ref(moved.new.oid), repo.blob_ref(moved.old.oid))
                {
                    files.insert(new_blob.id(), new_blob);
                    files.insert(old_blob.id(), old_blob);
                }
            }
            diff::FileDiff::Copied(copied) => {
                if let (Ok(new_blob), Ok(old_blob)) =
                    (repo.blob_ref(copied.new.oid), repo.blob_ref(copied.old.oid))
                {
                    files.insert(new_blob.id(), new_blob);
                    files.insert(old_blob.id(), old_blob);
                }
            }
        });

        // Hide `base` from the walk rather than stopping at the first commit
        // that equals it. A merge commit reaches `base` through one of its
        // parents, so truncating there drops every commit the other parent
        // contributes, and a revision whose head merges the target branch in
        // looks like a single-commit revision.
        let raw = radicle::git::raw::Repository::open(storage.path())?;
        let mut walk = raw.revwalk()?;
        walk.push(commit.id.into())?;
        walk.hide(base.id.into())?;

        let commits = walk
            .filter_map(|oid| oid.ok())
            .filter_map(|oid| repo.commit(Oid::from(oid)).ok())
            .map(|c| api::json::commit::Commit::new(&c).as_json())
            .collect::<Vec<_>>();

        Ok::<_, Error>(json!({ "diff": diff, "files": files, "commits": commits }))
    })
    .await?;

    Ok::<_, Error>(immutable_response(response))
}

/// Get diff stats between two commits.
/// `GET /repos/:rid/diff/:base/:oid/stats`
async fn diff_stats_handler(
    State(ctx): State<Context>,
    Path((rid, base, oid)): Path<(String, Oid, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let stats = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        diff_stats(&repo, base, oid)
    })
    .await?;

    Ok::<_, Error>(immutable_response(stats))
}

/// Compute the diff stats between `base` and `head`.
///
/// Fast path: `git diff --numstat` tallies per-file line counts without
/// generating hunks or loading blobs, unlike the full `radicle_surf` diff.
/// Falls back to the surf diff if the git binary is unavailable or errors.
fn diff_stats(
    repo: &radicle::storage::git::Repository,
    base: Oid,
    head: Oid,
) -> Result<serde_json::Value, Error> {
    if let Some((files_changed, insertions, deletions)) = numstat(repo.backend.path(), base, head) {
        return Ok(json!({
            "filesChanged": files_changed,
            "insertions": insertions,
            "deletions": deletions,
        }));
    }

    // Fallback when git is unavailable. numstat and surf can report slightly
    // different counts on renamed/copied files, so this may differ from the
    // fast path above and the full /diff.
    let surf_repo = Repository::open(repo.path())?;
    let stats = surf_repo.diff(base, head)?;
    let stats = stats.stats();
    Ok(json!({
        "filesChanged": stats.files_changed,
        "insertions": stats.insertions,
        "deletions": stats.deletions,
    }))
}

/// Tally `git diff --numstat` between two commits into `(files, insertions,
/// deletions)`. Returns `None` if git is unavailable or its output can't be
/// parsed, so the caller can fall back to the surf diff.
/// Run `git` in `repo_dir` with `args` and return its stdout on success, or
/// `None` if the binary is unavailable or it exits non-zero.
///
/// User and system git config are pinned to `/dev/null` so output stays
/// deterministic and independent of the machine's configuration (e.g.
/// `diff.renames`, `diff.algorithm`).
fn git_output(repo_dir: &std::path::Path, args: &[&str]) -> Option<Vec<u8>> {
    std::process::Command::new("git")
        .current_dir(repo_dir)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| output.stdout)
}

fn numstat(repo_dir: &std::path::Path, base: Oid, head: Oid) -> Option<(usize, usize, usize)> {
    let (base, head) = (base.to_string(), head.to_string());
    let stdout = git_output(
        repo_dir,
        &["diff", "--numstat", base.as_str(), head.as_str()],
    )?;

    let mut files_changed = 0;
    let mut insertions = 0;
    let mut deletions = 0;
    for line in String::from_utf8_lossy(&stdout).lines() {
        // Each line is "<added>\t<deleted>\t<path>"; binary files report "-".
        let mut cols = line.split('\t');
        let added = cols.next()?;
        let deleted = cols.next()?;
        if cols.next().is_none() {
            continue;
        }
        files_changed += 1;
        insertions += added.parse::<usize>().unwrap_or(0);
        deletions += deleted.parse::<usize>().unwrap_or(0);
    }
    Some((files_changed, insertions, deletions))
}

/// Get repo activity for the past year.
/// `GET /repos/:rid/activity`
async fn activity_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let timestamps = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let current_date = chrono::Utc::now().timestamp();
        // SAFETY: The number of weeks is static and not out of bounds.
        #[allow(clippy::unwrap_used)]
        let one_year_ago = chrono::Duration::try_weeks(52).unwrap();
        let repo = Repository::open(repo.path())?;
        let head = repo.head()?;
        let timestamps = repo
            .history(head)?
            .filter_map(|a| {
                if let Ok(a) = a {
                    let seconds = a.committer.time.seconds();
                    if seconds > current_date - one_year_ago.num_seconds() {
                        return Some(seconds);
                    }
                }
                None
            })
            .collect::<Vec<i64>>();
        Ok::<_, Error>(timestamps)
    })
    .await?;

    Ok::<_, Error>(cached_response(json!({ "activity": timestamps }), 3600))
}

/// Get repo source tree for '/' path.
/// `GET /repos/:rid/tree/:sha/`
async fn tree_handler_root(
    State(ctx): State<Context>,
    Path((rid, sha)): Path<(String, Oid)>,
) -> impl IntoResponse {
    tree_handler(State(ctx), Path((rid, sha, String::new()))).await
}

/// Get repo source tree.
/// `GET /repos/:rid/tree/:sha/*path`
async fn tree_handler(
    State(ctx): State<Context>,
    Path((rid, sha, path)): Path<(String, Oid, String)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    if let Some(ref cache) = ctx.cache {
        let hit = {
            let mut cache = cache.tree.lock().await;
            cache.get(&(rid, sha, path.clone())).cloned()
        };
        if let Some(response) = hit {
            // Enforce repository visibility even on cache hits.
            let ctx = ctx.clone();
            api::blocking(move || ctx.repo(rid).map(|_| ())).await?;
            return Ok::<_, Error>(immutable_response(response));
        }
    }

    let response = {
        let ctx = ctx.clone();
        let path = path.clone();
        api::blocking(move || {
            let (repo, _) = ctx.repo(rid)?;
            let repo = Repository::open(repo.path())?;
            let tree = repo.tree(sha, &path)?;
            Ok::<_, Error>(api::json::commit::Tree::new(&tree).as_json(&path))
        })
        .await?
    };

    if let Some(cache) = &ctx.cache {
        let cache = &mut cache.tree.lock().await;
        cache.put((rid, sha, path.clone()), response.clone());
    }

    Ok::<_, Error>(immutable_response(response))
}

/// Get repo source tree stats.
/// `GET /repos/:rid/stats/tree/:sha`
async fn stats_tree_handler(
    State(ctx): State<Context>,
    Path((rid, sha)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let stats = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let repo = Repository::open(repo.path())?;
        Ok::<_, Error>(repo.stats_from(&sha)?)
    })
    .await?;

    Ok::<_, Error>(immutable_response(stats))
}

/// Get the number of commits reachable from a commit.
/// `GET /repos/:rid/stats/commits/:sha`
async fn stats_commits_handler(
    State(ctx): State<Context>,
    Path((rid, sha)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let commits = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        commit_count(&repo, sha)
    })
    .await?;

    Ok::<_, Error>(immutable_response(json!({ "commits": commits })))
}

/// Count commits reachable from `head`.
///
/// Fast path: `git rev-list --count --use-bitmap-index` uses the pack bitmap /
/// commit-graph for a near-instant count, whereas a libgit2 revwalk ignores
/// those indexes and walks every commit (seconds on large histories). Falls
/// back to the walk if the git binary is unavailable or errors.
fn commit_count(repo: &radicle::storage::git::Repository, head: Oid) -> Result<usize, Error> {
    let head_arg = head.to_string();
    let count = git_output(
        repo.backend.path(),
        &[
            "rev-list",
            "--count",
            "--use-bitmap-index",
            head_arg.as_str(),
        ],
    )
    .and_then(|stdout| {
        String::from_utf8_lossy(&stdout)
            .trim()
            .parse::<usize>()
            .ok()
    });
    if let Some(count) = count {
        return Ok(count);
    }

    let mut revwalk = repo.backend.revwalk()?;
    revwalk.push(head.into())?;

    Ok(revwalk.count())
}

/// Get all repo remotes.
/// `GET /repos/:rid/remotes`
async fn remotes_handler(State(ctx): State<Context>, Path(rid): Path<String>) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let remotes = api::blocking(move || {
        let (repo, doc) = ctx.repo(rid)?;
        let delegates = doc.delegates();
        let aliases = &ctx.profile.aliases();

        let remotes = repo
            .remotes()?
            .filter_map(|r| r.map(|r| r.1).ok())
            .map(|remote| remote_info(&repo, &remote, delegates, aliases))
            .collect::<Vec<_>>();
        Ok::<_, Error>(remotes)
    })
    .await?;

    Ok::<_, Error>(Json(remotes))
}

/// Get repo remote.
/// `GET /repos/:rid/remotes/:peer`
async fn remote_handler(
    State(ctx): State<Context>,
    Path((rid, node_id)): Path<(String, NodeId)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let info = api::blocking(move || {
        let (repo, doc) = ctx.repo(rid)?;
        let delegates = doc.delegates();
        let aliases = &ctx.profile.aliases();
        let remote = repo.remote(&node_id)?;

        Ok::<_, Error>(remote_info(&repo, &remote, delegates, aliases))
    })
    .await?;

    Ok::<_, Error>(Json(info))
}

/// Information tracked per remote peer in Radicle storage.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteInfo {
    /// The [`NodeId`] associated with the remote.
    id: NodeId,
    /// The [`Alias`] of the remote, if it can be found.
    #[serde(skip_serializing_if = "Option::is_none")]
    alias: Option<Alias>,
    /// Any references under the remote's namespace that begin with
    /// `refs/heads`, returning the suffix after `refs/heads`.
    heads: BTreeMap<RefString, radicle::git::Oid>,
    /// All references under the remote's namespace.
    refs: BTreeMap<Qualified<'static>, radicle::git::Oid>,
    /// Whether the remote is a delegate of the repository.
    delegate: bool,
}

impl RemoteInfo {
    pub fn new(id: NodeId) -> Self {
        Self {
            id,
            alias: None,
            heads: BTreeMap::new(),
            refs: BTreeMap::new(),
            delegate: false,
        }
    }

    pub fn with_alias(mut self, alias: Option<Alias>) -> Self {
        self.alias = alias;
        self
    }

    pub fn with_heads(mut self, heads: BTreeMap<RefString, radicle::git::Oid>) -> Self {
        self.heads = heads;
        self
    }

    pub fn with_refs(mut self, refs: BTreeMap<Qualified<'static>, radicle::git::Oid>) -> Self {
        self.refs = refs;
        self
    }

    pub fn set_delegate(mut self, delegate: bool) -> Self {
        self.delegate = delegate;
        self
    }
}

/// Partition [`Refs`] into their `refs/heads` and all sets of references.
///
/// References are skipped if they:
/// - Are not [`Qualified`],
/// - Cannot be peeled to a commit,
/// - Are not under `refs/heads` or `refs/tags`.
///
/// [`Refs`]: radicle::storage::refs::Refs
fn partition_refs<R>(
    refs: &radicle::storage::refs::Refs,
    repository: &R,
) -> (
    BTreeMap<RefString, radicle::git::Oid>,
    BTreeMap<Qualified<'static>, radicle::git::Oid>,
)
where
    R: PeelToCommit,
{
    refs.iter()
        .filter_map(|(refname, oid)| {
            let oid = match repository.peel_to_commit(*oid) {
                Ok(oid) => Some(oid),
                Err(e) => {
                    tracing::warn!("skipping {refname}: {e}");
                    None
                }
            };
            match refname.qualified() {
                Some(refname) => Some(refname).zip(oid),
                None => {
                    tracing::debug!("skipping '{refname}' since it is not qualified");
                    None
                }
            }
        })
        .fold(
            (BTreeMap::new(), BTreeMap::new()),
            |(mut heads, mut refs), (qualified, oid)| {
                let (_refs, category, first, rest) = qualified.non_empty_components();
                match category.as_str() {
                    "heads" => {
                        let name = std::iter::once(first).chain(rest).collect::<RefString>();
                        heads.insert(name, oid);
                        refs.insert(qualified.to_owned(), oid);
                    }
                    "tags" => {
                        refs.insert(qualified.to_owned(), oid);
                    }
                    _ => {}
                }
                (heads, refs)
            },
        )
}

#[tracing::instrument(skip_all, fields(remote.id = %remote.id()))]
fn remote_info(
    repo: &radicle::storage::git::Repository,
    remote: &radicle::storage::Remote,
    delegates: &radicle::identity::doc::Delegates,
    aliases: &radicle::profile::Aliases,
) -> RemoteInfo {
    let (heads, refs) = partition_refs(&remote.refs, repo);
    let id = remote.id();
    RemoteInfo::new(id)
        .with_heads(heads)
        .with_refs(refs)
        .with_alias(aliases.alias(&id))
        .set_delegate(delegates.contains(&id.into()))
}

/// A serialized blob response, or a marker that the blob exceeds the size limit.
enum BlobOutcome {
    Json(serde_json::Value),
    TooLarge,
}

/// A blob read from the repository, or a marker that it exceeds the size limit.
enum BlobData {
    Blob {
        is_binary: bool,
        content: Vec<u8>,
        last_commit: Box<radicle_surf::Commit>,
    },
    TooLarge,
}

/// Read the blob at `path` in the tree of `commit`.
///
/// Resolves content via a direct tree lookup and the last-modifying commit via
/// [`last_path_commit`], avoiding `radicle_surf::Repository::blob`, which walks
/// the full history to find that commit.
fn read_blob(
    storage: &radicle::storage::git::Repository,
    surf_repo: &Repository,
    commit: Oid,
    path: &str,
) -> Result<BlobData, Error> {
    let tree = storage.backend.find_commit(commit.into())?.tree()?;
    let entry = tree.get_path(std::path::Path::new(path))?;
    let blob = entry
        .to_object(&storage.backend)?
        .into_blob()
        .map_err(|_| radicle::git::raw::Error::from_str("path does not point to a blob"))?;

    if blob.content().len() > MAX_BODY_LIMIT {
        return Ok(BlobData::TooLarge);
    }

    let last_commit = last_path_commit(surf_repo, storage.path(), commit, path)?;

    Ok(BlobData::Blob {
        is_binary: blob.is_binary(),
        content: blob.content().to_vec(),
        last_commit: Box::new(last_commit),
    })
}

/// Resolve the most recent commit that modified `path`, reachable from `head`.
///
/// Fast path: `git rev-list -1` walks history using the commit-graph (when
/// present), skipping the per-commit tree diff that a libgit2 pathspec walk
/// performs. On large histories this is near-instant even for a file last
/// touched long ago. Falls back to the surf history walk if the git binary is
/// unavailable or errors.
fn last_path_commit(
    surf_repo: &Repository,
    repo_path: &std::path::Path,
    head: Oid,
    path: &str,
) -> Result<radicle_surf::Commit, Error> {
    let head_arg = head.to_string();
    // `:(literal)` disables pathspec glob matching so file names containing
    // `[`, `*` or `?` (e.g. `src/pages/[id].ts`) are looked up verbatim.
    let pathspec = format!(":(literal){path}");
    let fast = git_output(
        repo_path,
        &["rev-list", "-1", head_arg.as_str(), "--", pathspec.as_str()],
    )
    .and_then(|stdout| String::from_utf8_lossy(&stdout).trim().parse::<Oid>().ok());

    match fast {
        Some(oid) => Ok(surf_repo.commit(oid)?),
        None => {
            let path = std::path::Path::new(path);
            surf_repo.last_commit(&path, head)?.ok_or(Error::NotFound)
        }
    }
}

/// Get repo source file.
/// `GET /repos/:rid/blob/:sha/*path`
async fn blob_handler(
    State(ctx): State<Context>,
    Path((rid, sha, path)): Path<(String, Oid, String)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let outcome = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let surf_repo = Repository::open(repo.path())?;

        Ok::<_, Error>(match read_blob(&repo, &surf_repo, sha, &path)? {
            BlobData::TooLarge => BlobOutcome::TooLarge,
            BlobData::Blob {
                is_binary,
                content,
                last_commit,
            } => BlobOutcome::Json(api::json::commit::blob_json(
                is_binary,
                &content,
                &path,
                &last_commit,
            )),
        })
    })
    .await?;

    match outcome {
        BlobOutcome::TooLarge => Ok::<_, Error>(
            (
                StatusCode::PAYLOAD_TOO_LARGE,
                [(header::CACHE_CONTROL, "no-cache")],
                Json(json!([])),
            )
                .into_response(),
        ),
        BlobOutcome::Json(value) => Ok::<_, Error>(immutable_response(value).into_response()),
    }
}

/// Get repo readme.
/// `GET /repos/:rid/readme/:sha`
async fn readme_handler(
    State(ctx): State<Context>,
    Path((rid, sha)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let outcome = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let surf_repo = Repository::open(repo.path())?;
        let paths = [
            "README",
            "README.md",
            "README.markdown",
            "README.txt",
            "README.rst",
            "README.org",
            "Readme.md",
        ];

        for path in paths
            .iter()
            .map(ToString::to_string)
            .chain(paths.iter().map(|p| p.to_lowercase()))
        {
            match read_blob(&repo, &surf_repo, sha, &path) {
                Ok(BlobData::TooLarge) => return Ok::<_, Error>(BlobOutcome::TooLarge),
                Ok(BlobData::Blob {
                    is_binary,
                    content,
                    last_commit,
                }) => {
                    return Ok::<_, Error>(BlobOutcome::Json(api::json::commit::blob_json(
                        is_binary,
                        &content,
                        &path,
                        &last_commit,
                    )))
                }
                Err(_) => continue,
            }
        }

        Err(Error::NotFound)
    })
    .await?;

    match outcome {
        BlobOutcome::TooLarge => Ok::<_, Error>(
            (
                StatusCode::PAYLOAD_TOO_LARGE,
                [(header::CACHE_CONTROL, "no-cache")],
                Json(json!([])),
            )
                .into_response(),
        ),
        BlobOutcome::Json(value) => Ok::<_, Error>(immutable_response(value).into_response()),
    }
}

/// Get repo issues list.
/// `GET /repos/:rid/issues`
async fn issues_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
    Query(qs): Query<CobsQuery<api::query::IssueStatus>>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let issues = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let CobsQuery {
            page,
            per_page,
            status,
        } = qs;
        let page = page.unwrap_or(0);
        let per_page = per_page.unwrap_or(10);
        let status = status.unwrap_or_default();
        let issues = ctx.profile.issues(&repo)?;
        let mut issues: Vec<_> = issues
            .list()?
            .filter_map(|r| {
                let (id, issue) = r.ok()?;
                (status.matches(issue.state())).then_some((id, issue))
            })
            .collect::<Vec<_>>();

        issues.sort_by_key(|(_, b)| std::cmp::Reverse(b.timestamp()));
        let aliases = &ctx.profile.aliases();
        Ok::<_, Error>(
            issues
                .into_iter()
                .map(|(id, issue)| api::json::cobs::Issue::new(&issue).as_json(id, aliases))
                .skip(page * per_page)
                .take(per_page)
                .collect::<Vec<_>>(),
        )
    })
    .await?;

    Ok::<_, Error>(Json(issues))
}

/// Get repo issue.
/// `GET /repos/:rid/issues/:id`
async fn issue_handler(
    State(ctx): State<Context>,
    Path((rid, issue_id)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let value = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let issue = ctx
            .profile
            .issues(&repo)?
            .get(&issue_id.into())?
            .ok_or(Error::NotFound)?;
        let aliases = ctx.profile.aliases();

        Ok::<_, Error>(api::json::cobs::Issue::new(&issue).as_json(issue_id.into(), &aliases))
    })
    .await?;

    Ok::<_, Error>(Json(value))
}

/// Get repo patches list.
/// `GET /repos/:rid/patches`
async fn patches_handler(
    State(ctx): State<Context>,
    Path(rid): Path<String>,
    Query(qs): Query<CobsQuery<api::query::PatchStatus>>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let patches = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let CobsQuery {
            page,
            per_page,
            status,
        } = qs;
        let page = page.unwrap_or(0);
        let per_page = per_page.unwrap_or(10);
        let status = status.unwrap_or_default();
        let patches = ctx.profile.patches(&repo)?;
        let mut patches = patches
            .list()?
            .filter_map(|r| {
                let (id, patch) = r.ok()?;
                (status.matches(patch.state())).then_some((id, patch))
            })
            .collect::<Vec<_>>();
        patches.sort_by_key(|(_, b)| std::cmp::Reverse(b.timestamp()));
        let aliases = ctx.profile.aliases();
        Ok::<_, Error>(
            patches
                .into_iter()
                .map(|(id, patch)| api::json::cobs::Patch::new(&patch).as_json(id, &repo, &aliases))
                .skip(page * per_page)
                .take(per_page)
                .collect::<Vec<_>>(),
        )
    })
    .await?;

    Ok::<_, Error>(Json(patches))
}

/// Get repo patch.
/// `GET /repos/:rid/patches/:id`
async fn patch_handler(
    State(ctx): State<Context>,
    Path((rid, patch_id)): Path<(String, Oid)>,
) -> impl IntoResponse {
    let rid = ctx.resolve_repo(&rid)?;
    let value = api::blocking(move || {
        let (repo, _) = ctx.repo(rid)?;
        let patches = ctx.profile.patches(&repo)?;
        let patch = patches.get(&patch_id.into())?.ok_or(Error::NotFound)?;
        let aliases = ctx.profile.aliases();

        Ok::<_, Error>(api::json::cobs::Patch::new(&patch).as_json(
            patch_id.into(),
            &repo,
            &aliases,
        ))
    })
    .await?;

    Ok::<_, Error>(Json(value))
}

#[cfg(test)]
mod routes {
    use std::net::SocketAddr;

    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use pretty_assertions::assert_eq;
    use radicle::storage::ReadStorage;
    use serde_json::json;

    use crate::test::*;

    #[tokio::test]
    async fn test_repos_root() {
        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());
        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/repos?show=all").await;

        assert_eq!(response.status(), StatusCode::OK);
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
                  },
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
                  }
                ],
                "threshold": 1,
                "visibility": {
                  "type": "public"
                },
                "rid": "rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE",
                "seeding": 1,
                "refs": { "tags": {}, "refs": { "refs/heads/master": "344dcd184df5bf37aab6c107fa9371a1c5b3321a" } }
              },
            ])
        );

        let app = super::router(seed).layer(MockConnectInfo(SocketAddr::from((
            [192, 168, 13, 37],
            8080,
        ))));
        let response = get(&app, "/repos?show=all").await;

        assert_eq!(response.status(), StatusCode::OK);
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
                      "name": "again-hello-world",
                      "description": "Rad repository for sorting",
                      "defaultBranch": "master",
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
              },
            ])
        );
    }

    #[tokio::test]
    async fn test_repos_root_sort_seeding() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/repos?show=all&sort=seeding").await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await;
        let rids: Vec<&str> = body
            .as_array()
            .unwrap()
            .iter()
            .map(|repo| repo["rid"].as_str().unwrap())
            .collect();
        assert_eq!(rids.len(), 2);
        assert!(rids.contains(&RID));
        assert!(rids.contains(&"rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE"));
    }

    #[tokio::test]
    async fn test_repos_root_sort_activity() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/repos?show=all&sort=activity").await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await;
        let rids: Vec<&str> = body
            .as_array()
            .unwrap()
            .iter()
            .map(|repo| repo["rid"].as_str().unwrap())
            .collect();
        // Without a search backend, activity sort collapses to rid sort.
        // hello-world's rid sorts before again-hello-world's.
        assert_eq!(rids, vec![RID, "rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE"]);
    }

    #[tokio::test]
    async fn test_repos_root_sort_falls_back_without_search() {
        // Without a search backend, sort=activity and sort=seeding should
        // produce the same response as the default rid sort, instead of
        // walking storage and opening every repo per request.
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));

        let rid_sorted: serde_json::Value = get(&app, "/repos?show=all").await.json().await;
        let activity_sorted: serde_json::Value = get(&app, "/repos?show=all&sort=activity")
            .await
            .json()
            .await;
        let seeding_sorted: serde_json::Value =
            get(&app, "/repos?show=all&sort=seeding").await.json().await;

        assert_eq!(rid_sorted, activity_sorted);
        assert_eq!(rid_sorted, seeding_sorted);
    }

    #[tokio::test]
    async fn test_repos_per_page_is_clamped() {
        // A caller requesting more than MAX_PER_PAGE must not be able to
        // pull an unbounded result set. With the small fixture we can't
        // observe the cap directly, but the request must succeed and the
        // returned length must respect the cap.
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/repos?show=all&perPage=99999").await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await;
        let len = body.as_array().unwrap().len();
        assert!(len <= super::MAX_PER_PAGE);
    }

    #[tokio::test]
    async fn test_repos_search_per_page_is_clamped() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/repos/search?q=hello&perPage=99999").await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await;
        let len = body.as_array().unwrap().len();
        assert!(len <= super::MAX_PER_PAGE);
    }

    #[tokio::test]
    async fn test_repos_search_fallback_sets_cache_control() {
        // Without a search backend, /repos/search runs the storage-walk
        // substring scan and must still set Cache-Control so intermediaries
        // can serve repeat queries from cache.
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/repos/search?q=hello").await;

        assert_eq!(response.status(), StatusCode::OK);
        let cache_control = response
            .headers()
            .get("cache-control")
            .expect("cache-control header should be present")
            .to_str()
            .unwrap();
        assert!(
            cache_control.contains("max-age=600"),
            "unexpected cache-control: {cache_control}"
        );
    }

    #[tokio::test]
    async fn test_repos_search_clamps_long_query() {
        // A user-supplied `q` longer than MAX_QUERY_LEN is truncated rather
        // than rejected; the request still succeeds.
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let long_q = "a".repeat(super::MAX_QUERY_LEN * 4);
        let response = get(&app, format!("/repos/search?q={long_q}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await;
        // Substring scan over "aaa…" finds no repo names; clamp didn't crash.
        assert_eq!(body.as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_repos() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
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
                   "alias": CONTRIBUTOR_ALIAS,
                 }
               ],
               "threshold": 1,
               "visibility": {
                 "type": "public"
               },
               "rid": RID,
               "seeding": 1,
               "refs": { "tags": {}, "refs": { "refs/heads/master": HEAD } }
            })
        );
    }

    #[tokio::test]
    async fn test_repo_alias_resolution() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ctx = seed(tmp.path());
        let rid = RID.parse().unwrap();
        ctx.set_repo_aliases(std::collections::HashMap::from_iter([(
            "hello".to_string(),
            rid,
        )]));
        let app = super::router(ctx);

        // The alias resolves to the same repo as the RID, and the repo info
        // advertises the configured alias.
        let response = get(&app, "/repos/hello").await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.json().await;
        assert_eq!(body["rid"], json!(RID));
        assert_eq!(body["alias"], json!("hello"));

        // The RID itself keeps working and still advertises the alias.
        let response = get(&app, format!("/repos/{RID}")).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json().await["alias"], json!("hello"));

        // An unknown alias is not found.
        let response = get(&app, "/repos/nope").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_search_repos() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, "/repos/search?q=hello").await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!([
              {
                "payloads": {
                  "xyz.radicle.project": {
                    "name": "hello-world",
                    "description": "Rad repository for tests",
                    "defaultBranch": "master",
                  }
                },
                "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "delegates": [
                  {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS
                  }
                ],
                "seeds": 1,
              },
              {
                "payloads": {
                  "xyz.radicle.project": {
                    "name": "again-hello-world",
                    "description": "Rad repository for sorting",
                    "defaultBranch": "master",
                  },
                },
                "rid": "rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE",
                "delegates": [
                  {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS
                  },
                ],
                "seeds": 1,
              },
            ])
        );
    }

    #[tokio::test]
    async fn test_search_repos_pagination() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, "/repos/search?q=hello&perPage=1").await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!([
              {
                "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "payloads": {
                  "xyz.radicle.project": {
                    "defaultBranch": "master",
                    "description": "Rad repository for tests",
                    "name": "hello-world",
                  },
                },
                "delegates": [
                  {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS,
                  }
                ],
                "seeds": 1,
              },
            ])
        );
    }

    #[tokio::test]
    async fn test_repos_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, "/repos/rad:z2u2CP3ZJzB7ZqE8jHrau19yjcfCQ").await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_commits_root() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/commits")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!([
                {
                  "id": HEAD,
                  "author": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz"
                  },
                  "summary": "Add another folder",
                  "description": "",
                  "parents": [
                    "ee8d6a29304623a78ebfa5eeed5af674d0e58f83",
                  ],
                  "committer": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz",
                    "time": 1673003014
                  },
                },
                {
                  "id": PARENT,
                  "author": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz"
                  },
                  "summary": "Add contributing file",
                  "description": "",
                  "parents": [
                    "f604ce9fd5b7cc77b7609beda45ea8760bee78f7",
                  ],
                  "committer": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz",
                    "time": 1673002014,
                  },
                },
                {
                  "id": INITIAL_COMMIT,
                  "author": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz",
                  },
                  "summary": "Initial commit",
                  "description": "",
                  "parents": [],
                  "committer": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz",
                    "time": 1673001014,
                  },
                },
            ])
        );
    }

    #[tokio::test]
    async fn test_repos_commits() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/commits/{HEAD}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
              "commit": {
                "id": HEAD,
                "author": {
                  "name": "Alice Liddell",
                  "email": "alice@radicle.xyz"
                },
                "summary": "Add another folder",
                "description": "",
                "parents": [
                  "ee8d6a29304623a78ebfa5eeed5af674d0e58f83",
                ],
                "committer": {
                  "name": "Alice Liddell",
                  "email": "alice@radicle.xyz",
                  "time": 1673003014
                },
              },
              "diff": {
                "files": [
                  {
                    "status": "deleted",
                    "path": "CONTRIBUTING",
                    "diff": {
                      "type": "plain",
                      "hunks": [
                        {
                          "header": "@@ -1 +0,0 @@\n",
                          "lines": [
                            {
                              "line": "Thank you very much!\n",
                              "lineNo": 1,
                              "type": "deletion",
                            },
                          ],
                          "old":  {
                            "start": 1,
                            "end": 2,
                          },
                          "new": {
                            "start": 0,
                            "end": 0,
                          },
                        },
                      ],
                      "stats": {
                        "additions": 0,
                        "deletions": 1,
                      },
                      "eof": "noneMissing",
                    },
                    "old": {
                      "oid": "82eb77880c693655bce074e3dbbd9fa711dc018b",
                      "mode": "blob",
                    },
                  },
                  {
                    "status": "added",
                    "path": "README",
                    "diff": {
                      "type": "plain",
                      "hunks": [
                        {
                          "header": "@@ -0,0 +1 @@\n",
                          "lines": [
                            {
                              "line": "Hello World!\n",
                              "lineNo": 1,
                              "type": "addition",
                            },
                          ],
                          "old":  {
                            "start": 0,
                            "end": 0,
                          },
                          "new": {
                            "start": 1,
                            "end": 2,
                          },
                        },
                      ],
                      "stats": {
                        "additions": 1,
                        "deletions": 0,
                      },
                      "eof": "noneMissing",
                    },
                    "new": {
                      "oid": "980a0d5f19a64b4b30a87d4206aade58726b60e3",
                      "mode": "blob",
                    },
                  },
                  {
                    "status": "added",
                    "path": "dir1/README",
                    "diff": {
                      "type": "plain",
                      "hunks": [
                        {
                          "header": "@@ -0,0 +1 @@\n",
                          "lines": [
                            {
                              "line": "Hello World from dir1!\n",
                              "lineNo": 1,
                              "type": "addition"
                            }
                          ],
                          "old":  {
                            "start": 0,
                            "end": 0,
                          },
                          "new": {
                            "start": 1,
                            "end": 2,
                          },
                        }
                      ],
                      "stats": {
                        "additions": 1,
                        "deletions": 0,
                      },
                      "eof": "noneMissing",
                    },
                    "new": {
                      "oid": "1dd5654ca2d2cf9f33b14c92b5ca9e1d21a91ae1",
                      "mode": "blob",
                    },
                  },
                ],
                "stats": {
                  "filesChanged": 3,
                  "insertions": 2,
                  "deletions": 1
                }
              },
              "files": {
                "1dd5654ca2d2cf9f33b14c92b5ca9e1d21a91ae1": {
                  "id": "1dd5654ca2d2cf9f33b14c92b5ca9e1d21a91ae1",
                  "binary": false,
                  "content": "Hello World from dir1!\n",
                },
                "82eb77880c693655bce074e3dbbd9fa711dc018b": {
                  "id": "82eb77880c693655bce074e3dbbd9fa711dc018b",
                  "binary": false,
                  "content": "Thank you very much!\n",
                },
                "980a0d5f19a64b4b30a87d4206aade58726b60e3": {
                  "id": "980a0d5f19a64b4b30a87d4206aade58726b60e3",
                  "binary": false,
                  "content": "Hello World!\n",
                },
              },
              "branches": [
                "refs/heads/master"
              ]
            })
        );
    }

    #[tokio::test]
    async fn test_repos_commits_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(
            &app,
            format!("/repos/{RID}/commits/ffffffffffffffffffffffffffffffffffffffff"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_stats() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/stats/tree/{HEAD}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!(
              {
                "commits": 3,
                "branches": 1,
                "contributors": 1
              }
            )
        );
    }

    #[tokio::test]
    async fn test_repos_stats_commits() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/stats/commits/{HEAD}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json().await, json!({ "commits": 3 }));
    }

    #[tokio::test]
    async fn test_repos_tree() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/tree/{HEAD}/")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "entries": [
                  {
                    "path": "dir1",
                    "oid": "2d1c3cbfcf1d190d7fc77ac8f9e53db0e91a9ad3",
                    "name": "dir1",
                    "kind": "tree"
                  },
                  {
                    "path": "README",
                    "oid": "980a0d5f19a64b4b30a87d4206aade58726b60e3",
                    "name": "README",
                    "kind": "blob"
                  }
                ],
                "lastCommit": {
                  "id": HEAD,
                  "author": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz"
                  },
                  "summary": "Add another folder",
                  "description": "",
                  "parents": [
                    "ee8d6a29304623a78ebfa5eeed5af674d0e58f83",
                  ],
                  "committer": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz",
                    "time": 1673003014
                  },
                },
                "name": "",
                "path": "",
              }
            )
        );

        let response = get(&app, format!("/repos/{RID}/tree/{HEAD}/dir1")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
              "entries": [
                {
                  "path": "dir1/README",
                  "oid": "1dd5654ca2d2cf9f33b14c92b5ca9e1d21a91ae1",
                  "name": "README",
                  "kind": "blob"
                }
              ],
              "lastCommit": {
                "id": HEAD,
                "author": {
                  "name": "Alice Liddell",
                  "email": "alice@radicle.xyz"
                },
                "summary": "Add another folder",
                "description": "",
                "parents": [
                  "ee8d6a29304623a78ebfa5eeed5af674d0e58f83",
                ],
                "committer": {
                  "name": "Alice Liddell",
                  "email": "alice@radicle.xyz",
                  "time": 1673003014
                },
              },
              "name": "dir1",
              "path": "dir1",
            })
        );
    }

    #[tokio::test]
    async fn test_repos_tree_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(
            &app,
            format!("/repos/{RID}/tree/ffffffffffffffffffffffffffffffffffffffff"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = get(&app, format!("/repos/{RID}/tree/{HEAD}/unknown")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_remotes_root() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/remotes")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!([
              {
                "id": "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi",
                "alias": CONTRIBUTOR_ALIAS,
                "heads": {
                  "master": HEAD
                },
                "refs": {
                  "refs/heads/master": HEAD
                },
                "delegate": true
              }
            ])
        );
    }

    #[tokio::test]
    async fn test_repos_remotes() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(
            &app,
            format!("/repos/{RID}/remotes/z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "id": "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi",
                "alias": CONTRIBUTOR_ALIAS,
                "heads": {
                    "master": HEAD
                },
                "refs": {
                    "refs/heads/master": HEAD
                },
                "delegate": true
            })
        );
    }

    #[tokio::test]
    async fn test_repos_remotes_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(
            &app,
            format!("/repos/{RID}/remotes/z6MksFqXN3Yhqk8pTJdUGLwATkRfQvwZXPqR2qMEhbS9wzpT"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_multi_peer_canonical_refs() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed_multi_peer(tmp.path());
        let app =
            super::router(ctx).layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, format!("/repos/{RID}")).await;

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.json().await;
        let refs = &body["refs"];

        assert_eq!(refs["refs"]["refs/heads/master"], json!(HEAD));
        assert_eq!(refs["tags"]["refs/tags/v1.0"]["commit"], json!(HEAD));
        assert!(refs["refs"]["refs/heads/feature/branch"].is_string());
        assert!(refs["tags"].get("refs/tags/v2.0-rc").is_none());
    }

    #[tokio::test]
    async fn test_repos_blob() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/blob/{HEAD}/README")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "binary": false,
                "name": "README",
                "path": "README",
                "lastCommit": {
                  "id": HEAD,
                  "author": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz"
                  },
                  "summary": "Add another folder",
                  "description": "",
                  "parents": [
                    "ee8d6a29304623a78ebfa5eeed5af674d0e58f83"
                  ],
                  "committer": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz",
                    "time": 1673003014
                  },
                },
                "content": "Hello World!\n",
            })
        );
    }

    #[tokio::test]
    async fn test_repos_blob_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/blob/{HEAD}/unknown")).await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_readme() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/readme/{INITIAL_COMMIT}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "binary": false,
                "name": "README",
                "path": "README",
                "lastCommit": {
                  "id": INITIAL_COMMIT,
                  "author": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz"
                  },
                  "summary": "Initial commit",
                  "description": "",
                  "parents": [],
                  "committer": {
                    "name": "Alice Liddell",
                    "email": "alice@radicle.xyz",
                    "time": 1673001014
                  },
                },
                "content": "Hello World!\n"
            })
        );
    }

    #[tokio::test]
    async fn test_repos_diff() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/diff/{INITIAL_COMMIT}/{HEAD}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "diff": {
                  "files": [
                    {
                      "status": "added",
                      "path": "dir1/README",
                      "diff": {
                        "type": "plain",
                        "hunks": [
                          {
                            "header": "@@ -0,0 +1 @@\n",
                            "lines": [
                              {
                                "line": "Hello World from dir1!\n",
                                "lineNo": 1,
                                "type": "addition",
                              },
                            ],
                            "old":  {
                              "start": 0,
                              "end": 0,
                            },
                            "new": {
                              "start": 1,
                              "end": 2,
                            },
                          },
                        ],
                        "stats": {
                          "additions": 1,
                          "deletions": 0,
                        },
                        "eof": "noneMissing",
                      },
                      "new": {
                        "oid": "1dd5654ca2d2cf9f33b14c92b5ca9e1d21a91ae1",
                        "mode": "blob",
                      },
                    },
                  ],
                  "stats": {
                    "filesChanged": 1,
                    "insertions": 1,
                    "deletions": 0,
                  },
                },
                "files": {
                  "1dd5654ca2d2cf9f33b14c92b5ca9e1d21a91ae1": {
                    "id": "1dd5654ca2d2cf9f33b14c92b5ca9e1d21a91ae1",
                    "binary": false,
                    "content": "Hello World from dir1!\n",
                  },
                },
                "commits": [
                  {
                    "id": HEAD,
                    "author": {
                      "name": "Alice Liddell",
                      "email": "alice@radicle.xyz",
                    },
                    "summary": "Add another folder",
                    "description": "",
                    "parents": [
                      "ee8d6a29304623a78ebfa5eeed5af674d0e58f83"
                    ],
                    "committer": {
                      "name": "Alice Liddell",
                      "email": "alice@radicle.xyz",
                      "time": 1673003014,
                    },
                  },
                  {
                    "id": PARENT,
                    "author": {
                      "name": "Alice Liddell",
                      "email": "alice@radicle.xyz",
                    },
                    "summary": "Add contributing file",
                    "description": "",
                    "parents": [
                      "f604ce9fd5b7cc77b7609beda45ea8760bee78f7",
                    ],
                    "committer": {
                      "name": "Alice Liddell",
                      "email": "alice@radicle.xyz",
                      "time": 1673002014,
                    }
                  }
                ],
            })
        );
    }

    /// The head of the diff is a merge commit whose second parent is the base.
    /// A commit-date-ordered walk reaches the base first, which used to
    /// truncate the list to the merge alone.
    #[tokio::test]
    async fn test_repos_diff_merge_commit() {
        let tmp = tempfile::tempdir().unwrap();
        let MergeFixture {
            ctx,
            rid,
            base,
            head,
            feature,
        } = seed_merge(tmp.path());
        let app = super::router(ctx);

        let response = get(&app, format!("/repos/{rid}/diff/{base}/{head}")).await;
        assert_eq!(response.status(), StatusCode::OK);

        let json = response.json().await;
        let commits = json["commits"].as_array().unwrap();
        let ids = commits
            .iter()
            .map(|c| c["id"].as_str().unwrap().to_string())
            .collect::<Vec<_>>();

        assert_eq!(ids, vec![head.to_string(), feature.to_string()]);
    }

    #[tokio::test]
    async fn test_repos_diff_stats() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(
            &app,
            format!("/repos/{RID}/diff/{INITIAL_COMMIT}/{HEAD}/stats"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "filesChanged": 1,
                "insertions": 1,
                "deletions": 0,
            })
        );
    }

    #[tokio::test]
    async fn test_repos_issues_root() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/issues")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!([
              {
                "id": ISSUE_ID,
                "author": {
                  "id": DID,
                  "alias": CONTRIBUTOR_ALIAS
                },
                "title": "Issue #1",
                "state": {
                  "status": "open"
                },
                "assignees": [],
                "discussion": [
                  {
                    "id": ISSUE_ID,
                    "author": {
                      "id": DID,
                      "alias": CONTRIBUTOR_ALIAS
                    },
                    "body": "Change 'hello world' to 'hello everyone'",
                    "edits": [
                      {
                        "author": {
                          "id": DID,
                          "alias": CONTRIBUTOR_ALIAS
                        },
                        "body": "Change 'hello world' to 'hello everyone'",
                        "timestamp": TIMESTAMP,
                        "embeds": [],
                      },
                    ],
                    "embeds": [],
                    "reactions": [],
                    "timestamp": TIMESTAMP,
                    "replyTo": null,
                    "resolved": false,
                  }
                ],
                "labels": []
              }
            ])
        );
    }

    #[tokio::test]
    async fn test_repos_issue() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/issues/{ISSUE_ID}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "id": ISSUE_ID,
                "author": {
                  "id": DID,
                  "alias": CONTRIBUTOR_ALIAS
                },
                "title": "Issue #1",
                "state": {
                  "status": "open"
                },
                "assignees": [],
                "discussion": [
                  {
                    "id": ISSUE_ID,
                    "author": {
                      "id": DID,
                      "alias": CONTRIBUTOR_ALIAS
                    },
                    "body": "Change 'hello world' to 'hello everyone'",
                    "edits": [
                      {
                        "author": {
                          "id": DID,
                          "alias": CONTRIBUTOR_ALIAS
                        },
                        "body": "Change 'hello world' to 'hello everyone'",
                        "timestamp": TIMESTAMP,
                        "embeds": [],
                      },
                    ],
                    "embeds": [],
                    "reactions": [],
                    "timestamp": TIMESTAMP,
                    "replyTo": null,
                    "resolved": false,
                  }
                ],
                "labels": []
            })
        );
    }

    #[tokio::test]
    async fn test_repos_patches_root() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/patches")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!([
                {
                    "id": PATCH_ID,
                    "author": {
                        "id": DID,
                        "alias": CONTRIBUTOR_ALIAS,
                    },
                    "title": "A new `hello world`",
                    "state": {
                        "status": "open",
                    },
                    "target": "delegates",
                    "labels": [],
                    "merges": [],
                    "assignees": [],
                    "revisions": [
                        {
                            "id": PATCH_ID,
                            "author": {
                                "id": DID,
                                "alias": CONTRIBUTOR_ALIAS,
                            },
                            "description": "change `hello world` in README to something else",
                            "edits": [
                                {
                                    "author": {
                                        "id": DID,
                                        "alias": CONTRIBUTOR_ALIAS,
                                    },
                                    "body": "change `hello world` in README to something else",
                                    "timestamp": TIMESTAMP,
                                    "embeds": [],
                                },
                            ],
                            "reactions": [],
                            "base": "ee8d6a29304623a78ebfa5eeed5af674d0e58f83",
                            "oid": "e8c676b9e3b42308dc9d218b70faa5408f8e58ca",
                            "refs": [
                                "refs/heads/master",
                            ],
                            "discussions": [],
                            "timestamp": TIMESTAMP,
                            "reviews": [],
                        },
                    ],
                },
                ]
            )
        );
    }

    #[tokio::test]
    async fn test_repos_patch() {
        let tmp = tempfile::tempdir().unwrap();
        let app = super::router(seed(tmp.path()));
        let response = get(&app, format!("/repos/{RID}/patches/{PATCH_ID}")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json().await,
            json!({
                "id": PATCH_ID,
                "author": {
                    "id": DID,
                    "alias": CONTRIBUTOR_ALIAS,
                },
                "title": "A new `hello world`",
                "state": {
                    "status": "open",
                },
                "target": "delegates",
                "labels": [],
                "merges": [],
                "assignees": [],
                "revisions": [
                    {
                        "id": PATCH_ID,
                        "author": {
                            "id": DID,
                            "alias": CONTRIBUTOR_ALIAS,
                        },
                        "description": "change `hello world` in README to something else",
                        "edits": [
                            {
                                "author": {
                                    "id": DID,
                                    "alias": CONTRIBUTOR_ALIAS,
                                },
                                "body": "change `hello world` in README to something else",
                                "timestamp": TIMESTAMP,
                                "embeds": [],
                            },
                        ],
                        "reactions": [],
                        "base": "ee8d6a29304623a78ebfa5eeed5af674d0e58f83",
                        "oid": "e8c676b9e3b42308dc9d218b70faa5408f8e58ca",
                        "refs": [
                            "refs/heads/master",
                        ],
                        "discussions": [],
                        "timestamp": TIMESTAMP,
                        "reviews": [],
                    },
                ],
            })
        );
    }

    #[tokio::test]
    async fn test_repos_private() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = seed(tmp.path());
        let app = super::router(ctx.to_owned());

        // Check that the repo exists.
        ctx.profile()
            .storage
            .repository(RID_PRIVATE.parse().unwrap())
            .unwrap();

        let response = get(&app, format!("/repos/{RID_PRIVATE}")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = get(&app, format!("/repos/{RID_PRIVATE}/patches")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = get(&app, format!("/repos/{RID_PRIVATE}/issues")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = get(&app, format!("/repos/{RID_PRIVATE}/commits")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = get(&app, format!("/repos/{RID_PRIVATE}/remotes")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_repos_uses_reloadable_pinned_config() {
        use radicle::identity::RepoId;
        use std::str::FromStr;

        let tmp = tempfile::tempdir().unwrap();
        let seed = seed(tmp.path());

        let app = super::router(seed.clone())
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        let response = get(&app, "/repos?show=pinned").await;
        assert_eq!(response.status(), StatusCode::OK);
        let repos = response.json().await;
        assert_eq!(repos.as_array().unwrap().len(), 0);

        {
            let rid = RepoId::from_str(RID).unwrap();
            seed.web_config
                .update(|config| {
                    config.pinned.repositories.insert(rid);
                })
                .await;
        }

        let response = get(&app, "/repos?show=pinned").await;
        assert_eq!(response.status(), StatusCode::OK);
        let repos = response.json().await;
        assert_eq!(repos.as_array().unwrap().len(), 1);
        assert_eq!(repos[0]["rid"], json!(RID));
    }
}
