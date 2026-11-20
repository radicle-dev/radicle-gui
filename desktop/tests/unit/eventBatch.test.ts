import type { Query } from "@tanstack/query-core";

import { keys } from "@radicle-gui/core/keys";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { batch, onRefUpdate } from "@app/lib/startup.svelte";

const { invalidateQueries, clearEntityCaches } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  clearEntityCaches: vi.fn(),
}));
vi.mock("@app/lib/query", () => ({
  queryClient: { invalidateQueries, getQueryData: vi.fn() },
}));
vi.mock("@app/lib/invoke", () => ({ clearEntityCaches, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

// Whether an invalidation with the given filter refetches a query of `key`.
function covers(call: unknown[], key: readonly unknown[]): boolean {
  const { predicate } = call[0] as {
    predicate: (query: Pick<Query, "queryKey">) => boolean;
  };
  return predicate({ queryKey: [...key] });
}

// Invalidations of the repository's data, leaving out others such as the
// notification count.
function repoCalls() {
  return invalidateQueries.mock.calls.filter(
    call => call[0].queryKey[0] === "repo",
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  invalidateQueries.mockReset();
  clearEntityCaches.mockReset();
});

describe("batch", () => {
  test("invalidates each key once after the delay", () => {
    const invalidate = batch(100, false);

    invalidate([keys.issues(rid)]);
    invalidate([keys.issues(rid), keys.patches(rid)]);
    expect(invalidateQueries).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);

    expect(invalidateQueries.mock.calls.map(call => call[0].queryKey)).toEqual([
      keys.issues(rid),
      keys.patches(rid),
    ]);
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
    expect(first[0].queryKey).toEqual(keys.repo(rid));
    expect(covers(first, keys.jobs(rid))).toBe(false);

    vi.advanceTimersByTime(5_000);
    expect(repoCalls().map(call => call[0].queryKey)).toEqual([
      keys.repo(rid),
      keys.jobs(rid),
    ]);
  });
});
