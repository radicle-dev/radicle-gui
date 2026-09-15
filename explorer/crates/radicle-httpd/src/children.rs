use std::time::Duration;

use tokio::process::{Child, Command};
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

/// How long to wait for killed processes to be reaped.
const REAP_TIMEOUT: Duration = Duration::from_secs(2);

/// A `git` command in its own process group, out of reach of signals sent to
/// the daemon's group, e.g., Ctrl-C. The child is killed if it is dropped
/// before it is reaped.
pub fn git() -> Command {
    let mut command = Command::new("git");
    #[cfg(unix)]
    command.process_group(0);
    command.kill_on_drop(true);
    command
}

/// Kill the child's process group, which includes the processes git spawns,
/// e.g., `upload-pack` or `pack-objects`. The child is not reaped yet, so its
/// pid still identifies the group.
fn kill(child: &mut Child) {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // SAFETY: `killpg` has no memory-safety preconditions.
        if unsafe { libc::killpg(pid as libc::pid_t, libc::SIGKILL) } == 0 {
            return;
        }
        let e = std::io::Error::last_os_error();
        tracing::warn!("Unable to kill git process group {pid}: {e}");
    }
    if let Err(e) = child.start_kill() {
        tracing::warn!("Unable to kill git process: {e}");
    }
}

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
                    kill(&mut child);
                    let _ = child.wait().await;
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
