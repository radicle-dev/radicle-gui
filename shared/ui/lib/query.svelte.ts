import type { Key } from "@radicle-gui/core/keys";
import type {
  InvalidateQueryFilters,
  Query as CachedQuery,
  QueryObserverResult,
} from "@tanstack/query-core";

import { hashKey, QueryClient, QueryObserver } from "@tanstack/query-core";
import { createSubscriber } from "svelte/reactivity";

// Data is only refetched when a change event invalidates it, never because
// time passed or the window regained focus.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // The data comes from a local backend or a seed the user chose, so
        // fetches never wait for the browser to say it is online.
        networkMode: "always",
        // A retry pauses while the window is hidden, and nothing resumes it
        // because the client doesn't track focus.
        retry: false,
      },
    },
  });
}

export interface QueryOptions<T> {
  queryKey: Key;
  queryFn: () => Promise<T>;
  enabled?: boolean;
}

// Queries whose fetch in flight read data from before an invalidation, by
// client. Each is invalidated once that fetch settles.
const readBeforeChange = new WeakMap<QueryClient, WeakSet<CachedQuery>>();

function invalidateOnSettle(client: QueryClient, query: CachedQuery): void {
  let pending = readBeforeChange.get(client);
  if (!pending) {
    const set = new WeakSet<CachedQuery>();
    pending = set;
    readBeforeChange.set(client, set);
    client.getQueryCache().subscribe(event => {
      if (event.type !== "updated" || !set.has(event.query)) return;
      if (event.action.type !== "success" && event.action.type !== "error") {
        return;
      }
      set.delete(event.query);
      queueMicrotask(
        () =>
          void client.invalidateQueries({
            queryKey: event.query.queryKey,
            exact: true,
          }),
      );
    });
  }
  pending.add(query);
}

// Invalidates like `client.invalidateQueries`, and also handles the fetches in
// flight that it wouldn't restart: those nothing observes yet, such as a route
// loader's, and first fetches. Their result, read before the change, would
// otherwise count as fresh, so they are invalidated once they settle. They
// aren't restarted, so that a stream of updates can't keep a slow fetch from
// ever finishing.
export async function invalidate(
  client: QueryClient,
  filters: InvalidateQueryFilters<Key> = {},
): Promise<void> {
  for (const query of client
    .getQueryCache()
    .findAll({ ...filters, fetchStatus: "fetching" })) {
    if (!query.isActive() || query.state.data === undefined) {
      invalidateOnSettle(client, query);
    }
  }
  await client.invalidateQueries(filters);
}

export interface Query<T> {
  readonly current: QueryObserverResult<T>;
}

// Observes one key in the cache while something reads `current`. Create it
// during component initialisation, so that it follows changes to `options`.
export function createQuery<T>(
  client: QueryClient,
  options: () => QueryOptions<T>,
): Query<T> {
  const observer = new QueryObserver<T, Error, T, T, Key>(client, options());

  $effect.pre(() => {
    observer.setOptions(options());
  });

  const subscribe = createSubscriber(update => observer.subscribe(update));

  return {
    get current() {
      subscribe();
      return observer.getCurrentResult();
    },
  };
}

// When data a component keeps with `onInvalidate` last refreshed. It sits under
// its data's key, so invalidating that key or a prefix of it reaches it, but in
// a slot of its own, so the cache never mistakes it for the data.
function refreshedKey(key: Key): Key {
  return [...key, "\0refreshed"];
}

// Marks `key` as refreshed now, for a route loader to call before it reads the
// data a component then keeps with `onInvalidate`. An invalidation from then
// on, even one that arrives before the component mounts, refreshes it.
export function markLoading(client: QueryClient, key: Key): void {
  client.setQueryData(refreshedKey(key), Date.now());
}

export function invalidatedSinceLoading(
  client: QueryClient,
  key: Key,
): boolean {
  return client.getQueryState(refreshedKey(key))?.isInvalidated ?? false;
}

// Components listening on each key. A key has one query, which runs only one
// query function, so that function runs every listener's refresh.
const listeners = new WeakMap<
  QueryClient,
  Map<string, Set<() => Promise<void>>>
>();

function listenersOf(client: QueryClient, key: Key): Set<() => Promise<void>> {
  let byKey = listeners.get(client);
  if (!byKey) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- never rendered
    byKey = new Map();
    listeners.set(client, byKey);
  }
  const hash = hashKey(key);
  let set = byKey.get(hash);
  if (!set) {
    set = new Set();
    byKey.set(hash, set);
  }
  return set;
}

// Runs `refresh` whenever `key` is invalidated, for data a component keeps
// itself rather than in the cache. The cache only holds when it last
// refreshed. Create it during component initialisation. Whatever loaded the
// data counts as the first refresh: a route loader marks that with
// `markLoading`, and data loaded otherwise is taken as current.
//
// Refreshes never overlap: an invalidation during one runs another after it,
// so results land in order. A failed refresh is logged, and the next
// invalidation tries again.
export function onInvalidate(
  client: QueryClient,
  key: () => Key,
  refresh: () => Promise<void>,
): void {
  let running: Promise<void> | undefined;
  let again = false;
  let destroyed = false;
  function refreshInOrder(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        if (destroyed) break;
        try {
          await refresh();
        } catch (error) {
          console.error("Refreshing after an update failed", error);
        }
      } while (again);
      running = undefined;
    })();
    return running;
  }

  $effect.pre(() => {
    destroyed = false;
    const queryKey = refreshedKey(key());
    const set = listenersOf(client, queryKey);
    set.add(refreshInOrder);
    return () => {
      destroyed = true;
      set.delete(refreshInOrder);
      if (set.size === 0) listeners.get(client)?.delete(hashKey(queryKey));
    };
  });
  $effect.pre(() => {
    const queryKey = refreshedKey(key());
    if (client.getQueryState(queryKey)?.data === undefined) {
      client.setQueryData(queryKey, Date.now());
    }
  });
  const refreshed = createQuery<number>(client, () => {
    const queryKey = refreshedKey(key());
    return {
      queryKey,
      queryFn: async () => {
        await Promise.all(
          [...listenersOf(client, queryKey)].map(listener => listener()),
        );
        return Date.now();
      },
    };
  });
  $effect(() => {
    void refreshed.current;
  });
}

export interface Pinned<T> {
  readonly current: T;
  // Whether newer data than `current` is available.
  readonly stale: boolean;
  apply(): void;
}

// Holds on to a value until `apply()` is called. The cache keeps the identity
// of unchanged data, so a different object means the data changed.
export function pinned<T>(latest: () => T): Pinned<T> {
  let snapshot = $state.raw(latest());

  return {
    get current() {
      return snapshot;
    },
    get stale() {
      return latest() !== snapshot;
    },
    apply() {
      snapshot = latest();
    },
  };
}
