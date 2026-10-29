mod bootstrap;
pub(crate) mod build;
mod event;

use std::collections::{BTreeSet, HashSet};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use radicle::Profile;
use radicle::identity::RepoId;
use radicle::node::{Alias, Event, Features, Handle as _, NodeId};
use radicle::storage::{ReadRepository, ReadStorage};
use tokio::sync::{RwLock, mpsc, watch};

use crate::config::Config;
use crate::index::{Indexes, client, cob, release, repo};

const UPSERT_BATCH: usize = 100;
const EVENT_CHANNEL_CAPACITY: usize = 1024;

struct BootstrapPayload {
    repo_docs: Vec<repo::Document>,
    seeded: HashSet<repo::DocumentKey>,
    issue_docs: Vec<cob::Document>,
    patch_docs: Vec<cob::Document>,
    release_docs: Vec<release::Document>,
    node_docs: Vec<crate::index::node::Document>,
    policy_docs: Vec<crate::index::policy::Document>,
    inventory_docs: Vec<crate::index::inventory::Document>,
}

pub struct Indexer {
    profile: Arc<Profile>,
    indexes: Arc<Indexes>,
    config: Config,
    seeded: Seeded,
}

/// An in-memory cache of locally-seeded repositories, given by their [`repo::RepoDocumentKey`].
///
/// It is used as a fast filter in the event hot path. It is refreshed at the
/// end of every bootstrap process, and will be stale between re-scans, i.e., a
/// new `rad seed` will not be picked up until the next re-scan.
struct Seeded {
    inner: Arc<RwLock<HashSet<repo::DocumentKey>>>,
}

impl Seeded {
    fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    async fn insert(&self, key: repo::DocumentKey) -> bool {
        self.inner.write().await.insert(key)
    }

    async fn remove(&self, key: &repo::DocumentKey) -> bool {
        self.inner.write().await.remove(key)
    }

    async fn reconcile(
        &self,
        before: &HashSet<repo::DocumentKey>,
        scanned: HashSet<repo::DocumentKey>,
    ) {
        let mut inner = self.inner.write().await;
        let inserted: Vec<_> = inner.difference(before).copied().collect();
        *inner = scanned;
        inner.extend(inserted);
    }

    async fn contains(&self, key: &repo::DocumentKey) -> bool {
        self.inner.read().await.contains(key)
    }

    async fn as_inner(&self) -> HashSet<repo::DocumentKey> {
        self.inner.read().await.clone()
    }
}

impl Indexer {
    pub fn new(profile: Arc<Profile>, indexes: Arc<Indexes>, config: Config) -> Self {
        Self {
            profile,
            indexes,
            config,
            seeded: Seeded::new(),
        }
    }

    pub async fn bootstrap(&self) -> Result<()> {
        tracing::info!("starting full storage rescan");
        let profile = self.profile.clone();
        let previous_seeded = self.seeded.as_inner().await;

        let handler = bootstrap::Bootstrap::new(previous_seeded.clone());
        let BootstrapPayload {
            repo_docs,
            seeded,
            issue_docs,
            patch_docs,
            release_docs,
            node_docs,
            policy_docs,
            inventory_docs,
        } = tokio::task::spawn_blocking(move || -> Result<BootstrapPayload> {
            use radicle::node::routing::Store as _;

            let policies = profile.policies()?;
            let db = profile.database()?;
            let repos = profile.storage.repositories()?;

            let seeds = repos
                .iter()
                .filter(|info| info.doc.visibility().is_public())
                .map(|info| {
                    let seeding_policy = match policies.is_seeding(&info.rid) {
                        Ok(true) => bootstrap::SeedingPolicy::IsSeeding,
                        Ok(false) => bootstrap::SeedingPolicy::NotSeeding,
                        Err(e) => {
                            tracing::warn!(
                                "policy lookup for {} failed: {e:#}; preserving prior state",
                                info.rid
                            );
                            bootstrap::SeedingPolicy::LookupFailure
                        }
                    };
                    bootstrap::RepoSeed {
                        rid: info.rid,
                        seeding_policy,
                    }
                });

            let plan = handler.plan(seeds);

            let mut docs = Vec::with_capacity(plan.to_index.len());
            let mut issue_docs: Vec<cob::Document> = Vec::new();
            let mut patch_docs: Vec<cob::Document> = Vec::new();
            let mut release_docs: Vec<release::Document> = Vec::new();
            let mut remote_nids: BTreeSet<NodeId> = BTreeSet::new();
            for info in repos
                .iter()
                .filter(|info| plan.to_index.contains(&info.rid))
            {
                match build::document(&profile, &db, info.rid, &info.doc) {
                    Ok(Some(mut doc)) => {
                        let repo = match profile.storage.repository(info.rid) {
                            Ok(r) => r,
                            Err(e) => {
                                tracing::warn!("skipping {}: {e:#}", info.rid);
                                continue;
                            }
                        };
                        match repo.remotes() {
                            Ok(remotes) => {
                                remote_nids.extend(
                                    remotes
                                        .filter_map(|r| {
                                            r.inspect_err(|e| {
                                                tracing::warn!(
                                                    "{}: skipping unreadable remote: {e:#}",
                                                    info.rid
                                                )
                                            })
                                            .ok()
                                        })
                                        .map(|(id, _)| id),
                                );
                            }
                            Err(e) => {
                                tracing::warn!("{}: reading remotes failed: {e:#}", info.rid);
                            }
                        }
                        let cob_docs = build_cob_docs(&profile, &repo, info.rid);
                        doc.release_count = cob_docs.releases.len() as u64;
                        issue_docs.extend(cob_docs.issues);
                        patch_docs.extend(cob_docs.patches);
                        release_docs.extend(cob_docs.releases);
                        docs.push(doc);
                    }
                    Ok(None) => {}
                    Err(e) => tracing::warn!("skipping {}: {e:#}", info.rid),
                }
            }

            let node_docs = build::node_documents(&profile, &db, remote_nids)?;
            let policy_docs = build::policy_documents(&profile)?;
            let inventory_docs = build::inventory_documents(db.entries()?);

            Ok(BootstrapPayload {
                repo_docs: docs,
                seeded: plan.seeded,
                issue_docs,
                patch_docs,
                release_docs,
                node_docs,
                policy_docs,
                inventory_docs,
            })
        })
        .await
        .context("bootstrap blocking task panicked")??;

        let total = repo_docs.len();
        tracing::info!("indexing {total} repositories");
        upsert_all(
            "repositories",
            &self.indexes.repos,
            &repo_docs,
            repo::Document::PRIMARY_KEY,
        )
        .await;

        let issue_ids: HashSet<String> = issue_docs.iter().map(|d| d.id.clone()).collect();
        let patch_ids: HashSet<String> = patch_docs.iter().map(|d| d.id.clone()).collect();
        let release_ids: HashSet<String> = release_docs.iter().map(|d| d.id.clone()).collect();
        let node_ids: HashSet<String> = node_docs.iter().map(|d| d.id.clone()).collect();
        let policy_ids: HashSet<String> = policy_docs.iter().map(|d| d.id.to_string()).collect();
        let inventory_ids: HashSet<String> = inventory_docs.iter().map(|d| d.id.clone()).collect();

        upsert_all(
            "issues",
            &self.indexes.issues,
            &issue_docs,
            cob::Document::PRIMARY_KEY,
        )
        .await;
        upsert_all(
            "patches",
            &self.indexes.patches,
            &patch_docs,
            cob::Document::PRIMARY_KEY,
        )
        .await;
        upsert_all(
            "releases",
            &self.indexes.releases,
            &release_docs,
            release::Document::PRIMARY_KEY,
        )
        .await;
        upsert_all(
            "nodes",
            &self.indexes.nodes,
            &node_docs,
            crate::index::node::Document::PRIMARY_KEY,
        )
        .await;
        upsert_all(
            "policies",
            &self.indexes.policies,
            &policy_docs,
            crate::index::policy::Document::PRIMARY_KEY,
        )
        .await;
        upsert_all(
            "inventory docs",
            &self.indexes.inventory,
            &inventory_docs,
            crate::index::inventory::Document::PRIMARY_KEY,
        )
        .await;

        self.seeded
            .reconcile(&previous_seeded, seeded.clone())
            .await;

        let removed = match self.indexes.repos.list_doc_ids().await {
            Ok(meili_ids) => {
                let meili_keys: HashSet<repo::DocumentKey> = meili_ids
                    .iter()
                    .filter_map(|s| {
                        RepoId::from_canonical(s)
                            .map(repo::DocumentKey::new)
                            .map_err(|e| {
                                tracing::warn!("skipping unparseable meili id {s:?}: {e:#}");
                                e
                            })
                            .ok()
                    })
                    .collect();
                let orphans = bootstrap::orphans(seeded.clone(), &meili_keys);
                if !orphans.is_empty() {
                    tracing::info!("removing {} orphan documents from index", orphans.len());
                    if let Err(e) = self
                        .indexes
                        .repos
                        .delete_many(&orphans.iter().map(|k| k.to_string()).collect::<Vec<_>>())
                        .await
                    {
                        tracing::warn!("orphan delete failed: {e:#}");
                    }
                }
                orphans.len()
            }
            Err(e) => {
                tracing::warn!(
                    "listing meili documents for reconciliation failed: {e:#}; \
                     skipping orphan delete this cycle"
                );
                0
            }
        };

        // Mirror indexes: plain id diff against the freshly built sets. The
        // freshly built issue/patch sets only ever contain documents for
        // repos still in `plan.to_index`, so this single diff covers both a
        // repo dropped from seeding entirely and an individual cob (e.g. a
        // redacted issue) removed from a repo that's still seeded.
        for (label, index, current) in [
            ("issues", &self.indexes.issues, issue_ids),
            ("patches", &self.indexes.patches, patch_ids),
            ("releases", &self.indexes.releases, release_ids),
            ("nodes", &self.indexes.nodes, node_ids),
            ("policies", &self.indexes.policies, policy_ids),
            ("inventory", &self.indexes.inventory, inventory_ids),
        ] {
            match index.list_doc_ids().await {
                Ok(ids) => {
                    let orphans = bootstrap::orphan_ids(&current, &ids);
                    if !orphans.is_empty()
                        && let Err(e) = index.delete_many(&orphans).await
                    {
                        tracing::warn!("{label}: orphan delete failed: {e:#}");
                    }
                }
                Err(e) => tracing::warn!("{label}: listing ids failed: {e:#}"),
            }
        }

        tracing::info!("rescan complete ({total} indexed, {removed} removed)");
        Ok(())
    }

    /// Bring the index in sync with the current local state of `rid`. If
    /// we're still seeding it, upsert a fresh document. If we've dropped
    /// it (or it's no longer indexable), delete the document and prune
    /// the seeded cache.
    pub async fn reindex(&self, rid: RepoId) -> Result<()> {
        let key = repo::DocumentKey::new(rid);
        let profile = self.profile.clone();
        let action = tokio::task::spawn_blocking(move || -> Result<ReindexAction> {
            let policies = profile.policies()?;
            // Propagate on lookup failure rather than treating it as
            // "not seeded" — a transient sqlite error would otherwise
            // delete the entry and prune the cache until the next full
            // rescan.
            if !policies.is_seeding(&rid)? {
                return Ok(ReindexAction::Delete);
            }
            let db = profile.database()?;
            let doc = {
                let repo = profile.storage.repository(rid)?;
                repo.identity_doc()?
            };
            match build::document(&profile, &db, rid, &doc)? {
                Some(mut repo_doc) => {
                    let repo = profile.storage.repository(rid)?;
                    let cob_docs = build_cob_docs(&profile, &repo, rid);
                    repo_doc.release_count = cob_docs.releases.len() as u64;
                    Ok(ReindexAction::Upsert {
                        repo_doc: Box::new(repo_doc),
                        cob_docs,
                    })
                }
                None => Ok(ReindexAction::Delete),
            }
        })
        .await
        .context("reindex blocking task panicked")??;

        match action {
            ReindexAction::Upsert { repo_doc, cob_docs } => {
                self.indexes
                    .repos
                    .upsert(
                        std::slice::from_ref(&*repo_doc),
                        repo::Document::PRIMARY_KEY,
                    )
                    .await?;
                for chunk in cob_docs.issues.chunks(UPSERT_BATCH) {
                    self.indexes
                        .issues
                        .upsert(chunk, cob::Document::PRIMARY_KEY)
                        .await?;
                }
                for chunk in cob_docs.patches.chunks(UPSERT_BATCH) {
                    self.indexes
                        .patches
                        .upsert(chunk, cob::Document::PRIMARY_KEY)
                        .await?;
                }
                for chunk in cob_docs.releases.chunks(UPSERT_BATCH) {
                    self.indexes
                        .releases
                        .upsert(chunk, release::Document::PRIMARY_KEY)
                        .await?;
                }
            }
            ReindexAction::Delete => {
                tracing::info!("removing {rid} from index (no longer seeded)");
                self.indexes.repos.delete(&key.to_string()).await?;
                let filter = crate::query::eq_filter("rid", rid);
                self.indexes.issues.delete_by_filter(&filter).await?;
                self.indexes.patches.delete_by_filter(&filter).await?;
                self.indexes.releases.delete_by_filter(&filter).await?;
                self.seeded.remove(&key).await;
            }
        }
        Ok(())
    }

    pub(crate) async fn handle_event(
        &self,
        event: &Event,
        pending: &mut HashSet<RepoId>,
    ) -> Result<()> {
        let Some(class) = event::classify_event(event) else {
            tracing::debug!("ignored event: {}", event::event_kind(event));
            return Ok(());
        };
        match class {
            event::EventClass::Repo(rid, category) => {
                self.handle_repo_event(rid, category, event, pending).await
            }
            event::EventClass::Node {
                nid,
                alias,
                features,
            } => self.handle_node_event(nid, alias, features).await,
            event::EventClass::Inventory { nid, inventory } => {
                self.handle_inventory_event(nid, inventory).await
            }
        }
    }

    async fn handle_repo_event(
        &self,
        rid: RepoId,
        category: event::EventCategory,
        event: &Event,
        pending: &mut HashSet<RepoId>,
    ) -> Result<()> {
        let key = repo::DocumentKey::new(rid);
        let is_seeded = self.seeded.contains(&key).await;
        match event::event_action(category, is_seeded) {
            event::EventAction::Reindex => {}
            event::EventAction::DiscoverAndReindex => {
                self.seeded.insert(key).await;
                tracing::info!("discovered new local seed: {rid}");
            }
        }
        if pending.insert(rid) {
            tracing::debug!(
                "queued reindex of {rid} (event: {})",
                event::event_kind(event)
            );
        }
        Ok(())
    }

    async fn handle_node_event(&self, nid: NodeId, alias: Alias, features: Features) -> Result<()> {
        let profile = self.profile.clone();
        let doc = tokio::task::spawn_blocking(move || {
            let db = profile.database()?;
            build::node_document_from_announcement(&profile, &db, nid, alias, features)
        })
        .await
        .context("node doc task panicked")?;
        let doc = match doc {
            Ok(Some(doc)) => doc,
            Ok(None) => {
                tracing::debug!("ignoring announcement from non-seed node {nid}");
                return Ok(());
            }
            Err(e) => {
                tracing::warn!("node doc for {nid} failed: {e:#}");
                return Ok(());
            }
        };
        if let Err(e) = self
            .indexes
            .nodes
            .upsert(
                std::slice::from_ref(&doc),
                crate::index::node::Document::PRIMARY_KEY,
            )
            .await
        {
            tracing::warn!("node doc upsert for {nid} failed: {e:#}");
        }
        Ok(())
    }

    async fn handle_inventory_event(&self, nid: NodeId, inventory: Vec<RepoId>) -> Result<()> {
        let doc = crate::index::inventory::Document::new(nid, inventory);
        if let Err(e) = self
            .indexes
            .inventory
            .upsert(
                std::slice::from_ref(&doc),
                crate::index::inventory::Document::PRIMARY_KEY,
            )
            .await
        {
            tracing::warn!("inventory doc upsert for {nid} failed: {e:#}");
        }
        Ok(())
    }

    pub async fn run(&self, mut shutdown: watch::Receiver<bool>) -> Result<()> {
        tokio::select! {
            _ = shutdown.changed() => return Ok(()),
            res = self.bootstrap() => res?,
        }

        let mut rescan_timer = tokio::time::interval(self.config.rescan_interval);
        rescan_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        rescan_timer.tick().await;

        let mut pending = HashSet::new();
        let mut batch_timer = tokio::time::interval(self.config.batch_interval);
        batch_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        batch_timer.tick().await;

        let (tx, mut rx) = mpsc::channel::<Feed>(EVENT_CHANNEL_CAPACITY);
        let reader = tokio::spawn(read_events(
            self.profile.clone(),
            self.config.reconnect_backoff,
            shutdown.clone(),
            tx,
        ));

        let mut work: Option<Pin<Box<dyn Future<Output = ()> + '_>>> = None;
        loop {
            tokio::select! {
                _ = shutdown.changed() => break,
                feed = rx.recv() => {
                    let event = match feed {
                        Some(Feed::Event(event)) => event,
                        Some(Feed::Resubscribed) => {
                            rescan_timer.reset_immediately();
                            continue;
                        }
                        None => break,
                    };
                    self.handle_event(&event, &mut pending).await?;
                }
                () = async {
                    if let Some(work) = work.as_mut() {
                        work.await;
                    }
                }, if work.is_some() => work = None,
                _ = batch_timer.tick(), if work.is_none() => {
                    if !pending.is_empty() {
                        work = Some(Box::pin(self.reindex_batch(pending.drain().collect())));
                    }
                }
                _ = rescan_timer.tick(), if work.is_none() => {
                    work = Some(Box::pin(self.rescan()));
                }
            }
        }

        drop(rx);
        reader.await.context("event reader task panicked")?;
        Ok(())
    }

    async fn reindex_batch(&self, rids: Vec<RepoId>) {
        tracing::info!("reindexing {} repositories (batched)", rids.len());
        for rid in rids {
            if let Err(e) = self.reindex(rid).await {
                tracing::warn!("reindex {} failed: {e:#}", rid);
            }
        }
    }

    async fn rescan(&self) {
        if let Err(e) = self.bootstrap().await {
            tracing::warn!("periodic rescan failed: {e:#}");
        }
    }
}

enum Feed {
    Event(Event),
    Resubscribed,
}

async fn read_events(
    profile: Arc<Profile>,
    reconnect_backoff: Duration,
    mut shutdown: watch::Receiver<bool>,
    tx: mpsc::Sender<Feed>,
) {
    let mut resubscribing = false;
    loop {
        let socket = profile.home().socket_from_env();
        tracing::info!("subscribing to node events at {}", socket.display());
        let node = radicle::Node::new(&socket);
        let feed = tx.clone();
        let blocking_shutdown = shutdown.clone();
        let res = tokio::task::spawn_blocking(move || -> Result<()> {
            let events = node
                .subscribe(Duration::from_secs(1))
                .context("subscribe to node socket failed")?;
            if resubscribing && feed.blocking_send(Feed::Resubscribed).is_err() {
                return Ok(());
            }
            for event in events {
                if *blocking_shutdown.borrow() {
                    break;
                }
                let event = match event {
                    Ok(e) => e,
                    Err(radicle::node::Error::TimedOut) => continue,
                    Err(e) => {
                        return Err(anyhow::Error::from(e).context("event read failed"));
                    }
                };
                if feed.blocking_send(Feed::Event(event)).is_err() {
                    break;
                }
            }
            Ok(())
        })
        .await;
        if *shutdown.borrow() || tx.is_closed() {
            return;
        }
        match res {
            Ok(Ok(())) => tracing::warn!("event stream ended without error; reconnecting"),
            Ok(Err(e)) => tracing::warn!("event stream error: {e:#}; reconnecting"),
            Err(e) => tracing::warn!("event reader task panicked: {e}; reconnecting"),
        }
        tokio::select! {
            _ = shutdown.changed() => return,
            _ = tokio::time::sleep(reconnect_backoff) => {}
        }
        resubscribing = true;
    }
}

struct CobDocs {
    issues: Vec<cob::Document>,
    patches: Vec<cob::Document>,
    releases: Vec<release::Document>,
}

enum ReindexAction {
    Upsert {
        repo_doc: Box<repo::Document>,
        cob_docs: CobDocs,
    },
    Delete,
}

/// Upserts `docs` in batches. A batch that still fails after the enqueue
/// retries is logged and skipped rather than aborting the whole rescan (which
/// would crash-loop the daemon); the next periodic rescan reconciles it.
async fn upsert_all<D: serde::Serialize + Send + Sync>(
    label: &str,
    index: &client::Index,
    docs: &[D],
    primary_key: &str,
) {
    for chunk in docs.chunks(UPSERT_BATCH) {
        if let Err(e) = index.upsert(chunk, primary_key).await {
            tracing::warn!(
                "indexing a batch of {} {label} failed: {e:#}; \
                 skipping it (next rescan will reconcile)",
                chunk.len()
            );
        }
    }
}

fn build_cob_docs(
    profile: &Profile,
    repo: &radicle::storage::git::Repository,
    rid: RepoId,
) -> CobDocs {
    use radicle::issue::cache::Issues as _;
    use radicle::patch::cache::Patches as _;

    let issues = match profile.issues(repo) {
        Ok(cache) => match cache.list() {
            Ok(iter) => iter
                .filter_map(|r| {
                    r.inspect_err(|e| tracing::warn!("{rid}: skipping unreadable cob row: {e:#}"))
                        .ok()
                })
                .filter_map(|(id, issue)| {
                    build::issue_document(rid, &id, &issue)
                        .inspect_err(|e| tracing::warn!("{rid}: skipping issue {id}: {e:#}"))
                        .ok()
                })
                .collect(),
            Err(e) => {
                tracing::warn!("{rid}: listing issues failed: {e:#}");
                Vec::new()
            }
        },
        Err(e) => {
            tracing::warn!("{rid}: opening issue cache failed: {e:#}");
            Vec::new()
        }
    };
    let patches = match profile.patches(repo) {
        Ok(cache) => match cache.list() {
            Ok(iter) => iter
                .filter_map(|r| {
                    r.inspect_err(|e| tracing::warn!("{rid}: skipping unreadable cob row: {e:#}"))
                        .ok()
                })
                .filter_map(|(id, patch)| {
                    build::patch_document(rid, &id, &patch)
                        .inspect_err(|e| tracing::warn!("{rid}: skipping patch {id}: {e:#}"))
                        .ok()
                })
                .collect(),
            Err(e) => {
                tracing::warn!("{rid}: listing patches failed: {e:#}");
                Vec::new()
            }
        },
        Err(e) => {
            tracing::warn!("{rid}: opening patch cache failed: {e:#}");
            Vec::new()
        }
    };
    let releases = match repo.identity_doc() {
        Ok(doc_at) => build::release_documents(rid, repo, doc_at.delegates()),
        Err(e) => {
            tracing::warn!("{rid}: reading identity doc for releases failed: {e:#}");
            Vec::new()
        }
    };
    CobDocs {
        issues,
        patches,
        releases,
    }
}

#[cfg(test)]
mod test {
    use super::*;

    fn key(rid: &str) -> repo::DocumentKey {
        repo::DocumentKey::new(rid.parse().unwrap())
    }

    #[tokio::test]
    async fn reconcile_keeps_keys_inserted_during_the_rescan() {
        let seeded = Seeded::new();
        let kept = key("rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5");
        let unseeded = key("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5");
        let discovered = key("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp");
        seeded.insert(kept).await;
        seeded.insert(unseeded).await;
        let before = seeded.as_inner().await;

        seeded.insert(discovered).await;
        seeded.reconcile(&before, HashSet::from([kept])).await;

        assert_eq!(seeded.as_inner().await, HashSet::from([kept, discovered]));
    }
}
