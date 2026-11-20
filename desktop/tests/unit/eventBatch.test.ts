import type { RefUpdate as BackendRefUpdate } from "@bindings/repo/RefUpdate";
import type { RefUpdate } from "@radicle-gui/core/refUpdates";

import { keys } from "@radicle-gui/core/keys";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest";

import { queryClient } from "@app/lib/query";
import { repoListScope } from "@app/lib/repoListScope";
import { batch, onRefUpdate } from "@app/lib/startup.svelte";

const { clearEntityCaches } = vi.hoisted(() => ({
  clearEntityCaches: vi.fn(),
}));
vi.mock("@app/lib/query", async () => {
  const { createQueryClient } =
    await import("@radicle-gui/ui/lib/query.svelte");
  return { queryClient: createQueryClient() };
});
vi.mock("@app/lib/invoke", () => ({ clearEntityCaches, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const nid = "z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";

// Whether an invalidation with the given filter refetches a query of `key`.
function covers(call: unknown[], key: readonly unknown[]): boolean {
  const { predicate } = call[0] as {
    predicate: (query: { queryKey: readonly unknown[] }) => boolean;
  };
  return predicate({ queryKey: [...key] });
}

// Invalidations of the repository's data, leaving out others such as the
// notification count.
function repoCalls() {
  return invalidateQueries.mock.calls.filter(
    call => call[0]?.queryKey?.[0] === "repo",
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  invalidateQueries.mockClear();
  clearEntityCaches.mockReset();
  queryClient.clear();
});

describe("batch", () => {
  test("invalidates each key once after the delay", () => {
    const invalidate = batch(100, false);

    invalidate([keys.issues(rid)]);
    invalidate([keys.issues(rid), keys.patches(rid)]);
    expect(invalidateQueries).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);

    expect(invalidateQueries.mock.calls.map(call => call[0]?.queryKey)).toEqual(
      [keys.issues(rid), keys.patches(rid)],
    );
    expect(clearEntityCaches).toHaveBeenCalledTimes(1);
  });

  test("leaves job lists under a repository key to their own batch", () => {
    const invalidate = batch(100, false);

    invalidate([keys.repo(rid)]);
    vi.advanceTimersByTime(100);

    const [call] = invalidateQueries.mock.calls;
    expect(covers(call, keys.issues(rid))).toBe(true);
    expect(covers(call, keys.jobs(rid))).toBe(false);
  });

  test("the job batch refetches job lists", () => {
    const invalidateJobs = batch(5_000, true);

    invalidateJobs([keys.jobs(rid)]);
    vi.advanceTimersByTime(5_000);

    const [call] = invalidateQueries.mock.calls;
    expect(covers(call, keys.jobs(rid))).toBe(true);
    expect(clearEntityCaches).not.toHaveBeenCalled();
  });

  test("an update naming no refs refreshes job lists in their own batch", () => {
    onRefUpdate({ rid });

    vi.advanceTimersByTime(100);
    const [first] = repoCalls();
    expect(first[0]?.queryKey).toEqual(keys.repo(rid));
    expect(covers(first, keys.jobs(rid))).toBe(false);

    vi.advanceTimersByTime(5_000);
    expect(repoCalls().map(call => call[0]?.queryKey)).toEqual([
      keys.repo(rid),
      keys.jobs(rid),
    ]);
  });

  test("an empty update neither invalidates nor drops the hover caches", () => {
    const invalidate = batch(100, false);

    invalidate([]);
    vi.advanceTimersByTime(100);

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(clearEntityCaches).not.toHaveBeenCalled();
  });
});

describe("the repository list", () => {
  function listInvalidated(): boolean {
    vi.advanceTimersByTime(100);
    return invalidateQueries.mock.calls.some(
      call => call[0]?.queryKey?.[0] === "repos",
    );
  }

  function list(seededNotReplicated: string[] = []) {
    queryClient.setQueryData(keys.repoList(repoListScope.value), {
      repos: [{ rid }],
      seededNotReplicated,
    });
  }

  test("refreshes for an update naming no refs", () => {
    list();
    onRefUpdate({ rid });
    expect(listInvalidated()).toBe(true);
  });

  test("refreshes when an identity update may rename a repository", () => {
    list();
    onRefUpdate({ rid, refs: [`refs/namespaces/${nid}/refs/rad/id`] });
    expect(listInvalidated()).toBe(true);
  });

  test("refreshes when a repository it doesn't show yet arrives", () => {
    list([rid]);
    onRefUpdate({ rid, refs: [`refs/namespaces/${nid}/refs/heads/main`] });
    expect(listInvalidated()).toBe(true);
  });

  test("stays for a branch update of a listed repository", () => {
    list();
    onRefUpdate({ rid, refs: [`refs/namespaces/${nid}/refs/heads/main`] });
    expect(listInvalidated()).toBe(false);
  });
});

test("the core's ref update matches the one the backend sends", () => {
  expectTypeOf<RefUpdate>().toEqualTypeOf<BackendRefUpdate>();
});
