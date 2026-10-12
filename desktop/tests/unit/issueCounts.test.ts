import { beforeEach, expect, test } from "vitest";

import {
  issueCountMismatch,
  issueCounts,
  resetIssueCounts,
  updateIssueCounts,
} from "@app/lib/issueCounts.svelte";

const sidebar = { open: 3, closed: 2, all: 5 };

beforeEach(() => {
  resetIssueCounts();
});

test.each([
  ["all", 5],
  ["open", 3],
  ["closed", 2],
] as const)(
  "matches when the %s list has the sidebar's count",
  (status, count) => {
    updateIssueCounts(count, sidebar, status);

    expect(issueCounts[status]).toEqual({ sidebar: count, total: count });
    expect(issueCountMismatch(status)).toBe(false);
  },
);

test("flags a list whose length differs from the sidebar", () => {
  updateIssueCounts(4, sidebar, "open");

  expect(issueCountMismatch("open")).toBe(true);
  expect(issueCountMismatch("closed")).toBe(false);
});

test("reset clears every status", () => {
  updateIssueCounts(4, sidebar, "open");
  updateIssueCounts(1, sidebar, "closed");
  resetIssueCounts();

  expect(issueCounts).toEqual({
    all: { sidebar: null, total: null },
    open: { sidebar: null, total: null },
    closed: { sidebar: null, total: null },
  });
  expect(issueCountMismatch("open")).toBe(false);
});
