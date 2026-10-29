use std::collections::HashSet;
use std::time::Duration;

use anyhow::{Context, Result};
use meilisearch_sdk::client::Client;
use meilisearch_sdk::documents::{DocumentDeletionQuery, DocumentsQuery, DocumentsResults};
use meilisearch_sdk::indexes;
use meilisearch_sdk::settings::Settings;
use meilisearch_sdk::task_info::TaskInfo;
use meilisearch_sdk::tasks::Task;
use serde::{Deserialize, Serialize};

/// Bounded exponential-backoff schedule shared by
/// [`Index::configure_with_retry`] and the enqueue helpers.
const MAX_ATTEMPTS: u32 = 10;
const BASE_DELAY: Duration = Duration::from_secs(1);
const MAX_DELAY: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy)]
pub struct TaskWait {
    pub interval: Duration,
    pub timeout: Duration,
}

/// A handle to one Meilisearch index, providing the write/admin operations
/// shared by all document types.
pub struct Index {
    client: Client,
    index: indexes::Index,
    wait: TaskWait,
}

impl Index {
    pub fn new(client: &Client, name: &str, wait: TaskWait) -> Self {
        Self {
            client: client.clone(),
            index: client.index(name),
            wait,
        }
    }

    pub async fn configure(
        &self,
        settings: &Settings,
    ) -> std::result::Result<(), meilisearch_sdk::errors::Error> {
        let task = self.index.set_settings(settings).await?;
        task.wait_for_completion(
            &self.client,
            Some(self.wait.interval),
            Some(self.wait.timeout),
        )
        .await?;
        Ok(())
    }

    /// Run [`Self::configure`] with bounded exponential backoff. Useful at
    /// startup where Meilisearch may not be reachable yet (e.g. systemd
    /// brought both services up in parallel). Retries every error, since a
    /// failure here means the daemon can't start regardless of the cause.
    pub async fn configure_with_retry(&self, settings: &Settings) -> Result<()> {
        retry_meili("configure", |_| true, || self.configure(settings)).await
    }

    /// Enqueue an upsert with Meilisearch. The Meili HTTP call (which only
    /// enqueues the task) is awaited so failures to enqueue surface
    /// synchronously. Transient failures are retried with backoff. A
    /// background task then watches the task to completion and logs any
    /// async failure inside Meili.
    pub async fn upsert<D: Serialize + Send + Sync>(
        &self,
        docs: &[D],
        primary_key: &str,
    ) -> Result<()> {
        if docs.is_empty() {
            return Ok(());
        }
        let task = retry_meili("upsert", is_transient, || {
            self.index.add_or_replace(docs, Some(primary_key))
        })
        .await?;
        watch_task(self.client.clone(), task, "upsert", self.wait);
        Ok(())
    }

    pub async fn update<D: Serialize + Send + Sync>(
        &self,
        docs: &[D],
        primary_key: &str,
    ) -> Result<()> {
        if docs.is_empty() {
            return Ok(());
        }
        let task = retry_meili("update", is_transient, || {
            self.index.add_or_update(docs, Some(primary_key))
        })
        .await?;
        watch_task(self.client.clone(), task, "update", self.wait);
        Ok(())
    }

    pub async fn exists(&self, id: &str) -> Result<bool> {
        match self.index.get_document::<serde_json::Value>(id).await {
            Ok(_) => Ok(true),
            Err(meilisearch_sdk::errors::Error::Meilisearch(inner))
                if inner.error_code == meilisearch_sdk::errors::ErrorCode::DocumentNotFound =>
            {
                Ok(false)
            }
            Err(e) => Err(e).context("document lookup failed"),
        }
    }

    /// Enqueue a delete with Meilisearch. Same semantics as
    /// [`Self::upsert`] — the enqueue call is awaited (retrying transient
    /// failures); task completion is watched in the background.
    pub async fn delete(&self, id: &str) -> Result<()> {
        let task = retry_meili("delete", is_transient, || self.index.delete_document(id)).await?;
        watch_task(self.client.clone(), task, "delete", self.wait);
        Ok(())
    }

    /// Enqueue a batch delete with Meilisearch.
    pub async fn delete_many(&self, ids: &[String]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let task = retry_meili("delete_many", is_transient, || {
            self.index.delete_documents(ids)
        })
        .await?;
        watch_task(self.client.clone(), task, "delete_many", self.wait);
        Ok(())
    }

    /// Enqueue a filtered delete with Meilisearch, e.g. `rid = <rid>`.
    /// The filter attribute must be declared filterable in the index
    /// settings.
    pub async fn delete_by_filter(&self, filter: &str) -> Result<()> {
        let task = retry_meili("delete_by_filter", is_transient, || async {
            let mut query = DocumentDeletionQuery::new(&self.index);
            query.with_filter(filter);
            self.index.delete_documents_with(&query).await
        })
        .await?;
        watch_task(self.client.clone(), task, "delete_by_filter", self.wait);
        Ok(())
    }

    /// List all document ids currently present in the index. Used at
    /// bootstrap to reconcile against actual Meili state so deletions that
    /// happened while the daemon was down don't leave orphan documents.
    pub async fn list_doc_ids(&self) -> Result<HashSet<String>> {
        const PAGE: usize = 1000;

        #[derive(Deserialize)]
        struct IdOnly {
            id: String,
        }

        let mut ids = HashSet::new();
        let mut offset = 0;
        loop {
            let mut query = DocumentsQuery::new(&self.index);
            query
                .with_limit(PAGE)
                .with_offset(offset)
                .with_fields(["id"]);
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
fn watch_task(client: Client, task: TaskInfo, action: &'static str, wait: TaskWait) {
    let task_uid = task.task_uid;
    tokio::spawn(async move {
        match task
            .wait_for_completion(&client, Some(wait.interval), Some(wait.timeout))
            .await
        {
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
