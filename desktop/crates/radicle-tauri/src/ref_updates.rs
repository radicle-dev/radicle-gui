use std::sync::Once;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use radicle::identity::RepoId;
use radicle::node::{self, Event, Handle, Node};
use radicle::storage;
use tauri::{AppHandle, Emitter};

/// Refs that changed in a repository. `refs` is `None` when the node doesn't
/// say which refs changed, such as when the local user pushed.
#[derive(Clone, serde::Serialize)]
struct RefUpdate {
    rid: RepoId,
    #[serde(skip_serializing_if = "Option::is_none")]
    refs: Option<Vec<String>>,
}

/// Whether the subscription to the node's events is up, so the frontend knows
/// whether it can rely on them or has to poll.
static LIVE: AtomicBool = AtomicBool::new(false);

pub(crate) fn is_live() -> bool {
    LIVE.load(Ordering::Relaxed)
}

/// Starts forwarding the node's ref updates, once per app: `startup` runs again
/// whenever the webview reloads.
pub(crate) fn spawn(app: AppHandle, node: Node) {
    static FORWARDING: Once = Once::new();
    FORWARDING.call_once(|| {
        std::thread::spawn(move || forward(app, node));
    });
}

/// Forwards the node's ref updates to the frontend as `ref_update` events.
/// Every time the subscription (re)starts, the frontend gets `ref_resync`,
/// because it may have missed events in between.
fn forward(app: AppHandle, node: Node) {
    loop {
        if let Ok(events) = node.subscribe(Duration::from_secs(60 * 60 * 24)) {
            LIVE.store(true, Ordering::Relaxed);
            let _ = app.emit("ref_resync", ());
            for event in events {
                match event {
                    Ok(event) => {
                        if let Some(update) = ref_update(event) {
                            let _ = app.emit("ref_update", update);
                        }
                    }
                    // An event this version can't read, such as a new kind
                    // from a newer node, doesn't end the subscription.
                    Err(node::Error::InvalidJson { .. } | node::Error::Command { .. }) => {}
                    Err(_) => break,
                }
            }
        }
        LIVE.store(false, Ordering::Relaxed);
        std::thread::sleep(Duration::from_secs(2));
    }
}

fn ref_update(event: Event) -> Option<RefUpdate> {
    match event {
        Event::RefsFetched { rid, updated, .. } => {
            let refs: Vec<String> = updated
                .into_iter()
                .filter_map(|update| match update {
                    storage::RefUpdate::Updated { name, .. }
                    | storage::RefUpdate::Created { name, .. }
                    | storage::RefUpdate::Deleted { name, .. } => Some(name.to_string()),
                    storage::RefUpdate::Skipped { .. } => None,
                })
                .collect();
            (!refs.is_empty()).then_some(RefUpdate {
                rid,
                refs: Some(refs),
            })
        }
        Event::CanonicalRefUpdated { rid, refname, .. } => Some(RefUpdate {
            rid,
            refs: Some(vec![refname.to_string()]),
        }),
        Event::LocalRefsAnnounced { rid, .. } => Some(RefUpdate { rid, refs: None }),
        _ => None,
    }
}
