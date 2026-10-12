import type { Commit } from "@bindings/repo/Commit";

import { describe, expect, test } from "vitest";

import {
  newCommitsByRevision,
  orderRevisions,
  revisionNumbers,
} from "@app/lib/revisionList";
import type { RevisionListSettings } from "@app/lib/revisionListSettings";

import { author, revision } from "./support/cobs";

const alice = author("alice");
const bob = author("bob");
const carol = author("carol");

// Timeline order: bob and carol both push before the patch author's second
// revision, so grouping has to move revisions around.
const revisions = [
  revision({ id: "a1", author: alice }),
  revision({ id: "b1", author: bob }),
  revision({ id: "c1", author: carol }),
  revision({ id: "a2", author: alice }),
  revision({ id: "b2", author: bob }),
];

function settings(props: Partial<RevisionListSettings>): RevisionListSettings {
  return {
    sortDesc: false,
    groupByAuthor: false,
    showNumber: false,
    showStats: false,
    showReviewers: true,
    ...props,
  };
}

function ids(ordered: { id: string }[]) {
  return ordered.map(r => r.id);
}

test("revisionNumbers numbers revisions by timeline position from 1", () => {
  expect(revisionNumbers(revisions)).toEqual({
    a1: 1,
    b1: 2,
    c1: 3,
    a2: 4,
    b2: 5,
  });
});

describe("orderRevisions", () => {
  test("keeps the timeline order by default", () => {
    expect(ids(orderRevisions(revisions, alice.did, settings({})))).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "b2",
    ]);
  });

  test("reverses the timeline when sorting descending", () => {
    expect(
      ids(orderRevisions(revisions, alice.did, settings({ sortDesc: true }))),
    ).toEqual(["b2", "a2", "c1", "b1", "a1"]);
  });

  test("groups by author, patch author first, others by first appearance", () => {
    expect(
      ids(
        orderRevisions(revisions, carol.did, settings({ groupByAuthor: true })),
      ),
    ).toEqual(["c1", "a1", "a2", "b1", "b2"]);
  });

  test("sorting descending reverses within groups, not the group order", () => {
    expect(
      ids(
        orderRevisions(
          revisions,
          alice.did,
          settings({ groupByAuthor: true, sortDesc: true }),
        ),
      ),
    ).toEqual(["a2", "a1", "b2", "b1", "c1"]);
  });

  test("does not reorder the caller's array", () => {
    const input = [...revisions];
    orderRevisions(input, alice.did, settings({ sortDesc: true }));
    orderRevisions(
      input,
      alice.did,
      settings({ groupByAuthor: true, sortDesc: true }),
    );

    expect(ids(input)).toEqual(ids(revisions));
  });
});

test("newCommitsByRevision keeps only commits not in an earlier revision", () => {
  const c = (id: string) => ({ id }) as Commit;
  const commits: Record<string, Commit[]> = {
    a1: [c("1"), c("2")],
    b1: [c("1"), c("2"), c("3")],
    c1: [c("2"), c("4"), c("3"), c("5")],
  };

  const added = newCommitsByRevision(
    [{ id: "a1" }, { id: "b1" }, { id: "c1" }],
    id => commits[id],
  );

  expect(
    Object.fromEntries(
      Object.entries(added).map(([id, list]) => [id, list.map(x => x.id)]),
    ),
  ).toEqual({ a1: ["1", "2"], b1: ["3"], c1: ["4", "5"] });
});
