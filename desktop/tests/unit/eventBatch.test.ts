import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";
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

import { setInboxItems } from "@app/lib/inboxRepos";
import { queryClient } from "@app/lib/query";
import { repoListScope } from "@app/lib/repoListScope";
import { batch, onCobsChanged, onRefUpdate } from "@app/lib/startup.svelte";

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
const issueId = "d96f425412c9f8ad5d9a9a05c9831d0728e2338d";
const patchId = "a1b5c9e2f3d4071829a3b4c5d6e7f80912a3b4c5";

// Opens the inbox showing the given issues and patches of each repository.
function openInbox(...repos: [string, string[]][]) {
  setInboxItems(
    repos.map(
      ([rid, ids]) =>
        ({
          rid,
          notifications: [ids.map(id => ({ id }))],
        }) as unknown as NotificationsByRepo,
    ),
  );
}

function invalidatedKeys() {
  return invalidateQueries.mock.calls.map(call => call[0]?.queryKey);
}

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
  setInboxItems(undefined);
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

describe("the COB cache", () => {
  // The COB cache refresh is the only invalidation by predicate alone.
  function cobInvalidations() {
    return invalidateQueries.mock.calls.filter(
      call => call[0] !== undefined && call[0].queryKey === undefined,
    );
  }

  test("refreshes right away for a change nothing else told of", () => {
    vi.advanceTimersByTime(10_000);
    onCobsChanged();
    expect(cobInvalidations()).toHaveLength(1);
  });

  test("refreshes once things are quiet after a change it heard of", () => {
    vi.advanceTimersByTime(10_000);
    onRefUpdate({ rid, refs: [`refs/namespaces/${nid}/refs/heads/main`] });
    invalidateQueries.mockClear();

    onCobsChanged();
    onCobsChanged();
    expect(cobInvalidations()).toHaveLength(0);
    vi.advanceTimersByTime(5_000);
    expect(cobInvalidations()).toHaveLength(1);
  });

  test("refreshes the open inbox along with it", () => {
    openInbox([rid, [issueId]]);
    onCobsChanged();
    vi.advanceTimersByTime(5_000);
    expect(invalidatedKeys()).toContainEqual(keys.notificationList());
  });

  test("leaves the inbox while it isn't open", () => {
    onCobsChanged();
    vi.advanceTimersByTime(5_000);
    expect(invalidatedKeys()).not.toContainEqual(keys.notificationList());
  });
});

describe("the inbox", () => {
  const issue = `refs/namespaces/${nid}/refs/cobs/xyz.radicle.issue/${issueId}`;
  const patch = `refs/namespaces/${nid}/refs/cobs/xyz.radicle.patch/${patchId}`;

  function inboxInvalidated(): boolean {
    vi.advanceTimersByTime(100);
    return invalidatedKeys().some(
      key => key?.join("\0") === keys.notifications().join("\0"),
    );
  }

  test("refreshes for an update of an issue it shows", () => {
    openInbox([rid, [issueId]]);
    onRefUpdate({ rid, refs: [issue] });
    expect(inboxInvalidated()).toBe(true);
  });

  test("refreshes for an update of a patch it shows", () => {
    openInbox([rid, [patchId]]);
    onRefUpdate({ rid, refs: [patch] });
    expect(inboxInvalidated()).toBe(true);
  });

  test("refreshes for an update naming no refs of a repository it shows", () => {
    openInbox([rid, [issueId]]);
    onRefUpdate({ rid });
    expect(inboxInvalidated()).toBe(true);
  });

  test("stays for an update of an issue it doesn't show", () => {
    openInbox([rid, [patchId]]);
    onRefUpdate({ rid, refs: [issue] });
    expect(inboxInvalidated()).toBe(false);
  });

  test("stays for a branch update of a repository it shows", () => {
    openInbox([rid, [issueId]]);
    onRefUpdate({ rid, refs: [`refs/namespaces/${nid}/refs/heads/main`] });
    expect(inboxInvalidated()).toBe(false);
  });

  test("stays for an update naming no refs of a repository it doesn't show", () => {
    openInbox(["rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5", [issueId]]);
    onRefUpdate({ rid });
    expect(inboxInvalidated()).toBe(false);
  });

  test("stays while it isn't open", () => {
    onRefUpdate({ rid, refs: [issue] });
    expect(inboxInvalidated()).toBe(false);
  });
});
