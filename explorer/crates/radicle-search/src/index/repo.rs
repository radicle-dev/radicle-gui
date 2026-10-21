pub mod data;
pub use data::{Activity, Document, DocumentKey};

use std::collections::HashSet;
use std::time::Duration;

use anyhow::{Context, Result};
use meilisearch_sdk::client::Client;
use meilisearch_sdk::documents::{DocumentsQuery, DocumentsResults};
use meilisearch_sdk::indexes;
use meilisearch_sdk::settings::Settings;
use meilisearch_sdk::task_info::TaskInfo;
use meilisearch_sdk::tasks::Task;
use serde::Deserialize;

/// Meilisearch field name for the head commit's committer timestamp.
pub const FIELD_HEAD_COMMITTER_TIME: &str = "headCommitterTime";
/// Meilisearch field name for the count of nodes seeding this repo.
pub const FIELD_SEEDING_COUNT: &str = "seedingCount";

pub const SORTABLE: &[&str] = &[
    FIELD_HEAD_COMMITTER_TIME,
    FIELD_SEEDING_COUNT,
    Document::PRIMARY_KEY,
];
pub const SEARCHABLE: &[&str] = &["name", "description"];
pub const FILTERABLE: &[&str] = &["delegates", "visibility"];
// Promote the `sort` rule ahead of `proximity`/`attribute`/`exactness` so
// that once a repo matches the query words (typo-tolerant), the query's
// `seedingCount:desc` sort decides order, with finer relevance acting as the
// tie-breaker. Meilisearch's default order keeps `sort` second-to-last, which
// reduces seed count to a deep tie-breaker for text queries.
pub const RANKING_RULES: &[&str] = &[
    "words",
    "typo",
    "sort",
    "proximity",
    "attribute",
    "exactness",
];

/// Bounded exponential-backoff schedule shared by
/// [`Index::configure_with_retry`] and the enqueue helpers.
const MAX_ATTEMPTS: u32 = 10;
const BASE_DELAY: Duration = Duration::from_secs(1);
const MAX_DELAY: Duration = Duration::from_secs(30);

pub struct Index {
    pub(crate) client: Client,
    pub(crate) index: indexes::Index,
}

impl Index {
    pub fn connect(url: &str, key: Option<&str>, name: &str) -> Result<Self> {
        let client = Client::new(url, key).context("failed to construct Meilisearch client")?;
        let index = client.index(name);
        Ok(Self { client, index })
    }

    pub async fn configure(&self) -> std::result::Result<(), meilisearch_sdk::errors::Error> {
        let settings = Settings::new()
            .with_searchable_attributes(SEARCHABLE)
            .with_sortable_attributes(SORTABLE)
            .with_filterable_attributes(FILTERABLE)
            .with_ranking_rules(RANKING_RULES);
        let task = self.index.set_settings(&settings).await?;
        task.wait_for_completion(&self.client, None, None).await?;
        Ok(())
    }

    /// Run [`Self::configure`] with bounded exponential backoff. Useful at
    /// startup where Meilisearch may not be reachable yet (e.g. systemd
    /// brought both services up in parallel). Retries every error, since a
    /// failure here means the daemon can't start regardless of the cause.
    pub async fn configure_with_retry(&self) -> Result<()> {
        retry_meili("configure", |_| true, || self.configure()).await
    }

    /// Enqueue an upsert with Meilisearch. The Meili HTTP call (which only
    /// enqueues the task) is awaited so failures to enqueue surface
    /// synchronously. Transient failures are retried with backoff. A
    /// background task then watches the task to completion and logs any
    /// async failure inside Meili.
    pub async fn upsert(&self, docs: &[Document]) -> Result<()> {
        if docs.is_empty() {
            return Ok(());
        }
        let task = retry_meili("upsert", is_transient, || {
            self.index.add_or_replace(docs, Some(Document::PRIMARY_KEY))
        })
        .await?;
        watch_task(self.client.clone(), task, "upsert");
        Ok(())
    }

    /// Enqueue a delete with Meilisearch. Same semantics as
    /// [`Self::upsert`] — the enqueue call is awaited (retrying transient
    /// failures); task completion is watched in the background.
    pub async fn delete(&self, id: &DocumentKey) -> Result<()> {
        let task = retry_meili("delete", is_transient, || self.index.delete_document(id)).await?;
        watch_task(self.client.clone(), task, "delete");
        Ok(())
    }

    /// Enqueue a batch delete with Meilisearch.
    pub async fn delete_many(&self, ids: &[DocumentKey]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let task = retry_meili("delete_many", is_transient, || {
            self.index.delete_documents(ids)
        })
        .await?;
        watch_task(self.client.clone(), task, "delete_many");
        Ok(())
    }

    /// List all document ids currently present in the index. Used at
    /// bootstrap to reconcile against actual Meili state so unseeds that
    /// happened while the daemon was down don't leave orphan documents
    /// (the in-memory `seeded` cache is empty on restart, so a cache-only
    /// diff would miss them).
    pub async fn list_doc_ids(&self) -> Result<HashSet<DocumentKey>> {
        const PAGE: usize = 1000;

        #[derive(Deserialize)]
        struct IdOnly {
            id: DocumentKey,
        }

        let mut ids = HashSet::new();
        let mut offset = 0;
        loop {
            let mut query = DocumentsQuery::new(&self.index);
            query
                .with_limit(PAGE)
                .with_offset(offset)
                .with_fields([Document::PRIMARY_KEY]);
            let page: DocumentsResults<IdOnly> = self
                .index
                .get_documents_with(&query)
                .await
                .context("get_documents failed")?;
            let done = page.results.len() < PAGE;
            ids.extend(page.results.into_iter().map(|d| d.id));
            if done {
                break;
            }
            offset += PAGE;
        }
        Ok(ids)
    }
}

/// Spawn a background task that polls `task` to completion and logs any
/// async failure inside Meili. Fire-and-forget — the caller never awaits.
fn watch_task(client: Client, task: TaskInfo, action: &'static str) {
    let task_uid = task.task_uid;
    tokio::spawn(async move {
        match task.wait_for_completion(&client, None, None).await {
            Ok(Task::Failed { content }) => {
                tracing::warn!("meili {action} task {task_uid} failed: {:?}", content.error);
            }
            Ok(_) => {
                tracing::debug!("meili {action} task {task_uid} completed");
            }
            Err(e) => {
                tracing::warn!("meili {action} task {task_uid} polling failed: {e:#}");
            }
        }
    });
}

/// Run a Meilisearch `op` with bounded exponential backoff. Only errors for
/// which `retryable` returns true are retried; the rest surface immediately.
/// `what` labels log lines. After [`MAX_ATTEMPTS`] the last error is returned
/// with context. This keeps a momentary Meilisearch hiccup (e.g. a 408 during
/// a rescan) from propagating up and terminating the daemon.
async fn retry_meili<T, F, Fut, R>(what: &str, retryable: R, op: F) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = std::result::Result<T, meilisearch_sdk::errors::Error>>,
    R: Fn(&meilisearch_sdk::errors::Error) -> bool,
{
    for attempt in 1..MAX_ATTEMPTS {
        match op().await {
            Ok(value) => return Ok(value),
            Err(e) if retryable(&e) => {
                let delay = BASE_DELAY
                    .saturating_mul(2u32.saturating_pow(attempt - 1))
                    .min(MAX_DELAY);
                tracing::warn!(
                    "meili {what} attempt {attempt}/{MAX_ATTEMPTS} failed: {e}; \
                     retrying in {}s",
                    delay.as_secs()
                );
                tokio::time::sleep(delay).await;
            }
            Err(e) => return Err(e).context(format!("{what} failed")),
        }
    }
    op().await
        .context(format!("{what} gave up after {MAX_ATTEMPTS} attempts"))
}

/// Whether a Meilisearch error is worth retrying: a momentary communication
/// hiccup (request timeout, rate limit, or gateway error) or a
/// transport-level connection/timeout failure. Permanent errors — malformed
/// request, auth, parse, 4xx — are surfaced instead, since retrying them
/// can't help.
fn is_transient(err: &meilisearch_sdk::errors::Error) -> bool {
    use meilisearch_sdk::errors::Error;
    match err {
        // A non-JSON HTTP error from the server or a proxy in front of it:
        // 408 request timeout, 429 rate limit, 502/503/504 gateway errors.
        Error::MeilisearchCommunication(e) => {
            matches!(e.status_code, 408 | 429 | 502 | 503 | 504)
        }
        // The SDK's own timeout awaiting a task.
        Error::Timeout => true,
        // Transport-level failures: connection refused/reset, read timeout.
        Error::HttpError(e) => e.is_timeout() || e.is_connect(),
        // Malformed request, auth, parse, structured 4xx: permanent.
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use meilisearch_sdk::errors::{Error, MeilisearchCommunicationError};

    fn comm_err(status_code: u16) -> Error {
        Error::MeilisearchCommunication(MeilisearchCommunicationError {
            status_code,
            message: None,
            url: "http://localhost:7700".to_string(),
        })
    }

    #[test]
    fn transient_errors_are_classified() {
        for status in [408, 429, 502, 503, 504] {
            assert!(is_transient(&comm_err(status)), "{status} should retry");
        }
        for status in [400, 404] {
            assert!(!is_transient(&comm_err(status)), "{status} is permanent");
        }
        assert!(is_transient(&Error::Timeout));
        assert!(!is_transient(&Error::InvalidRequest));
    }

    #[tokio::test(start_paused = true)]
    async fn retry_gives_up_after_max_attempts_on_transient() {
        let calls = std::cell::Cell::new(0u32);
        let result: Result<()> = retry_meili("test", is_transient, || {
            calls.set(calls.get() + 1);
            async { Err(comm_err(503)) }
        })
        .await;
        assert!(result.is_err());
        assert_eq!(calls.get(), MAX_ATTEMPTS);
    }

    #[tokio::test(start_paused = true)]
    async fn retry_surfaces_permanent_error_without_retrying() {
        let calls = std::cell::Cell::new(0u32);
        let result: Result<()> = retry_meili("test", is_transient, || {
            calls.set(calls.get() + 1);
            async { Err(comm_err(400)) }
        })
        .await;
        assert!(result.is_err());
        assert_eq!(calls.get(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn retry_recovers_after_transient_failures() {
        let calls = std::cell::Cell::new(0u32);
        let result: Result<u32> = retry_meili("test", is_transient, || {
            let n = calls.get() + 1;
            calls.set(n);
            async move { if n < 3 { Err(comm_err(503)) } else { Ok(n) } }
        })
        .await;
        assert_eq!(result.unwrap(), 3);
        assert_eq!(calls.get(), 3);
    }
}
