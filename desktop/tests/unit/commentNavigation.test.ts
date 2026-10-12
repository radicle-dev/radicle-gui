import { describe, expect, test } from "vitest";

import {
  orderComments,
  orderFileGroups,
  stepCommitIndex,
  stepIndex,
} from "@app/lib/commentNavigation";

import { comment, location, thread } from "./support/cobs";

function at(
  id: string,
  path: string,
  side: "old" | "new",
  line: number,
  timestamp = 0,
) {
  return thread(
    comment({ id, location: location(path, side, line), timestamp }),
  );
}

describe("orderComments", () => {
  test("orders by file order, line, side, then age", () => {
    const ordered = orderComments(
      [
        at("b-5", "b.ts", "new", 5),
        at("a-9", "a.ts", "new", 9),
        at("a-2-new", "a.ts", "new", 2),
        at("a-2-old", "a.ts", "old", 2),
        at("a-2-new-older", "a.ts", "new", 2, -1),
      ],
      ["a.ts", "b.ts"],
      () => "modified",
    );

    expect(ordered.map(c => c.id)).toEqual([
      "a-2-old",
      "a-2-new-older",
      "a-2-new",
      "a-9",
      "b-5",
    ]);
    expect(ordered[0].anchor).toEqual({
      path: "a.ts",
      side: "deletions",
      line: 2,
    });
  });

  test("leaves out comments the diff can't show", () => {
    const ordered = orderComments(
      [
        at("elsewhere", "gone.ts", "new", 1),
        at("moved", "moved.ts", "new", 1),
        thread(comment({ id: "plain", location: null })),
        at("shown", "a.ts", "new", 1),
      ],
      ["a.ts", "moved.ts"],
      path => (path === "moved.ts" ? "moved" : "modified"),
    );

    expect(ordered.map(c => c.id)).toEqual(["shown"]);
  });
});

describe("stepIndex", () => {
  test.each([
    [-1, 1, 0],
    [-1, -1, 2],
    [0, 1, 1],
    [2, 1, 0],
    [0, -1, 2],
  ])("from %j by %j lands on %j of three", (current, delta, expected) => {
    expect(stepIndex(current, 3, delta)).toBe(expected);
  });

  test("has nowhere to go in an empty list", () => {
    expect(stepIndex(-1, 0, 1)).toBeUndefined();
  });
});

describe("stepCommitIndex", () => {
  test.each([
    [-1, -1, 2],
    [-1, 1, 0],
    [1, 1, 2],
    [1, -1, 0],
    [2, 1, 2],
    [0, -1, 0],
  ])("from %j by %j selects %j of three", (current, delta, expected) => {
    expect(stepCommitIndex(current, 3, delta)).toBe(expected);
  });
});

test("orderFileGroups follows the diff's file order and line order", () => {
  const groups = orderFileGroups(
    [
      {
        path: "b.ts",
        threads: [at("b-9", "b.ts", "new", 9), at("b-1", "b.ts", "new", 1)],
      },
      { path: "gone.ts", threads: [at("g", "gone.ts", "new", 1)] },
      { path: "a.ts", threads: [at("a-3", "a.ts", "old", 3)] },
    ],
    ["a.ts", "b.ts"],
  );

  expect(groups.map(g => [g.path, ...g.threads.map(t => t.root.id)])).toEqual([
    ["a.ts", "a-3"],
    ["b.ts", "b-1", "b-9"],
  ]);
});

test("orderFileGroups leaves the caller's groups as they were", () => {
  const threads = [at("b-9", "b.ts", "new", 9), at("b-1", "b.ts", "new", 1)];
  orderFileGroups([{ path: "b.ts", threads }], ["b.ts"]);

  expect(threads.map(t => t.root.id)).toEqual(["b-9", "b-1"]);
});
