use std::time::Duration;

use tokio::process::Child;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

/// How long to wait for killed processes to be reaped.
const REAP_TIMEOUT: Duration = Duration::from_secs(2);

/// The git processes still streaming into response bodies. Each is owned by a
/// task that waits for it, so a response keeps streaming after its handler has
/// returned, while staying killable until the process exits.
#[derive(Clone, Default)]
pub struct Children {
    tracker: TaskTracker,
    cancel: CancellationToken,
}

impl Children {
    /// Reap `child` in the background once it exits.
    pub fn supervise(&self, mut child: Child) {
        let cancel = self.cancel.clone();
        self.tracker.spawn(async move {
            tokio::select! {
                _ = child.wait() => {}
                _ = cancel.cancelled() => {
                    if let Err(e) = child.kill().await {
                        tracing::warn!("Unable to kill git process: {e}");
                    }
                }
            }
        });
    }

    /// Kill every process still streaming and wait up to [`REAP_TIMEOUT`] for
    /// them to be reaped.
    pub async fn kill_all(&self) {
        let streaming = self.tracker.len();
        if streaming > 0 {
            tracing::warn!("Killing {streaming} git process(es) still streaming");
        }
        self.cancel.cancel();
        self.tracker.close();

        if tokio::time::timeout(REAP_TIMEOUT, self.tracker.wait())
            .await
            .is_err()
        {
            tracing::warn!(
                "{} git process(es) not reaped within {REAP_TIMEOUT:?}, leaving them behind",
                self.tracker.len()
            );
        }
    }
}
