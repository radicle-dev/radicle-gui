import type { Key } from "@radicle-gui/core/keys";
import type { RefUpdate } from "@radicle-gui/core/refUpdates";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { keys } from "@radicle-gui/core/keys";
import { affectedKeys } from "@radicle-gui/core/refUpdates";
import { listen } from "@tauri-apps/api/event";
import once from "lodash/once";
import { get } from "svelte/store";

import { invoke } from "@app/lib/invoke";
import { queryClient } from "@app/lib/query";
import { fetchingRepos } from "@app/lib/seedRepo";

import { artifactNodeRunning, nodeEvents, nodeRunning } from "./events";

// Collects keys and invalidates them together after `delay`.
function batch(delay: number): (affected: Key[]) => void {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- never rendered
  const pending = new Map<string, Key>();
  let flush: ReturnType<typeof setTimeout> | undefined;
  return affected => {
    for (const key of affected) pending.set(key.join("\0"), key);
    flush ??= setTimeout(() => {
      flush = undefined;
      const queryKeys = [...pending.values()];
      pending.clear();
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }, delay);
  };
}

// A fetch often updates many refs in a burst, so invalidations are batched.
const invalidate = batch(100);

function onRefUpdate(update: RefUpdate) {
  invalidate([
    ...affectedKeys(update),
    // The node writes notifications as it fetches.
    keys.notificationCount(),
    // The repository list changes when a seeded repository arrives, or when an
    // identity update renames one.
    ...(get(fetchingRepos).includes(update.rid) ||
    update.refs?.some(ref => ref.endsWith("refs/rad/id"))
      ? [keys.repos()]
      : []),
  ]);
}

export let unlistenNodeEvents: UnlistenFn | undefined = undefined;

export function setUnlistenNodeEvents(unlisten: UnlistenFn) {
  unlistenNodeEvents = unlisten;
}

// Will be called once in the startup of the app
export const createEventEmittersOnce = once(async (): Promise<UnlistenFn> => {
  if (!window.__TAURI_INTERNALS__) {
    // The test backend can't emit events, so poll at the backend's pace.
    const pollNodes = () => {
      invoke<boolean>("node_running")
        .then(running => nodeRunning.set(running))
        .catch(console.error);
      invoke<boolean>("artifact_node_running")
        .then(running => artifactNodeRunning.set(running))
        .catch(console.error);
    };
    pollNodes();
    const interval = setInterval(pollNodes, 2_000);
    return () => clearInterval(interval);
  }

  const unlisteners = await Promise.all([
    listen<boolean>("node_running", event => {
      nodeRunning.set(event.payload);
    }),
    listen<boolean>("artifact_node_running", event => {
      artifactNodeRunning.set(event.payload);
    }),
    listen<boolean>("node_events", event => {
      nodeEvents.set(event.payload);
    }),
    listen<RefUpdate>("ref_update", event => onRefUpdate(event.payload)),
    // The backend may have missed events while it wasn't subscribed.
    listen("ref_resync", () => {
      void queryClient.invalidateQueries();
    }),
  ]);

  // Without the node's events, refetch what is shown whenever the user comes
  // back to the window.
  const onFocus = () => {
    if (!get(nodeEvents)) {
      void queryClient.invalidateQueries();
    }
  };
  window.addEventListener("focus", onFocus);

  return () => {
    unlisteners.forEach(unlisten => unlisten());
    window.removeEventListener("focus", onFocus);
  };
});
