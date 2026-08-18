mod bootstrap;
mod build;
mod event;

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use radicle::Profile;
use radicle::identity::RepoId;
use radicle::node::{Event, Handle as _};
use radicle::storage::{ReadRepository, ReadStorage};
use tokio::sync::{RwLock, mpsc, watch};

use crate::config::Config;
use crate::index::repo;

const UPSERT_BATCH: usize = 100;
const EVENT_CHANNEL_CAPACITY: usize = 1024;

pub struct Indexer {
    profile: Arc<Profile>,
    index: Arc<repo::Index>,
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

    async fn replace(&self, keys: HashSet<repo::DocumentKey>) {
        *self.inner.write().await = keys;
    }

    async fn contains(&self, key: &repo::DocumentKey) -> bool {
        self.inner.read().await.contains(key)
    }

    async fn as_inner(&self) -> HashSet<repo::DocumentKey> {
        self.inner.read().await.clone()
    }
}

impl Indexer {
    pub fn new(profile: Arc<Profile>, index: Arc<repo::Index>, config: Config) -> Self {
        Self {
            profile,
            index,
            config,
            seeded: Seeded::new(),
        }
    }

    pub async fn bootstrap(&self) -> Result<()> {
        tracing::info!("starting full storage rescan");
        let profile = self.profile.clone();
        let previous_seeded = self.seeded.as_inner().await;

        let handler = bootstrap::Bootstrap::new(previous_seeded);
        let (docs, seeded) = tokio::task::spawn_blocking(
            move || -> Result<(Vec<repo::Document>, HashSet<repo::DocumentKey>)> {
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
                for info in repos
                    .iter()
                    .filter(|info| plan.to_index.contains(&info.rid))
                {
                    match build::document(&profile, &db, info.rid, &info.doc) {
                        Ok(Some(doc)) => docs.push(doc),
                        Ok(None) => {}
                        Err(e) => tracing::warn!("skipping {}: {e:#}", info.rid),
                    }
                }

                Ok((docs, plan.seeded))
            },
        )
        .await
        .context("bootstrap blocking task panicked")??;

        let total = docs.len();
        tracing::info!("indexing {total} repositories");
        for chunk in docs.chunks(UPSERT_BATCH) {
            // A batch that still fails after the enqueue retries is logged and
            // skipped rather than aborting the whole rescan (which would
            // propagate to the fatal exit in main and crash-loop the daemon).
            // The next periodic rescan reconciles whatever was missed.
            if let Err(e) = self.index.upsert(chunk).await {
                tracing::warn!(
                    "indexing a batch of {} repositories failed: {e:#}; \
                     skipping it (next rescan will reconcile)",
                    chunk.len()
                );
            }
        }
        self.seeded.replace(seeded.clone()).await;

        let removed = match self.index.list_doc_ids().await {
            Ok(meili_ids) => {
                let orphans = bootstrap::orphans(seeded, &meili_ids);
                if !orphans.is_empty() {
                    tracing::info!("removing {} orphan documents from index", orphans.len());
                    if let Err(e) = self.index.delete_many(&orphans).await {
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
        tracing::info!("rescan complete ({total} indexed, {removed} removed)");
        Ok(())
    }

    /// Bring the index in sync with the current local state of `rid`. If
    /// we're still seeding it, upsert a fresh document. If we've dropped
    /// it (or it's no longer indexable), delete the document and prune
    /// the seeded cache so subsequent gossip events don't re-trigger.
    pub async fn reindex(&self, rid: RepoId) -> Result<()> {
        let key = repo::DocumentKey::new(rid);
        let profile = self.profile.clone();
        let action = tokio::task::spawn_blocking(move || -> Result<ReindexAction> {
            let policies = profile.policies()?;
            // Propagate on lookup failure rather than treating it as
            // "not seeded" — a transient sqlite error would otherwise
            // delete the entry and prune the cache, hiding the rid from
            // subsequent gossip events until the next full rescan.
            if !policies.is_seeding(&rid)? {
                return Ok(ReindexAction::Delete);
            }
            let db = profile.database()?;
            let doc = {
                let repo = profile.storage.repository(rid)?;
                repo.identity_doc()?
            };
            match build::document(&profile, &db, rid, &doc)? {
                Some(doc) => Ok(ReindexAction::Upsert(Box::new(doc))),
                None => Ok(ReindexAction::Delete),
            }
        })
        .await
        .context("reindex blocking task panicked")??;

        match action {
            ReindexAction::Upsert(doc) => {
                self.index.upsert(std::slice::from_ref(&*doc)).await?;
            }
            ReindexAction::Delete => {
                tracing::info!("removing {rid} from index (no longer seeded)");
                self.index.delete(&key).await?;
                self.seeded.remove(&key).await;
            }
        }
        Ok(())
    }

    pub async fn run(&self, mut shutdown: watch::Receiver<bool>) -> Result<()> {
        tokio::select! {
            _ = shutdown.changed() => return Ok(()),
            res = self.bootstrap() => res?,
        }

        loop {
            let sub_shutdown = shutdown.clone();
            tokio::select! {
                _ = shutdown.changed() => return Ok(()),
                res = self.subscribe_loop(sub_shutdown) => match res {
                    Ok(()) => tracing::warn!("event stream ended without error; reconnecting"),
                    Err(e) => tracing::warn!("event stream error: {e:#}; reconnecting"),
                },
            }
            tokio::select! {
                _ = shutdown.changed() => return Ok(()),
                _ = tokio::time::sleep(self.config.reconnect_backoff) => {}
            }
            tokio::select! {
                _ = shutdown.changed() => return Ok(()),
                res = self.bootstrap() => {
                    if let Err(e) = res {
                        tracing::error!("rescan after disconnect failed: {e:#}");
                    }
                }
            }
        }
    }

    async fn subscribe_loop(&self, mut shutdown: watch::Receiver<bool>) -> Result<()> {
        let socket = self.profile.home().socket_from_env();
        tracing::info!("subscribing to node events at {}", socket.display());
        let node = radicle::Node::new(&socket);

        let (tx, mut rx) = mpsc::channel::<Event>(EVENT_CHANNEL_CAPACITY);
        let blocking_shutdown = shutdown.clone();
        let blocking = tokio::task::spawn_blocking(move || -> Result<()> {
            let events = node
                .subscribe(Duration::from_secs(1))
                .context("subscribe to node socket failed")?;
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
                if tx.blocking_send(event).is_err() {
                    break;
                }
            }
            Ok(())
        });

        let mut rescan_timer = tokio::time::interval(self.config.rescan_interval);
        rescan_timer.tick().await;

        let mut pending = HashSet::new();
        let mut batch_timer = tokio::time::interval(self.config.batch_interval);
        batch_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        batch_timer.tick().await;

        loop {
            tokio::select! {
                _ = shutdown.changed() => break,
                event = rx.recv() => {
                    let Some(event) = event else { break; };
                    let Some((rid, category)) = event::classify_event(&event) else {
                        tracing::debug!("ignored event: {}", event::event_kind(&event));
                        continue;
                    };
                    let key = repo::DocumentKey::new(rid);
                    let is_seeded = self.seeded.contains(&key).await;
                    match event::event_action(category, is_seeded) {
                        event::EventAction::Skip => {
                            tracing::debug!(
                                "skipping {rid} ({}): not locally seeded",
                                event::event_kind(&event)
                            );
                            continue;
                        }
                        event::EventAction::Reindex => {}
                        event::EventAction::DiscoverAndReindex => {
                            self.seeded.insert(key).await;
                            tracing::info!("discovered new local seed: {rid}");
                        }
                    }
                    if pending.insert(rid) {
                        tracing::debug!(
                            "queued reindex of {rid} (event: {})",
                            event::event_kind(&event)
                        );
                    }
                }
                _ = batch_timer.tick() => {
                    if pending.is_empty() {
                        continue;
                    }
                    tracing::info!("reindexing {} repositories (batched)", pending.len());
                    for rid in pending.drain().collect::<Vec<_>>() {
                        if let Err(e) = self.reindex(rid).await {
                            tracing::warn!("reindex {} failed: {e:#}", rid);
                        }
                    }
                }
                _ = rescan_timer.tick() => {
                    if let Err(e) = self.bootstrap().await {
                        tracing::warn!("periodic rescan failed: {e:#}");
                    }
                }
            }
        }

        blocking
            .await
            .context("event reader task panicked")?
            .context("event reader task returned an error")?;
        Ok(())
    }
}

enum ReindexAction {
    Upsert(Box<repo::Document>),
    Delete,
}
