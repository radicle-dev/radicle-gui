import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";

import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { readListState, saveListState } from "@app/lib/listState";
import { createPaginatedList } from "@app/lib/paginatedList.svelte";

const { isHistoryNavigation } = vi.hoisted(() => ({
  isHistoryNavigation: vi.fn(() => false),
}));
vi.mock("@app/lib/router", () => ({ isHistoryNavigation }));

function page(content: string[], more = true): PaginatedQuery<string[]> {
  return { cursor: 0, more, content };
}

function deferred() {
  let resolve!: (value: PaginatedQuery<string[]>) => void;
  const promise = new Promise<PaginatedQuery<string[]>>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

const fetchPage =
  vi.fn<
    (
      skip: number,
      take: number | undefined,
    ) => Promise<PaginatedQuery<string[]>>
  >();
let keyCount = 0;
let cleanup: (() => void) | undefined;

function nextKey() {
  return `list-${keyCount + 1}`;
}

function setup(first = page(["a", "b"]), skipPersist?: () => boolean) {
  let key = $state(`list-${++keyCount}`);
  let current = $state(first);
  let list!: ReturnType<typeof createPaginatedList<string>>;
  cleanup = $effect.root(() => {
    list = createPaginatedList({
      key: () => key,
      page: () => current,
      fetchPage,
      pageSize: 2,
      id: item => item,
      skipPersist,
    });
  });
  flushSync();
  return {
    list,
    key: () => key,
    change(newKey: string, next: PaginatedQuery<string[]>) {
      key = newKey;
      current = next;
      flushSync();
    },
  };
}

beforeEach(() => {
  fetchPage.mockReset();
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

afterEach(() => {
  cleanup?.();
  isHistoryNavigation.mockReturnValue(false);
});

test("starts from the loader's page", () => {
  const { list } = setup(page(["a", "b"], false));

  expect(list.items).toEqual(["a", "b"]);
  expect(list.more).toBe(false);
  expect(list.loadingMore).toBe(false);
  expect(list.initialScrollOffset).toBeUndefined();
  expect(fetchPage).not.toHaveBeenCalled();
});

test("loadMore appends the next page, skipping rows already shown", async () => {
  const { list } = setup();
  fetchPage.mockResolvedValueOnce(page(["b", "c"]));
  fetchPage.mockResolvedValueOnce(page(["d"], false));

  await list.loadMore();
  expect(fetchPage).toHaveBeenLastCalledWith(2, 2);
  expect(list.items).toEqual(["a", "b", "c"]);
  expect(list.more).toBe(true);

  await list.loadMore();
  expect(fetchPage).toHaveBeenLastCalledWith(4, 2);
  expect(list.items).toEqual(["a", "b", "c", "d"]);
  expect(list.more).toBe(false);

  await list.loadMore();
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

test("an empty page ends the list", async () => {
  const { list } = setup();
  fetchPage.mockResolvedValueOnce(page([], true));

  await list.loadMore();

  expect(list.more).toBe(false);
});

test("loadMore(true) replaces the list with every row", async () => {
  const { list } = setup();
  fetchPage.mockResolvedValueOnce(page(["x", "y", "z"], false));
  fetchPage.mockResolvedValueOnce(page(["w"], false));

  await list.loadMore(true);

  expect(fetchPage).toHaveBeenCalledWith(0, undefined);
  expect(list.items).toEqual(["x", "y", "z"]);
  expect(list.more).toBe(false);
});

test("loadMore(true) moves the cursor to the rows it fetched", async () => {
  const { list } = setup();
  fetchPage.mockResolvedValueOnce(page(["x", "y", "z"]));
  fetchPage.mockResolvedValueOnce(page(["w"]));

  await list.loadMore(true);
  await list.loadMore();

  expect(fetchPage).toHaveBeenLastCalledWith(3, 2);
});

test("loadingMore is set while a page loads", async () => {
  const { list } = setup();
  const pending = deferred();
  fetchPage.mockReturnValueOnce(pending.promise);

  const loading = list.loadMore();
  expect(list.loadingMore).toBe(true);

  pending.resolve(page(["c"]));
  await loading;
  expect(list.loadingMore).toBe(false);
});

test("a failed load keeps the list and allows another attempt", async () => {
  const { list } = setup();
  fetchPage.mockRejectedValueOnce(new Error("offline"));

  await list.loadMore();

  expect(list.items).toEqual(["a", "b"]);
  expect(list.more).toBe(true);
  expect(list.loadingMore).toBe(false);
  expect(console.error).toHaveBeenCalled();
});

test("a superseded load leaves the list to the newer one", async () => {
  const { list } = setup();
  const older = deferred();
  const newer = deferred();
  fetchPage.mockReturnValueOnce(older.promise);
  fetchPage.mockReturnValueOnce(newer.promise);

  const first = list.loadMore();
  const second = list.loadMore(true);
  older.resolve(page(["c"]));
  await first;
  expect(list.items).toEqual(["a", "b"]);
  expect(list.loadingMore).toBe(true);

  newer.resolve(page(["x"], false));
  await second;
  expect(list.items).toEqual(["x"]);
  expect(list.loadingMore).toBe(false);
});

test("a key change resets the list and drops an in-flight load", async () => {
  const { list, change } = setup();
  const pending = deferred();
  fetchPage.mockReturnValueOnce(pending.promise);
  fetchPage.mockResolvedValueOnce(page(["r"]));

  const loading = list.loadMore();
  change("other", page(["p", "q", "r"], true));
  expect(list.items).toEqual(["p", "q", "r"]);
  expect(list.loadingMore).toBe(false);

  pending.resolve(page(["c"]));
  await loading;
  expect(list.items).toEqual(["p", "q", "r"]);

  await list.loadMore();
  expect(fetchPage).toHaveBeenLastCalledWith(3, 2);
});

test("a new loader page under the same key is ignored", () => {
  const { list, change, key } = setup();

  change(key(), page(["z"], false));
  expect(list.items).toEqual(["a", "b"]);
  expect(list.more).toBe(true);

  change("other", page(["p"], false));
  change("other", page(["z"]));
  expect(list.items).toEqual(["p"]);
  expect(list.more).toBe(false);
});

test("persistScroll saves the list for the current key", () => {
  const { list, key } = setup(page(["a", "b"], false));

  list.persistScroll({ scrollOffset: 40, cache: undefined as never });

  expect(readListState(key())).toEqual({
    items: ["a", "b"],
    more: false,
    scrollOffset: 40,
    cache: undefined,
  });
});

test("persistScroll saves nothing while skipped", () => {
  const { list, key } = setup(undefined, () => true);

  list.persistScroll({ scrollOffset: 40, cache: undefined as never });

  expect(readListState(key())).toBeUndefined();
});

test("revalidate refetches a page-sized window by default", async () => {
  const { list } = setup();
  fetchPage.mockResolvedValueOnce(page(["n", "a"], false));

  await list.revalidate();

  expect(fetchPage).toHaveBeenCalledWith(0, 2);
  expect(list.items).toEqual(["n", "a"]);
  expect(list.more).toBe(false);
});

test("a failed revalidate keeps the list", async () => {
  const { list } = setup();
  fetchPage.mockRejectedValueOnce(new Error("offline"));

  await list.revalidate();

  expect(list.items).toEqual(["a", "b"]);
  expect(list.loadingMore).toBe(false);
  expect(console.error).toHaveBeenCalled();
});

test("a superseded revalidate leaves loadingMore to the newer load", async () => {
  const { list } = setup();
  const older = deferred();
  const newer = deferred();
  fetchPage.mockReturnValueOnce(older.promise);
  fetchPage.mockReturnValueOnce(newer.promise);

  const first = list.revalidate();
  void list.loadMore(true);
  older.resolve(page(["c"]));
  await first;

  expect(list.items).toEqual(["a", "b"]);
  expect(list.loadingMore).toBe(true);
});

function snapshot(key: string, items: string[]) {
  saveListState(key, {
    items,
    more: true,
    scrollOffset: 120,
    cache: "cache" as never,
  });
}

test("history navigation restores a deep list and refetches it", async () => {
  isHistoryNavigation.mockReturnValue(true);
  snapshot(nextKey(), ["s1", "s2", "s3"]);
  const pending = deferred();
  fetchPage.mockReturnValueOnce(pending.promise);

  const { list } = setup(page(["a", "b"], false));
  expect(fetchPage).toHaveBeenCalledWith(0, 3);
  expect(list.items).toEqual(["s1", "s2", "s3"]);
  expect(list.more).toBe(true);
  expect(list.loadingMore).toBe(true);
  expect(list.initialScrollOffset).toBe(120);
  expect(list.initialCache).toBe("cache");

  pending.resolve(page(["t1", "t2", "t3"]));
  await vi.waitFor(() => expect(list.loadingMore).toBe(false));
  expect(list.items).toEqual(["t1", "t2", "t3"]);

  fetchPage.mockResolvedValueOnce(page(["t4"]));
  await list.loadMore();
  expect(fetchPage).toHaveBeenLastCalledWith(3, 2);

  list.consumeRestoredScroll();
  expect(list.initialScrollOffset).toBeUndefined();
  expect(list.initialCache).toBeUndefined();
});

test("history navigation replaces a shallow list with the loader's page", () => {
  isHistoryNavigation.mockReturnValue(true);
  snapshot(nextKey(), ["s1", "s2"]);

  const { list } = setup(page(["a", "b"], false));

  expect(list.items).toEqual(["a", "b"]);
  expect(list.more).toBe(false);
  expect(list.initialScrollOffset).toBe(120);
  expect(fetchPage).not.toHaveBeenCalled();
});

test("a fresh navigation ignores the snapshot", () => {
  snapshot(nextKey(), ["s1", "s2", "s3"]);

  const { list } = setup();

  expect(list.items).toEqual(["a", "b"]);
  expect(list.initialScrollOffset).toBeUndefined();
  expect(fetchPage).not.toHaveBeenCalled();
});
