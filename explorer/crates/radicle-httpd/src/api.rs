use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use axum::response::{IntoResponse, Json};
use axum::routing::get;
use axum::Router;
use serde_json::{json, Value};

use radicle::identity::doc::PayloadId;
use radicle::identity::{DocAt, RepoId};
use radicle::issue::cache::Issues as _;
use radicle::node::routing::Store;
use radicle::node::{Alias, AliasStore as _, NodeId};
use radicle::patch::cache::Patches as _;
use radicle::storage::git::Repository;
use radicle::storage::{ReadRepository, ReadStorage};
use radicle::{git, web, Profile};
#[cfg(feature = "artifacts")]
use radicle_artifact::Releases;
use radicle_search::index::repo as search_repo;
use tokio::sync::RwLock;

pub(crate) mod backend;
mod error;
mod json;
pub(crate) mod query;
mod v1;

pub(crate) use backend::Backend;
pub(crate) use radicle_search::query::SearchClient;

use crate::api::error::Error;
use crate::cache::Cache;
use crate::{Options, Source};

pub const RADICLE_VERSION: &str = env!("RADICLE_VERSION");
// This version has to be updated on every breaking change to the radicle-httpd API.
pub const API_VERSION: &str = "6.3.0";

/// Thread-safe wrapper around radicle's web configuration.
///
/// This struct provides concurrent read/write access to web configuration
/// that can be dynamically reloaded (e.g., via SIGHUP) without restarting the server.
/// All access is synchronized via an async [`RwLock`] to prevent race conditions.
#[derive(Clone)]
pub struct WebConfig {
    inner: Arc<RwLock<web::Config>>,
}

impl WebConfig {
    /// Creates a new WebConfig from a [`Profile`]'s web configuration.
    pub fn from_profile(profile: &Profile) -> Self {
        let config = profile.config.web.clone();
        Self {
            inner: Arc::new(RwLock::new(config)),
        }
    }

    /// Return the underlying web configuration.
    pub async fn read(&self) -> web::Config {
        self.inner.read().await.clone()
    }

    /// Atomically updates the config by applying a function while holding the write lock.
    /// This prevents lost updates when multiple tasks attempt concurrent modifications.
    pub async fn update<F>(&self, f: F)
    where
        F: FnOnce(&mut web::Config),
    {
        let mut config = self.inner.write().await;
        f(&mut config);
    }
}

#[derive(Clone)]
pub struct Context {
    profile: Arc<Profile>,
    cache: Option<Cache>,
    web_config: WebConfig,
    /// The data source this context reads derived state from.
    source: Source,
    /// Search backend, present when configured via `RADICLE_SEARCH_URL`. In
    /// [`Source::Sqlite`] mode, absent means listing and search fall back to
    /// the storage walk. In [`Source::Meilisearch`] mode this is always
    /// `Some` — construction fails fatally otherwise.
    search: Option<Backend>,
    /// The repo aliases configured via `--alias`, mapping each alias to its
    /// [`RepoId`]. Used to resolve alias path segments to a repo and to
    /// advertise a repo's short name in its info.
    repo_aliases: Arc<HashMap<String, RepoId>>,
}

/// Repo metadata hydrated separately from the repo doc: seeding count, cob
/// counts, and delegate aliases. Assembled either from SQLite reads
/// ([`Context::repo_meta_sqlite`]) or from a repo search doc
/// ([`Context::repo_meta_meili`]).
pub(crate) struct RepoMeta {
    pub seeding: usize,
    /// `None` when the cob cache failed to open or count, mirroring the
    /// storage-walk behavior of dropping the whole `xyz.radicle.project`
    /// payload entry rather than reporting fabricated zero counts.
    pub issues: Option<search_repo::IssueCounts>,
    pub patches: Option<search_repo::PatchCounts>,
    pub releases: Option<usize>,
    pub aliases: HashMap<NodeId, Alias>,
}

/// Build [`RepoMeta`] from a repo search doc and its delegates' aliases.
pub(crate) fn meta_from_doc(
    doc: &search_repo::Document,
    aliases: HashMap<NodeId, Alias>,
) -> RepoMeta {
    RepoMeta {
        seeding: doc.seeding_count as usize,
        issues: Some(doc.issue_counts),
        patches: Some(doc.patch_counts),
        releases: releases_meta(doc.release_count as usize),
        aliases,
    }
}

impl Context {
    pub fn new(
        profile: Arc<Profile>,
        web_config: WebConfig,
        options: &Options,
    ) -> anyhow::Result<Self> {
        let search = match (&options.search, options.source) {
            (Some(cfg), _) => match SearchClient::new(
                &cfg.url,
                cfg.api_key.as_deref(),
                &cfg.index_prefix,
                cfg.query_timeout,
            ) {
                Ok(client) => {
                    tracing::info!(
                        "search backend enabled: url={} prefix={:?}",
                        cfg.url,
                        cfg.index_prefix
                    );
                    Some(Backend::Meili(Box::new(client)))
                }
                Err(e) if options.source == Source::Meilisearch => {
                    anyhow::bail!("failed to construct search backend client: {e:#}");
                }
                Err(e) => {
                    tracing::warn!(
                        "failed to construct search backend client, \
                         falling back to storage walk: {e:#}"
                    );
                    None
                }
            },
            (None, Source::Meilisearch) => {
                anyhow::bail!(
                    "RADICLE_HTTPD_SOURCE=meilisearch requires a search backend to be configured"
                );
            }
            (None, Source::Sqlite) => None,
        };

        Ok(Self {
            profile: profile.clone(),
            cache: options.cache.map(Cache::new),
            web_config,
            source: options.source,
            search,
            repo_aliases: Arc::new(options.aliases.clone()),
        })
    }

    /// Resolve a repo path segment (RID or alias) to a [`RepoId`], mapping an
    /// unknown segment to [`Error::NotFound`].
    #[allow(clippy::result_large_err)]
    pub(crate) fn resolve_repo(&self, repo: &str) -> Result<RepoId, error::Error> {
        crate::resolve_rid(repo, &self.repo_aliases).ok_or(error::Error::NotFound)
    }

    /// Return the configured alias for a repo, if any. When several aliases
    /// point at the same repo, the lexicographically smallest is returned so
    /// the result is stable across requests.
    fn repo_alias(&self, rid: &RepoId) -> Option<String> {
        self.repo_aliases
            .iter()
            .filter(|(_, id)| *id == rid)
            .map(|(alias, _)| alias.clone())
            .min()
    }

    #[cfg(test)]
    pub fn set_repo_aliases(&mut self, aliases: HashMap<String, RepoId>) {
        self.repo_aliases = Arc::new(aliases);
    }

    /// The search backend, if one is configured and reachable at startup.
    /// `None` means listing and search use the storage walk.
    pub(crate) fn search(&self) -> Option<&Backend> {
        self.search.as_ref()
    }

    /// The data source this context reads derived state from.
    pub fn source(&self) -> Source {
        self.source
    }

    #[cfg(test)]
    pub fn set_search_backend(&mut self, source: Source, backend: Backend) {
        self.source = source;
        self.search = Some(backend);
    }

    #[allow(clippy::result_large_err)]
    pub(crate) fn repo_meta_sqlite(
        &self,
        repo: &Repository,
        doc: &radicle::identity::Doc,
    ) -> Result<RepoMeta, error::Error> {
        let aliases = self.profile.aliases();
        let alias_map: HashMap<NodeId, Alias> = doc
            .delegates()
            .iter()
            .filter_map(|did| {
                let nid = *did.as_key();
                aliases.alias(&nid).map(|a| (nid, a))
            })
            .collect();
        let db = &self.profile.database()?;
        let seeding = db.count(&repo.id()).unwrap_or_default();
        let issues = self
            .profile
            .issues(repo)
            .ok()
            .and_then(|i| i.counts().ok())
            .map(|c| search_repo::IssueCounts {
                open: c.open,
                closed: c.closed,
            });
        let patches = self
            .profile
            .patches(repo)
            .ok()
            .and_then(|p| p.counts().ok())
            .map(|c| search_repo::PatchCounts {
                open: c.open,
                draft: c.draft,
                archived: c.archived,
                merged: c.merged,
            });
        Ok(RepoMeta {
            seeding,
            issues,
            patches,
            releases: releases_meta(count_releases(repo)),
            aliases: alias_map,
        })
    }

    pub(crate) async fn aliases_for(
        &self,
        nids: Vec<NodeId>,
    ) -> Result<std::collections::HashMap<NodeId, radicle::node::Alias>, error::Error> {
        match self.source() {
            crate::Source::Meilisearch => Ok(self
                .search()
                .ok_or(error::Error::SearchUnavailable)?
                .get_aliases(&nids)
                .await?),
            crate::Source::Sqlite => {
                use radicle::node::AliasStore as _;
                let ctx = self.clone();
                blocking(move || {
                    let aliases = ctx.profile.aliases();
                    Ok(nids
                        .into_iter()
                        .filter_map(|nid| aliases.alias(&nid).map(|alias| (nid, alias)))
                        .collect())
                })
                .await
            }
        }
    }

    pub(crate) async fn repo_meta_meili(
        &self,
        rid: RepoId,
    ) -> Result<Option<RepoMeta>, error::Error> {
        let Some(backend) = self.search() else {
            return Err(error::Error::SearchUnavailable);
        };
        let Some(doc) = backend.get_repo_doc(rid).await? else {
            return Ok(None);
        };
        let nids = unique_nids(doc.delegates.iter().map(|did| *did.as_key()));
        let aliases = backend.get_aliases(&nids).await?;
        Ok(Some(meta_from_doc(&doc, aliases)))
    }

    #[allow(clippy::result_large_err)]
    pub fn repo_info(
        &self,
        repo: &Repository,
        doc: DocAt,
        meta: RepoMeta,
    ) -> Result<repo::Info, error::Error> {
        let DocAt { doc, .. } = doc;
        let rid = repo.id();

        let delegates = doc
            .delegates()
            .iter()
            .map(|did| json::Author::new(did).as_json(&meta.aliases))
            .collect::<Vec<_>>();

        let payloads: BTreeMap<PayloadId, Value> = doc
            .payload()
            .iter()
            .filter_map(|(id, payload)| {
                if id == &PayloadId::project() {
                    let (_, head) = repo.head().ok()?;
                    let issues = meta.issues?;
                    let patches = meta.patches?;
                    let mut project_meta = json!({
                        "head": head,
                        "issues": issues,
                        "patches": patches
                    });
                    if let Some(releases) = meta.releases {
                        project_meta["releases"] = json!(releases);
                    }

                    Some((
                        id.clone(),
                        json!({
                            "data": payload,
                            "meta": project_meta
                        }),
                    ))
                } else {
                    Some((id.clone(), json!({ "data": payload })))
                }
            })
            .collect();

        let refs = canonical_refs(repo, &doc)
            .inspect_err(|e| tracing::warn!("failed to read canonical refs for {rid}: {e}"))
            .unwrap_or_default();

        Ok(repo::Info {
            payloads,
            delegates,
            threshold: doc.threshold(),
            visibility: doc.visibility().clone(),
            rid,
            seeding: meta.seeding,
            refs,
            alias: self.repo_alias(&rid),
        })
    }

    /// Get a repository by RID, checking to make sure we're allowed to view it.
    #[allow(clippy::result_large_err)]
    pub fn repo(&self, rid: RepoId) -> Result<(Repository, DocAt), error::Error> {
        let repo = self.profile.storage.repository(rid)?;
        let doc = repo.identity_doc()?;
        // Don't allow accessing private repos.
        if doc.visibility().is_private() {
            return Err(Error::NotFound);
        }
        Ok((repo, doc))
    }

    /// Returns a reference to the thread-safe web configuration.
    ///
    /// Use this instead of accessing [`radicle::web::Config`] from the [`Profile`] to ensure
    /// you get the latest config after dynamic reloads.
    pub fn web_config(&self) -> &WebConfig {
        &self.web_config
    }

    #[cfg(test)]
    pub fn profile(&self) -> &Arc<Profile> {
        &self.profile
    }
}

#[cfg(feature = "artifacts")]
fn releases_meta(count: usize) -> Option<usize> {
    Some(count)
}

#[cfg(not(feature = "artifacts"))]
fn releases_meta(_count: usize) -> Option<usize> {
    None
}

#[cfg(feature = "artifacts")]
fn count_releases(repo: &Repository) -> usize {
    Releases::open(repo)
        .ok()
        .and_then(|releases| releases.count().ok())
        .unwrap_or_default()
}

#[cfg(not(feature = "artifacts"))]
fn count_releases(_repo: &Repository) -> usize {
    0
}

pub(crate) fn unique_nids(nids: impl IntoIterator<Item = NodeId>) -> Vec<NodeId> {
    nids.into_iter()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}

/// Run a blocking closure on the blocking thread pool.
///
/// Repository reads go through libgit2 and the COB cache, which are
/// synchronous and can take seconds on large repositories. Running them
/// directly in a handler would pin a runtime worker for the call's full
/// duration and let a slow read stall every other request. [`Context`] is
/// cheaply cloneable (it holds only `Arc`s), so callers move a clone into `f`.
pub(crate) async fn blocking<T, F>(f: F) -> Result<T, Error>
where
    F: FnOnce() -> Result<T, Error> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f).await?
}

pub trait ReadCanonicalRefs {
    fn find_by_pattern(
        &self,
        pattern: &git::fmt::refspec::QualifiedPattern,
    ) -> Result<Vec<(git::fmt::RefString, git::Oid)>, error::Error>;
}

pub trait PeelToCommit {
    fn peel_to_commit(&self, oid: git::Oid) -> Result<git::Oid, git::raw::Error>;
}

pub trait ResolveTag {
    fn resolve_tag(&self, oid: git::Oid) -> Result<repo::Tag, git::raw::Error>;
}

impl ReadCanonicalRefs for Repository {
    fn find_by_pattern(
        &self,
        pattern: &git::fmt::refspec::QualifiedPattern,
    ) -> Result<Vec<(git::fmt::RefString, git::Oid)>, error::Error> {
        let mut refs = Vec::new();
        for r in self.backend.references_glob(pattern.as_str())? {
            let r = r?;
            let Some(refname) = r
                .name()
                .ok()
                .and_then(|n| git::fmt::RefString::try_from(n).ok())
            else {
                continue;
            };
            let Some(oid) = r.target().map(git::Oid::from) else {
                continue;
            };
            refs.push((refname, oid));
        }
        Ok(refs)
    }
}

impl PeelToCommit for Repository {
    fn peel_to_commit(&self, oid: git::Oid) -> Result<git::Oid, git::raw::Error> {
        let obj = self.backend.find_object(oid.into(), None)?;
        let commit = obj.peel_to_commit()?;
        Ok(commit.id().into())
    }
}

impl ResolveTag for Repository {
    fn resolve_tag(&self, oid: git::Oid) -> Result<repo::Tag, git::raw::Error> {
        // Annotated tag: carries tagger/message.
        if let Ok(tag) = self.backend.find_tag(oid.into()) {
            return Ok(repo::Tag {
                commit: tag.target_id().into(),
                tagger: tag.tagger().map(|t| repo::Tagger {
                    name: t.name().unwrap_or_default().to_owned(),
                    email: t.email().unwrap_or_default().to_owned(),
                    timestamp: t.when().seconds(),
                }),
                message: tag.message().ok().flatten().map(str::to_owned),
            });
        }
        // Lightweight tag: ref points directly at a commit.
        let commit = self.backend.find_commit(oid.into())?;
        Ok(repo::Tag {
            commit: commit.id().into(),
            tagger: None,
            message: None,
        })
    }
}

#[allow(clippy::result_large_err)]
fn canonical_refs<R: ReadCanonicalRefs + PeelToCommit + ResolveTag>(
    repo: &R,
    doc: &radicle::identity::Doc,
) -> Result<repo::CanonicalReferences, error::Error> {
    let crefs = doc.canonical_refs()?;
    let raw: radicle::git::canonical::rules::RawRules = crefs.rules().clone().into();
    canonical_refs_for_patterns(repo, raw.iter().map(|(p, _)| p))
}

#[allow(clippy::result_large_err)]
fn canonical_refs_for_patterns<'a, R, I>(
    repo: &R,
    patterns: I,
) -> Result<repo::CanonicalReferences, error::Error>
where
    R: ReadCanonicalRefs + PeelToCommit + ResolveTag,
    I: IntoIterator<Item = &'a git::fmt::refspec::QualifiedPattern<'static>>,
{
    let mut canonical = repo::CanonicalReferences::default();
    for pattern in patterns {
        for (refname, oid) in repo.find_by_pattern(pattern)? {
            if refname.as_str().starts_with("refs/tags/") {
                match repo.resolve_tag(oid) {
                    Ok(tag) => {
                        canonical.tags.insert(refname, tag);
                    }
                    Err(e) => tracing::warn!("skipping canonical tag {refname}: {e}"),
                }
            } else {
                match repo.peel_to_commit(oid) {
                    Ok(commit) => {
                        canonical.refs.insert(refname, commit);
                    }
                    Err(e) => tracing::warn!("skipping canonical ref {refname}: {e}"),
                }
            }
        }
    }
    Ok(canonical)
}

pub fn router(ctx: Context) -> Router {
    Router::new()
        .route("/", get(root_handler))
        .merge(v1::router(ctx))
}

async fn root_handler() -> impl IntoResponse {
    let response = json!({
        "path": "/api",
        "links": [
            {
                "href": "/v1",
                "rel": "v1",
                "type": "GET"
            }
        ]
    });

    Json(response)
}

mod search {
    use std::cmp::Ordering;
    use std::collections::BTreeMap;

    use serde::{Deserialize, Serialize};
    use serde_json::json;

    use radicle::identity::doc::{Payload, PayloadId};
    use radicle::identity::RepoId;
    use radicle::node::routing::Store;
    use radicle::node::{AliasStore, Database};
    use radicle::profile::Aliases;
    use radicle::storage::RepositoryInfo;

    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SearchQueryString {
        pub q: Option<String>,
        pub page: Option<usize>,
        pub per_page: Option<usize>,
    }

    #[derive(Serialize, Deserialize, Eq, Debug)]
    pub struct SearchResult {
        pub rid: RepoId,
        pub payloads: BTreeMap<PayloadId, Payload>,
        pub delegates: Vec<serde_json::Value>,
        pub seeds: usize,
        #[serde(skip)]
        pub index: usize,
    }

    impl SearchResult {
        pub fn new(
            q: &str,
            info: RepositoryInfo,
            db: &Database,
            aliases: &Aliases,
        ) -> Option<Self> {
            if info.doc.visibility().is_private() {
                return None;
            }
            let Ok(Some(index)) = info.doc.project().map(|p| p.name().find(q)) else {
                return None;
            };
            let seeds = db.count(&info.rid).unwrap_or_default();
            let delegates = info
                .doc
                .delegates()
                .iter()
                .map(|did| match aliases.alias(did) {
                    Some(alias) => json!({
                        "id": did,
                        "alias": alias,
                    }),
                    None => json!({
                        "id": did,
                    }),
                })
                .collect::<Vec<_>>();

            Some(SearchResult {
                rid: info.rid,
                payloads: info.doc.payload().clone(),
                delegates,
                seeds,
                index,
            })
        }
    }

    impl Ord for SearchResult {
        fn cmp(&self, other: &Self) -> Ordering {
            let primary = match (self.index, other.index) {
                (0, 0) => self.seeds.cmp(&other.seeds),
                (0, _) => Ordering::Less,
                (_, 0) => Ordering::Greater,
                _ => self.seeds.cmp(&other.seeds),
            };
            primary.then_with(|| self.rid.cmp(&other.rid))
        }
    }

    impl PartialOrd for SearchResult {
        fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
            Some(self.cmp(other))
        }
    }

    impl PartialEq for SearchResult {
        fn eq(&self, other: &Self) -> bool {
            self.rid == other.rid
        }
    }
}

mod repo {
    use std::collections::BTreeMap;

    use serde::Serialize;
    use serde_json::Value;

    use radicle::git::fmt::RefString;
    use radicle::git::Oid;
    use radicle::identity::doc::PayloadId;
    use radicle::identity::{RepoId, Visibility};

    #[derive(Default, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CanonicalReferences {
        pub tags: BTreeMap<RefString, Tag>,
        pub refs: BTreeMap<RefString, Oid>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Tag {
        pub commit: Oid,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub tagger: Option<Tagger>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub message: Option<String>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Tagger {
        pub name: String,
        pub email: String,
        pub timestamp: i64,
    }

    /// Repos info.
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Info {
        pub payloads: BTreeMap<PayloadId, Value>,
        pub delegates: Vec<Value>,
        pub threshold: usize,
        pub visibility: Visibility,
        pub rid: RepoId,
        pub seeding: usize,
        pub refs: CanonicalReferences,
        /// The alias configured for this repo via `--alias`, if any.
        #[serde(skip_serializing_if = "Option::is_none")]
        pub alias: Option<String>,
    }
}

#[cfg(test)]
mod tests {
    use crate::test;

    #[test]
    fn meta_from_doc_maps_counts_and_seeding() {
        use radicle::storage::{ReadRepository as _, ReadStorage as _};
        use radicle_search::index::repo::{Activity, IssueCounts, PatchCounts};
        use std::str::FromStr;

        let tmp = tempfile::tempdir().unwrap();
        let ctx = crate::test::seed(tmp.path());
        let rid = radicle::identity::RepoId::from_str(crate::test::RID).unwrap();
        let repo = ctx.profile().storage.repository(rid).unwrap();
        let identity = repo.identity_doc().unwrap();

        let doc = radicle_search::index::repo::Document::new(
            rid,
            &identity.doc,
            Activity::empty(),
            7,
            IssueCounts { open: 2, closed: 1 },
            PatchCounts {
                open: 1,
                draft: 0,
                archived: 0,
                merged: 3,
            },
            0,
        )
        .unwrap();

        let meta = super::meta_from_doc(&doc, Default::default());

        assert_eq!(meta.seeding, 7);
        assert_eq!(meta.issues.unwrap().open, 2);
        assert_eq!(meta.patches.unwrap().merged, 3);
        assert!(meta.aliases.is_empty());
    }

    #[test]
    fn repo_meta_sqlite_drops_project_payload_on_cob_cache_failure() {
        use radicle::storage::{ReadRepository as _, ReadStorage as _};
        use std::str::FromStr;

        let tmp = tempfile::tempdir().unwrap();
        let ctx = crate::test::seed(tmp.path());
        let rid = radicle::identity::RepoId::from_str(crate::test::RID).unwrap();
        let repo = ctx.profile().storage.repository(rid).unwrap();
        let doc = repo.identity_doc().unwrap();

        let cobs_dir = ctx.profile().home.cobs();
        for entry in std::fs::read_dir(&cobs_dir).unwrap().flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().ends_with(".db") {
                std::fs::write(entry.path(), b"not a sqlite database").unwrap();
            }
        }

        let meta = ctx.repo_meta_sqlite(&repo, &doc.doc).unwrap();
        assert!(meta.issues.is_none());
        assert!(meta.patches.is_none());

        let info = ctx.repo_info(&repo, doc, meta).unwrap();
        assert!(!info
            .payloads
            .contains_key(&radicle::identity::doc::PayloadId::project()));
    }

    #[tokio::test]
    async fn test_web_config_accessor() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());

        let config = ctx.web_config.read().await;
        assert_eq!(config.pinned.repositories.len(), 0);
    }

    #[tokio::test]
    async fn test_web_config_reload_simulation() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());

        {
            let config = ctx.web_config.read().await;
            assert_eq!(config.pinned.repositories.len(), 0);
            assert_eq!(config.description, None);
        }

        {
            ctx.web_config
                .update(|config| {
                    config.description = Some("Updated description".to_string());
                    config.avatar_url = Some("https://example.com/avatar.png".to_string());
                })
                .await;
        }

        {
            let config = ctx.web_config.read().await;
            assert_eq!(config.description, Some("Updated description".to_string()));
            assert_eq!(
                config.avatar_url,
                Some("https://example.com/avatar.png".to_string())
            );
        }
    }

    #[tokio::test]
    async fn test_web_config_concurrent_reads() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());

        let mut handles = vec![];
        for _ in 0..10 {
            let ctx_clone = ctx.clone();
            let handle = tokio::spawn(async move {
                let config = ctx_clone.web_config.read().await;
                config.pinned.repositories.len()
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.await.unwrap();
        }
    }

    #[tokio::test]
    async fn test_web_config_preserves_data_across_reads() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());

        {
            ctx.web_config
                .update(|config| {
                    config.banner_url = Some("https://example.com/banner.png".to_string());
                })
                .await;
        }

        for _ in 0..5 {
            let config = ctx.web_config.read().await;
            assert_eq!(
                config.banner_url,
                Some("https://example.com/banner.png".to_string())
            );
        }
    }

    #[tokio::test]
    async fn test_profile_immutable_after_reload() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let original_key = ctx.profile.public_key;
        let original_home = ctx.profile.home.path().to_path_buf();

        {
            ctx.web_config
                .update(|config| {
                    config.description = Some("Updated".to_string());
                    config.avatar_url = Some("https://example.com/new-avatar.png".to_string());
                })
                .await;
        }

        assert_eq!(ctx.profile.public_key, original_key);
        assert_eq!(ctx.profile.home.path(), original_home);
    }

    #[tokio::test]
    async fn test_empty_pinned_repos_transitions() {
        use radicle::identity::RepoId;
        use std::str::FromStr;

        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());

        assert_eq!(ctx.web_config.read().await.pinned.repositories.len(), 0);

        let rid1 = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let rid2 = RepoId::from_str("rad:z4GypKmh1gkEfmkXtarcYnkvtFUfE").unwrap();

        {
            ctx.web_config
                .update(|config| {
                    config.pinned.repositories.insert(rid1);
                    config.pinned.repositories.insert(rid2);
                })
                .await;
        }
        assert_eq!(ctx.web_config.read().await.pinned.repositories.len(), 2);

        {
            ctx.web_config
                .update(|config| {
                    config.pinned.repositories.clear();
                })
                .await;
        }
        assert_eq!(ctx.web_config.read().await.pinned.repositories.len(), 0);
    }

    mod refs {
        use std::str::FromStr;

        use radicle::git::fmt::RefStr;
        use radicle::identity::RepoId;
        use radicle::storage::{ReadRepository, ReadStorage};

        use crate::test;

        fn r(s: &str) -> &RefStr {
            RefStr::try_from_str(s).unwrap()
        }

        #[test]
        fn test_canonical_refs_synthesized_without_config() {
            let tmp = tempfile::tempdir().unwrap();
            let ctx = test::seed(tmp.path());
            let rid = RepoId::from_str(test::RID).unwrap();

            let repo = ctx.profile.storage.repository(rid).unwrap();
            let doc = repo.identity_doc().unwrap();

            let refs = super::super::canonical_refs(&repo, &doc.doc).unwrap();
            assert!(refs.tags.is_empty());
            assert!(refs.refs.contains_key(r("refs/heads/master")));
        }

        #[test]
        fn test_repo_info_includes_refs() {
            let tmp = tempfile::tempdir().unwrap();
            let ctx = test::seed(tmp.path());
            let rid = RepoId::from_str(test::RID).unwrap();

            let (repo, doc) = ctx.repo(rid).unwrap();
            let meta = ctx.repo_meta_sqlite(&repo, &doc.doc).unwrap();
            let info = ctx.repo_info(&repo, doc, meta).unwrap();

            assert!(info.refs.tags.is_empty());
            assert!(info.refs.refs.contains_key(r("refs/heads/master")));
        }

        #[test]
        fn test_multi_peer_canonical_refs() {
            let tmp = tempfile::tempdir().unwrap();
            let ctx = test::seed_multi_peer(tmp.path());
            let rid = RepoId::from_str(test::RID).unwrap();

            let repo = ctx.profile.storage.repository(rid).unwrap();
            let doc = repo.identity_doc().unwrap();

            let refs = super::super::canonical_refs(&repo, &doc.doc).unwrap();

            assert!(refs.refs.contains_key(r("refs/heads/master")));
            assert!(refs.tags.contains_key(r("refs/tags/v1.0")));
            assert!(refs.refs.contains_key(r("refs/heads/feature/branch")));
            assert!(!refs.tags.contains_key(r("refs/tags/v2.0-rc")));
            // Fixture uses a lightweight tag (ref → commit, no tag object).
            let tag = refs.tags.get(r("refs/tags/v1.0")).unwrap();
            assert!(tag.tagger.is_none());
            assert!(tag.message.is_none());
        }

        mod mock {
            use std::collections::HashMap;
            use std::str::FromStr;

            use radicle::git;
            use radicle::git::fmt::refspec::{PatternString, QualifiedPattern};
            use radicle::git::fmt::RefString;

            use crate::api::error;
            use crate::api::{
                canonical_refs_for_patterns, repo, PeelToCommit, ReadCanonicalRefs, ResolveTag,
            };

            struct StubRepo {
                refs: HashMap<String, Vec<(RefString, git::Oid)>>,
                peel_errors: HashMap<git::Oid, String>,
                annotated_tags: HashMap<git::Oid, (String, String, i64, String)>,
            }

            impl ReadCanonicalRefs for StubRepo {
                fn find_by_pattern(
                    &self,
                    pattern: &QualifiedPattern,
                ) -> Result<Vec<(RefString, git::Oid)>, error::Error> {
                    Ok(self.refs.get(pattern.as_str()).cloned().unwrap_or_default())
                }
            }

            impl PeelToCommit for StubRepo {
                fn peel_to_commit(&self, oid: git::Oid) -> Result<git::Oid, git::raw::Error> {
                    if let Some(msg) = self.peel_errors.get(&oid) {
                        Err(git::raw::Error::from_str(msg))
                    } else {
                        Ok(oid)
                    }
                }
            }

            impl ResolveTag for StubRepo {
                fn resolve_tag(&self, oid: git::Oid) -> Result<repo::Tag, git::raw::Error> {
                    if let Some(msg) = self.peel_errors.get(&oid) {
                        return Err(git::raw::Error::from_str(msg));
                    }
                    let (tagger, message) = self
                        .annotated_tags
                        .get(&oid)
                        .map(|(name, email, ts, msg)| {
                            (
                                Some(repo::Tagger {
                                    name: name.clone(),
                                    email: email.clone(),
                                    timestamp: *ts,
                                }),
                                Some(msg.clone()),
                            )
                        })
                        .unwrap_or((None, None));
                    Ok(repo::Tag {
                        commit: oid,
                        tagger,
                        message,
                    })
                }
            }

            fn pat(s: &str) -> QualifiedPattern<'static> {
                QualifiedPattern::from_patternstr(&PatternString::try_from(s).unwrap())
                    .unwrap()
                    .to_owned()
            }

            fn oid(hex: &str) -> git::Oid {
                git::Oid::from_str(hex).unwrap()
            }

            fn refname(s: &str) -> RefString {
                RefString::try_from(s).unwrap()
            }

            #[test]
            fn classifies_tags_and_non_tags() {
                let head = oid("1111111111111111111111111111111111111111");
                let tag = oid("2222222222222222222222222222222222222222");
                let heads = pat("refs/heads/*");
                let tags = pat("refs/tags/*");
                let stub = StubRepo {
                    refs: HashMap::from([
                        (
                            heads.as_str().to_owned(),
                            vec![(refname("refs/heads/main"), head)],
                        ),
                        (
                            tags.as_str().to_owned(),
                            vec![(refname("refs/tags/v1"), tag)],
                        ),
                    ]),
                    peel_errors: HashMap::new(),
                    annotated_tags: HashMap::new(),
                };

                let result = canonical_refs_for_patterns(&stub, [&heads, &tags]).unwrap();
                assert_eq!(result.refs.get(&refname("refs/heads/main")), Some(&head));
                assert_eq!(
                    result.tags.get(&refname("refs/tags/v1")).map(|t| t.commit),
                    Some(tag),
                );
                assert!(!result.tags.contains_key(&refname("refs/heads/main")));
                assert!(!result.refs.contains_key(&refname("refs/tags/v1")));
            }

            #[test]
            fn annotated_tag_metadata_is_included() {
                let tag = oid("3333333333333333333333333333333333333333");
                let pattern = pat("refs/tags/*");
                let stub = StubRepo {
                    refs: HashMap::from([(
                        pattern.as_str().to_owned(),
                        vec![(refname("refs/tags/v1"), tag)],
                    )]),
                    peel_errors: HashMap::new(),
                    annotated_tags: HashMap::from([(
                        tag,
                        (
                            "Alice".to_owned(),
                            "alice@example.com".to_owned(),
                            1700000000i64,
                            "Release v1".to_owned(),
                        ),
                    )]),
                };

                let result = canonical_refs_for_patterns(&stub, [&pattern]).unwrap();
                let resolved = result.tags.get(&refname("refs/tags/v1")).unwrap();
                assert_eq!(resolved.message.as_deref(), Some("Release v1"));
                let tagger = resolved.tagger.as_ref().unwrap();
                assert_eq!(tagger.name, "Alice");
                assert_eq!(tagger.email, "alice@example.com");
                assert_eq!(tagger.timestamp, 1700000000);
            }

            #[test]
            fn skips_refs_whose_peel_fails() {
                let good = oid("1111111111111111111111111111111111111111");
                let bad = oid("2222222222222222222222222222222222222222");
                let heads = pat("refs/heads/*");
                let stub = StubRepo {
                    refs: HashMap::from([(
                        heads.as_str().to_owned(),
                        vec![
                            (refname("refs/heads/ok"), good),
                            (refname("refs/heads/broken"), bad),
                        ],
                    )]),
                    peel_errors: HashMap::from([(bad, "missing".to_owned())]),
                    annotated_tags: HashMap::new(),
                };

                let result = canonical_refs_for_patterns(&stub, [&heads]).unwrap();
                assert_eq!(result.refs.get(&refname("refs/heads/ok")), Some(&good));
                assert!(!result.refs.contains_key(&refname("refs/heads/broken")));
            }

            #[test]
            fn empty_patterns_yield_empty_result() {
                let stub = StubRepo {
                    refs: HashMap::new(),
                    peel_errors: HashMap::new(),
                    annotated_tags: HashMap::new(),
                };
                let result: Vec<&QualifiedPattern<'static>> = vec![];
                let result = canonical_refs_for_patterns(&stub, result).unwrap();
                assert!(result.refs.is_empty());
                assert!(result.tags.is_empty());
            }
        }
    }
}
