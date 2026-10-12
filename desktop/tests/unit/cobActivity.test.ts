import type { Action } from "@bindings/cob/issue/Action";

import { describe, expect, test, vi } from "vitest";

import { flattenActivity, itemDiff } from "@app/lib/cobActivity";

import { author, operation } from "./support/cobs";

const alice = author("alice");

function op(id: string, timestamp: number, actions: Action[]) {
  return { ...operation(alice, timestamp, []), id, actions };
}

test("itemDiff lists added and removed items", () => {
  expect(itemDiff(["a", "b"], ["b", "c"])).toEqual({
    removed: ["a"],
    added: ["c"],
  });
  expect(itemDiff([], [])).toEqual({ removed: [], added: [] });
});

test("itemDiff compares objects by key", () => {
  // Each action carries its own copies, so the same person is never the same
  // object twice.
  const previous = [author("alice"), author("bob")];
  const next = [author("bob"), author("carol")];

  expect(itemDiff(previous, next, a => a.did)).toEqual({
    removed: [author("alice")],
    added: [author("carol")],
  });
});

describe("flattenActivity", () => {
  const none = new Set<Action["type"]>();

  test("makes one entry per action with its operation's metadata", () => {
    const items = flattenActivity(
      [
        op("o1", 10, [
          { type: "lifecycle", state: { status: "closed", reason: "solved" } },
          { type: "assign", assignees: [alice] },
        ]),
      ],
      { skip: none },
    );

    expect(items).toEqual([
      {
        key: "o1:0",
        timestamp: 10,
        data: {
          type: "lifecycle",
          state: { status: "closed", reason: "solved" },
          id: "o1",
          author: alice,
          timestamp: 10,
          previous: undefined,
        },
      },
      {
        key: "o1:1",
        timestamp: 10,
        data: {
          type: "assign",
          assignees: [alice],
          id: "o1",
          author: alice,
          timestamp: 10,
          previous: undefined,
        },
      },
    ]);
  });

  test("gives each entry the previous action of its type", () => {
    const first = {
      type: "lifecycle" as const,
      state: { status: "open" as const },
    };
    const items = flattenActivity(
      [
        op("o1", 1, [first]),
        op("o2", 2, [
          { type: "lifecycle", state: { status: "closed", reason: "other" } },
        ]),
      ],
      { skip: none },
    );

    expect(items[1].data.previous).toEqual(first);
  });

  test("drops the first edit but diffs later ones against it", () => {
    const opening = { type: "edit" as const, title: "Opening title" };
    const items = flattenActivity(
      [
        op("o1", 1, [opening]),
        op("o2", 2, [{ type: "edit", title: "Renamed" }]),
      ],
      { skip: none },
    );

    expect(items.map(i => i.key)).toEqual(["o2:0"]);
    expect(items[0].data.previous).toEqual(opening);
  });

  test("drops label actions that change nothing", () => {
    const items = flattenActivity(
      [
        op("o1", 1, [{ type: "label", labels: ["bug"] }]),
        op("o2", 2, [{ type: "label", labels: ["bug"] }]),
        op("o3", 3, [{ type: "label", labels: ["bug", "ux"] }]),
        op("o4", 4, [{ type: "label", labels: [] }]),
      ],
      { skip: none },
    );

    expect(items.map(i => i.key)).toEqual(["o1:0", "o3:0", "o4:0"]);
  });

  test("drops skipped types, which still count as the previous action", () => {
    const onSkipped = vi.fn();
    const skipped = { type: "comment" as const, body: "hello" };
    const items = flattenActivity(
      [
        op("o1", 1, [skipped]),
        op("o2", 2, [{ type: "comment", body: "again" }]),
      ],
      { skip: new Set(["comment"]), onSkipped },
    );

    expect(items).toEqual([]);
    expect(onSkipped.mock.calls).toEqual([
      [skipped],
      [{ type: "comment", body: "again" }],
    ]);
  });

  test("passes each entry to onKept as it is made", () => {
    const kept: string[] = [];
    const items = flattenActivity(
      [
        op("o1", 1, [
          { type: "assign", assignees: [] },
          { type: "label", labels: ["x"] },
        ]),
      ],
      {
        skip: none,
        onKept: entry => {
          kept.push(entry.type);
          if (entry.type === "label") entry.labels = ["changed"];
        },
      },
    );

    expect(kept).toEqual(["assign", "label"]);
    // Callers fold later edits into the entry they were handed.
    expect(items[1].data).toMatchObject({ labels: ["changed"] });
  });
});
