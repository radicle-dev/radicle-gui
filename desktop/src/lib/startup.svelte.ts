import type { ActorInfo } from "@bindings/actor/ActorInfo";
import type { Key } from "@radicle-gui/core/keys";
import type { RefUpdate } from "@radicle-gui/core/refUpdates";
import type { UnlistenFn } from "@tauri-apps/api/event";

import {
  isCobCacheKey,
  isJobsKey,
  isRepoInfoKey,
  keys,
} from "@radicle-gui/core/keys";
import { affectedKeys } from "@radicle-gui/core/refUpdates";
import { invalidate } from "@radicle-gui/ui/lib/query.svelte";
import { listen } from "@tauri-apps/api/event";
import once from "lodash/once";
import { get } from "svelte/store";

import { heardOfChange, heardOfChangeWithin } from "@app/lib/cacheActivity";
import type { RepoList } from "@app/lib/cobQueries";
import { clearEntityCaches, invoke } from "@app/lib/invoke";
import { queryClient } from "@app/lib/query";
import { repoListScope } from "@app/lib/repoListScope";

import { artifactNodeRunning, nodeEvents, nodeRunning } from "./events";

// Collects keys and invalidates them together after `delay`. Job lists under
// a key are left to their own batch unless `jobs` says the keys are theirs.
export function batch(delay: number, jobs: boolean): (affected: Key[]) => void {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- never rendered
  const pending = new Map<string, Key>();
  let flush: ReturnType<typeof setTimeout> | undefined;
  return affected => {
    if (affected.length === 0) return;
    for (const key of affected) pending.set(key.join("\0"), key);
    flush ??= setTimeout(() => {
      flush = undefined;
      const queryKeys = [...pending.values()];
      pending.clear();
      if (!jobs) clearEntityCaches();
      for (const queryKey of queryKeys) {
        void invalidate(queryClient, {
          queryKey,
          predicate: query => jobs || !isJobsKey(query.queryKey as Key),
        });
      }
    }, delay);
  };
}

// A fetch often updates many refs in a burst, so invalidations are batched.
const invalidateBatched = batch(100, false);
// Listing CI jobs scans every job in the repository, and a running
// job updates often, so job lists refresh at most every few seconds.
const invalidateJobs = batch(5_000, true);

// Whether the repository list shows `rid` as arrived.
function listed(rid: string): boolean {
  const list = queryClient.getQueryData<RepoList>(
    keys.repoList(repoListScope.value),
  );
  return (
    list !== undefined &&
    list.repos.some(repo => repo.rid === rid) &&
    !list.seededNotReplicated.includes(rid)
  );
}

export function onRefUpdate(update: RefUpdate) {
  heardOfChange();
  const affected = affectedKeys(update);
  // A key for the whole repository covers its jobs too.
  const repoWide = affected.some(key => key.length === 2 && key[0] === "repo");
  invalidateJobs([
    ...affected.filter(isJobsKey),
    ...(repoWide ? [keys.jobs(update.rid)] : []),
  ]);
  const identityMoved =
    repoWide || update.refs?.some(ref => ref.endsWith("refs/rad/id"));
  invalidateBatched([
    ...affected.filter(key => !isJobsKey(key)),
    // The repository list changes when a seeded repository arrives, or when an
    // identity update renames one.
    ...(identityMoved || !listed(update.rid) ? [keys.repos()] : []),
    // The actor's profile and keys live in its repository, and any identity
    // update may add this device's key to an actor, as an approved join does.
    ...(identityMoved ||
    queryClient.getQueryData<ActorInfo | null>(keys.actor())?.rid === update.rid
      ? [keys.actor()]
      : []),
  ]);
}

function refreshCobCache(): void {
  clearEntityCaches();
  void invalidate(queryClient, {
    predicate: query => isCobCacheKey(query.queryKey as Key),
  });
}

let deferredCobRefresh: ReturnType<typeof setTimeout> | undefined;

// Issues and patches written without announcing them, such as with
// `rad issue comment --no-announce`, only show in the node's COB cache. It
// also changes with every fetch and write the cache already heard of, and
// says nothing about which repository changed. So right after such a change
// it refreshes once things are quiet, rather than with every fetch, and never
// leaves a change out.
export function onCobsChanged(): void {
  if (!heardOfChangeWithin(COB_QUIET_MS)) {
    refreshCobCache();
    return;
  }
  deferredCobRefresh ??= setTimeout(() => {
    deferredCobRefresh = undefined;
    refreshCobCache();
  }, COB_QUIET_MS);
}

const COB_QUIET_MS = 5_000;

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
    // Another process changed the notifications, such as by clearing some.
    listen("notifications_changed", () => {
      invalidateBatched([keys.notifications()]);
    }),
    listen("cobs_changed", onCobsChanged),
    listen("policies_changed", () => {
      invalidateBatched([keys.repos()]);
      void invalidate(queryClient, {
        predicate: query => isRepoInfoKey(query.queryKey as Key),
      });
    }),
    // The backend may have missed events while it wasn't subscribed.
    listen("ref_resync", () => {
      clearEntityCaches();
      void invalidate(queryClient);
    }),
  ]);

  // Without the node's events, refetch what is shown whenever the user comes
  // back to the window. CI jobs only arrive through the node, so they can't
  // have changed.
  const onFocus = () => {
    if (!get(nodeEvents)) {
      clearEntityCaches();
      void invalidate(queryClient, {
        predicate: query => !isJobsKey(query.queryKey as Key),
      });
    }
  };
  window.addEventListener("focus", onFocus);

  return () => {
    unlisteners.forEach(unlisten => unlisten());
    window.removeEventListener("focus", onFocus);
  };
});
