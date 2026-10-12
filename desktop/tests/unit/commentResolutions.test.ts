import { describe, expect, test } from "vitest";

import { resolutionsByComment } from "@app/lib/commentResolutions";

import { author, operation } from "./support/cobs";

const alice = author("alice");
const bob = author("bob");

function resolve(comment: string) {
  return { type: "review.comment.resolve" as const, review: "r", comment };
}

function unresolve(comment: string) {
  return { type: "review.comment.unresolve" as const, review: "r", comment };
}

describe("resolutionsByComment", () => {
  test("records who resolved a comment and when", () => {
    const resolutions = resolutionsByComment([
      operation(alice, 10, [resolve("c1")]),
    ]);

    expect(resolutions.get("c1")).toEqual({ author: alice, timestamp: 10 });
  });

  test("the latest resolve wins", () => {
    const resolutions = resolutionsByComment([
      operation(alice, 10, [resolve("c1")]),
      operation(bob, 20, [resolve("c1")]),
    ]);

    expect(resolutions.get("c1")).toEqual({ author: bob, timestamp: 20 });
  });

  test("replays operations in timestamp order, not array order", () => {
    const resolutions = resolutionsByComment([
      operation(bob, 20, [unresolve("c1")]),
      operation(alice, 10, [resolve("c1")]),
    ]);

    expect(resolutions.has("c1")).toBe(false);
  });

  test("unresolving drops the entry", () => {
    const resolutions = resolutionsByComment([
      operation(alice, 10, [resolve("c1"), resolve("c2")]),
      operation(bob, 20, [unresolve("c1")]),
    ]);

    expect([...resolutions.keys()]).toEqual(["c2"]);
  });

  test("ignores other actions", () => {
    const resolutions = resolutionsByComment([
      operation(alice, 10, [{ type: "label", labels: ["bug"] }]),
    ]);

    expect(resolutions.size).toBe(0);
  });

  test("does not reorder the caller's array", () => {
    const activity = [
      operation(bob, 20, [resolve("c1")]),
      operation(alice, 10, [resolve("c2")]),
    ];
    resolutionsByComment(activity);

    expect(activity.map(op => op.timestamp)).toEqual([20, 10]);
  });
});
