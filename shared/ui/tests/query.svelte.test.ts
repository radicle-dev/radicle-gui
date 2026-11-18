import type { QueryClient } from "@tanstack/query-core";

import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  createQuery,
  createQueryClient,
  invalidate,
  invalidatedSinceLoading,
  markLoading,
  onInvalidate,
  pinned,
} from "../lib/query.svelte";

const key = ["repo", "rad:z1", "issues"] as const;

let client: QueryClient;
const cleanups: (() => void)[] = [];

function listen(refresh: () => Promise<void>) {
  cleanups.push(
    $effect.root(() => {
      onInvalidate(client, () => key, refresh);
    }),
  );
  flushSync();
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  client = createQueryClient();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  client.clear();
});

test("takes the loaded data as current", async () => {
  const refresh = vi.fn(() => Promise.resolve());
  listen(refresh);
  await Promise.resolve();

  expect(refresh).not.toHaveBeenCalled();
});

test("refreshes when the key is invalidated", async () => {
  const refresh = vi.fn(() => Promise.resolve());
  listen(refresh);

  await client.invalidateQueries({ queryKey: key });

  expect(refresh).toHaveBeenCalledTimes(1);
});

test("refreshes every listener on the same key", async () => {
  const first = vi.fn(() => Promise.resolve());
  const second = vi.fn(() => Promise.resolve());
  listen(first);
  listen(second);

  await client.invalidateQueries({ queryKey: key });

  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});

test("refreshes at mount after an invalidation during the load", async () => {
  markLoading(client, key);
  await client.invalidateQueries({ queryKey: key });
  const refresh = vi.fn(() => Promise.resolve());

  listen(refresh);

  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

test("ignores an invalidation from before the load", async () => {
  markLoading(client, key);
  await client.invalidateQueries({ queryKey: key });
  markLoading(client, key);
  const refresh = vi.fn(() => Promise.resolve());

  listen(refresh);
  await Promise.resolve();

  expect(refresh).not.toHaveBeenCalled();
});

test("runs an invalidation during a refresh after it", async () => {
  const first = deferred();
  let running = 0;
  let overlapped = false;
  const refresh = vi.fn(async () => {
    running++;
    if (running > 1) overlapped = true;
    if (refresh.mock.calls.length === 1) await first.promise;
    running--;
  });
  listen(refresh);

  const firstRefresh = client.invalidateQueries({ queryKey: key });
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  // As events do, cancelling the refetch in flight.
  const secondRefresh = client.invalidateQueries({ queryKey: key });
  first.resolve();
  await Promise.all([firstRefresh, secondRefresh]);

  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  expect(overlapped).toBe(false);
});

test("follows a key change, refreshing for an update during its load", async () => {
  const other = ["repo", "rad:z1", "patches"] as const;
  let current = $state<readonly string[]>(key);
  const refresh = vi.fn(() => Promise.resolve());
  cleanups.push(
    $effect.root(() => {
      onInvalidate(client, () => current, refresh);
    }),
  );
  flushSync();

  markLoading(client, other);
  await client.invalidateQueries({ queryKey: other });
  current = other;
  flushSync();
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

  // The old key no longer refreshes this component, only those still on it.
  const stayed = vi.fn(() => Promise.resolve());
  listen(stayed);
  await client.invalidateQueries({ queryKey: key });
  expect(stayed).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("a pinned value changes only when applied", () => {
  let latest = $state({ body: "first" });
  let value!: ReturnType<typeof pinned<{ body: string }>>;
  cleanups.push(
    $effect.root(() => {
      value = pinned(() => latest);
    }),
  );

  latest = { body: "second" };

  expect(value.current.body).toBe("first");
  expect(value.stale).toBe(true);
  value.apply();
  expect(value.current.body).toBe("second");
  expect(value.stale).toBe(false);
});

test("a loader's fetch is stale once it settles if invalidated meanwhile", async () => {
  const before = deferred<string>();
  const queryFn = vi.fn(() => before.promise);

  const loaded = client.fetchQuery({ queryKey: key, queryFn });
  await invalidate(client, { queryKey: key });
  before.resolve("before");

  expect(await loaded).toBe("before");
  expect(queryFn).toHaveBeenCalledTimes(1);
  await vi.waitFor(() =>
    expect(client.getQueryState(key)?.isInvalidated).toBe(true),
  );
});

test("an observed first fetch refetches once it settles if invalidated meanwhile", async () => {
  const before = deferred<string>();
  const queryFn = vi
    .fn<() => Promise<string>>()
    .mockReturnValueOnce(before.promise)
    .mockResolvedValue("after");
  let query!: ReturnType<typeof createQuery<string>>;
  cleanups.push(
    $effect.root(() => {
      query = createQuery(client, () => ({ queryKey: key, queryFn }));
      $effect(() => {
        void query.current;
      });
    }),
  );
  flushSync();

  const invalidated = [
    invalidate(client, { queryKey: key }),
    invalidate(client, { queryKey: key }),
  ];
  before.resolve("before");
  await Promise.all(invalidated);

  await vi.waitFor(() => expect(query.current.data).toBe("after"));
  expect(queryFn).toHaveBeenCalledTimes(2);
});

test("an idle query is only marked stale", async () => {
  const queryFn = vi.fn(() => Promise.resolve("data"));
  await client.fetchQuery({ queryKey: key, queryFn });

  await invalidate(client, { queryKey: key });

  expect(queryFn).toHaveBeenCalledTimes(1);
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});

test("an observed query refetches on invalidation and follows key changes", async () => {
  const other = ["repo", "rad:z1", "patches"] as const;
  let current = $state<readonly string[]>(key);
  const queryFn = vi.fn(async () => current.join("/"));
  let query!: ReturnType<typeof createQuery<string>>;
  cleanups.push(
    $effect.root(() => {
      query = createQuery(client, () => ({ queryKey: current, queryFn }));
      $effect(() => {
        void query.current;
      });
    }),
  );
  flushSync();
  await vi.waitFor(() => expect(query.current.data).toBe(key.join("/")));

  await invalidate(client, { queryKey: key });
  expect(queryFn).toHaveBeenCalledTimes(2);

  current = other;
  flushSync();
  await vi.waitFor(() => expect(query.current.data).toBe(other.join("/")));
});

test("a disabled query doesn't fetch", async () => {
  const queryFn = vi.fn(() => Promise.resolve("data"));
  cleanups.push(
    $effect.root(() => {
      const query = createQuery(client, () => ({
        queryKey: key,
        queryFn,
        enabled: false,
      }));
      $effect(() => {
        void query.current;
      });
    }),
  );
  flushSync();
  await Promise.resolve();

  expect(queryFn).not.toHaveBeenCalled();
});

test("keeps refresh times apart from the data under the same key", async () => {
  client.setQueryData(key, "data");
  markLoading(client, key);
  listen(() => Promise.resolve());

  expect(client.getQueryData(key)).toBe("data");
  expect(invalidatedSinceLoading(client, key)).toBe(false);
  await client.invalidateQueries({ queryKey: key });
  markLoading(client, key);
  expect(invalidatedSinceLoading(client, key)).toBe(false);
});

test("tells whether a key was invalidated since loading", async () => {
  markLoading(client, key);
  await client.invalidateQueries({ queryKey: ["repo"] });

  expect(invalidatedSinceLoading(client, key)).toBe(true);
});

test("stops refreshing once destroyed", async () => {
  const first = deferred();
  const refresh = vi.fn(async () => {
    if (refresh.mock.calls.length === 1) await first.promise;
  });
  listen(refresh);

  const firstRefresh = client.invalidateQueries({ queryKey: key });
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  const secondRefresh = client.invalidateQueries({ queryKey: key });
  for (const cleanup of cleanups.splice(0)) cleanup();
  first.resolve();
  await Promise.all([firstRefresh, secondRefresh]);

  expect(refresh).toHaveBeenCalledTimes(1);
});

test("a failed refresh is retried on the next invalidation", async () => {
  const refresh = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("down"))
    .mockResolvedValueOnce();
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  listen(refresh);

  await client.invalidateQueries({ queryKey: key });
  await client.invalidateQueries({ queryKey: key });

  expect(refresh).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledTimes(1);
  error.mockRestore();
});
