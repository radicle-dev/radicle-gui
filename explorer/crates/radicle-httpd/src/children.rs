use std::io;
use std::process::ExitStatus;
use std::time::Duration;

use axum::body::Body;
use futures_util::stream::{self, StreamExt};
use tokio::io::AsyncRead;
use tokio::process::{Child, Command};
use tokio::sync::oneshot;
use tokio_util::io::ReaderStream;
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

/// Which exit statuses mean that a process's output is incomplete.
#[derive(Clone, Copy)]
pub enum Truncated {
    /// Any unsuccessful exit, e.g., for `git archive`.
    OnFailure,
    /// Only termination by a signal, e.g., for `git http-backend`. It exits
    /// with 1 both after an in-band protocol error and when its `upload-pack`
    /// dies, so a status of 1 does not tell whether the output is complete.
    OnSignal,
}

/// The git processes still streaming into response bodies. Each one is reaped
/// by its own task, so it can be killed after its handler has returned.
#[derive(Clone, Default)]
pub struct Children {
    tracker: TaskTracker,
    cancel: CancellationToken,
}

impl Children {
    /// Stream `stdout` as a response body and reap `child` in the background.
    /// The body ends with an error if the exit status means the output is
    /// incomplete, so that hyper aborts the response instead of completing it.
    pub fn stream(
        &self,
        mut child: Child,
        stdout: impl AsyncRead + Send + 'static,
        truncated: Truncated,
    ) -> Body {
        let (exited_tx, exited) = oneshot::channel();
        let cancel = self.cancel.clone();
        self.tracker.spawn(async move {
            let status = tokio::select! {
                status = child.wait() => status,
                _ = cancel.cancelled() => {
                    kill(&mut child);
                    child.wait().await
                }
            };
            let _ = exited_tx.send(status);
        });

        let outcome = stream::once(exited)
            .filter_map(move |exit| async move { exit_error(exit, truncated).map(Err) });
        Body::from_stream(ReaderStream::new(stdout).chain(outcome))
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

/// The error that ends a response body if the output is incomplete or the
/// process was not reaped.
fn exit_error(
    exit: Result<io::Result<ExitStatus>, oneshot::error::RecvError>,
    truncated: Truncated,
) -> Option<io::Error> {
    let complete = |status: ExitStatus| match truncated {
        Truncated::OnFailure => status.success(),
        Truncated::OnSignal => status.code().is_some(),
    };
    match exit {
        Ok(Ok(status)) if complete(status) => None,
        Ok(Ok(status)) => Some(io::Error::other(format!("git exited with {status}"))),
        Ok(Err(e)) => Some(e),
        Err(_) => Some(io::Error::other("git process was dropped before it exited")),
    }
}
