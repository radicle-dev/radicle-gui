import { beforeEach, expect, test } from "vitest";

import {
  patchCountMismatch,
  patchCounts,
  resetPatchCounts,
  updatePatchCounts,
} from "@app/lib/patchCounts.svelte";

const sidebar = { open: 3, draft: 2, archived: 1, merged: 4 };

beforeEach(() => {
  resetPatchCounts();
});

test.each([
  ["open", 3],
  ["draft", 2],
  ["archived", 1],
  ["merged", 4],
] as const)(
  "matches when the %s list has the sidebar's count",
  (status, count) => {
    updatePatchCounts(count, sidebar, status);

    expect(patchCounts[status]).toEqual({ sidebar: count, total: count });
    expect(patchCountMismatch(status)).toBe(false);
  },
);

test("compares the unfiltered list with the sum of all statuses", () => {
  updatePatchCounts(10, sidebar);

  expect(patchCounts.all).toEqual({ sidebar: 10, total: 10 });
  expect(patchCountMismatch()).toBe(false);

  updatePatchCounts(9, sidebar);

  expect(patchCountMismatch()).toBe(true);
});

test("flags a list whose length differs from the sidebar", () => {
  updatePatchCounts(4, sidebar, "open");

  expect(patchCountMismatch("open")).toBe(true);
  expect(patchCountMismatch("draft")).toBe(false);
  expect(patchCountMismatch()).toBe(false);
});

test("reset clears every status", () => {
  updatePatchCounts(4, sidebar, "open");
  updatePatchCounts(9, sidebar);
  resetPatchCounts();

  expect(Object.values(patchCounts)).toEqual(
    Array(5).fill({ sidebar: null, total: null }),
  );
  expect(patchCountMismatch("open")).toBe(false);
  expect(patchCountMismatch()).toBe(false);
});
