import type { Author } from "@bindings/cob/Author";
import type { Operation } from "@bindings/cob/Operation";
import type { Action } from "@bindings/cob/patch/Action";
import type { Commit } from "@bindings/repo/Commit";

import { describe, expect, test } from "vitest";

import type { ActivityItem } from "@app/lib/cobActivity";
import type { PatchActivityData } from "@app/lib/patchTimeline";
import { openingDraftOpId, patchTimeline } from "@app/lib/patchTimeline";

import { author, comment, location, revision, thread } from "./support/cobs";

const alice = author("alice");
const bob = author("bob");

function op(
  id: string,
  timestamp: number,
  actions: Action[],
  by: Author = alice,
): Operation<Action> {
  return { id, author: by, timestamp, actions };
}

function revisionOp(id: string, timestamp: number, by: Author = alice) {
  return op(
    id,
    timestamp,
    [{ type: "revision", description: `Revision ${id}`, base: "b", oid: "o" }],
    by,
  );
}

function reviewOp(id: string, timestamp: number, of: string, by = bob) {
  return op(id, timestamp, [{ type: "review", revision: of }], by);
}

function timeline(
  activity: Operation<Action>[],
  props: {
    revisionIds?: string[];
    expanded?: Record<string, boolean>;
    commits?: Record<string, Commit[]>;
  } = {},
) {
  const revisionIds =
    props.revisionIds ??
    activity
      .filter(o => o.actions.some(a => a.type === "revision"))
      .map(o => o.id);
  return patchTimeline({
    activity,
    revisions: revisionIds.map(id => revision({ id })),
    commitsByRevision: props.commits ?? {},
    threadsByReview: new Map(),
    discussionThreadsByReview: new Map(),
    expandedRevisionRuns: props.expanded ?? {},
  });
}

// A compact view of the timeline: `opened`, `older(n)` for a fold, and the
// operation type and id for everything else.
function shape(items: ActivityItem<PatchActivityData>[]): string[] {
  return items.map(item => {
    const data = item.data;
    if (data.kind === "opened") {
      return data.openedAsDraft ? "opened-draft" : "opened";
    }
    if (data.kind === "olderRevisions") return `older(${data.count})`;
    return `${data.op.type}:${data.op.id}`;
  });
}

describe("openingDraftOpId", () => {
  const draft = {
    type: "lifecycle" as const,
    state: { status: "draft" as const },
  };

  test("finds a draft set in the first or second operation", () => {
    expect(openingDraftOpId([op("d", 1, [draft])])).toBe("d");
    expect(openingDraftOpId([revisionOp("r", 1), op("d", 2, [draft])])).toBe(
      "d",
    );
  });

  test("goes by timestamp, not array order", () => {
    expect(
      openingDraftOpId([
        op("d", 3, [draft]),
        revisionOp("r", 1),
        op("x", 2, [{ type: "label", labels: ["a"] }]),
      ]),
    ).toBeUndefined();
  });

  test("ignores a draft set later in the patch's life", () => {
    expect(
      openingDraftOpId([
        revisionOp("r", 1),
        op("x", 2, [{ type: "label", labels: ["a"] }]),
        op("d", 3, [draft]),
      ]),
    ).toBeUndefined();
  });

  test("ignores an opening lifecycle change that isn't to draft", () => {
    expect(
      openingDraftOpId([
        op("o", 1, [{ type: "lifecycle", state: { status: "open" } }]),
      ]),
    ).toBeUndefined();
    expect(
      openingDraftOpId([
        op("a", 1, [{ type: "lifecycle", state: { status: "archived" } }]),
      ]),
    ).toBeUndefined();
  });
});

describe("patchTimeline", () => {
  test("starts with the opening, then the first revision", () => {
    expect(shape(timeline([revisionOp("r1", 1)]))).toEqual([
      "opened",
      "revision:r1",
    ]);
  });

  test("folds a draft at creation into the opening", () => {
    expect(
      shape(
        timeline([
          revisionOp("r1", 1),
          op("d", 2, [{ type: "lifecycle", state: { status: "draft" } }]),
        ]),
      ),
    ).toEqual(["opened-draft", "revision:r1"]);
  });

  test("keeps a later switch to draft as its own entry", () => {
    expect(
      shape(
        timeline([
          revisionOp("r1", 1),
          op("l", 2, [{ type: "label", labels: ["x"] }]),
          op("d", 3, [{ type: "lifecycle", state: { status: "draft" } }]),
        ]),
      ),
    ).toEqual(["opened", "revision:r1", "label:l", "lifecycle:d"]);
  });

  test("places each review right after its revision", () => {
    expect(
      shape(
        timeline([
          revisionOp("r1", 1),
          revisionOp("r2", 2),
          reviewOp("v1", 3, "r1"),
        ]),
      ),
    ).toEqual(["opened", "revision:r1", "review:v1", "revision:r2"]);
  });

  test("orders entries by timestamp", () => {
    expect(
      shape(
        timeline([
          op("l", 5, [{ type: "label", labels: ["x"] }]),
          revisionOp("r1", 1),
        ]),
      ),
    ).toEqual(["opened", "revision:r1", "label:l"]);
  });

  test("folds review and revision edits into the entries they change", () => {
    const items = timeline([
      revisionOp("r1", 1),
      reviewOp("v1", 2, "r1"),
      op("e1", 3, [
        {
          type: "review.edit",
          review: "v1",
          verdict: "accept",
          summary: "LGTM",
        },
        { type: "revision.edit", revision: "r1", description: "Edited" },
      ]),
    ]);

    expect(shape(items)).toEqual(["opened", "revision:r1", "review:v1"]);
    expect(items[1].data).toMatchObject({
      op: { description: "Edited" },
    });
    expect(items[2].data).toMatchObject({
      op: { verdict: "accept", summary: "LGTM" },
    });
  });

  test("drops redacted revisions and reviews", () => {
    expect(
      shape(
        timeline(
          [
            revisionOp("r1", 1),
            revisionOp("r2", 2),
            reviewOp("v1", 3, "r1"),
            op("x", 4, [
              { type: "revision.redact", revision: "r2" },
              { type: "review.redact", review: "v1" },
            ]),
          ],
          { revisionIds: ["r1"] },
        ),
      ),
    ).toEqual(["opened", "revision:r1"]);
  });

  test("keeps a review of a redacted revision, at the end", () => {
    expect(
      shape(
        timeline(
          [
            revisionOp("r1", 1),
            revisionOp("r2", 2),
            reviewOp("v2", 3, "r2"),
            op("l", 4, [{ type: "label", labels: ["x"] }]),
            op("x", 5, [{ type: "revision.redact", revision: "r2" }]),
          ],
          { revisionIds: ["r1"] },
        ),
      ),
    ).toEqual(["opened", "revision:r1", "label:l", "review:v2"]);
  });

  test("attaches commits and marks merges and reviews as standalone", () => {
    const commits = [{ id: "c1" } as Commit];
    const items = timeline(
      [
        revisionOp("r1", 1),
        reviewOp("v1", 2, "r1"),
        op("m", 3, [{ type: "merge", revision: "r1", commit: "c1" }]),
      ],
      { commits: { r1: commits } },
    );

    expect(items[1].data).toMatchObject({ kind: "op", commits });
    expect(items.map(i => i.standalone)).toEqual([
      undefined,
      false,
      true,
      true,
    ]);
  });

  test("attaches a review's code and discussion threads", () => {
    const code = [thread(comment({ location: location("a.ts", "new", 1) }))];
    const discussion = [thread(comment())];
    const [, , review] = patchTimeline({
      activity: [revisionOp("r1", 1), reviewOp("v1", 2, "r1")],
      revisions: [revision({ id: "r1" })],
      commitsByRevision: {},
      threadsByReview: new Map([["v1", code]]),
      discussionThreadsByReview: new Map([["v1", discussion]]),
      expandedRevisionRuns: {},
    });

    expect(review.data).toMatchObject({
      reviewThreads: code,
      reviewComments: discussion,
    });
  });

  describe("older revisions", () => {
    const activity = [
      revisionOp("r1", 1),
      reviewOp("v1", 2, "r1", alice),
      revisionOp("r2", 3),
      revisionOp("r3", 4),
    ];

    test("folds a run of older revisions, with their reviews, by one author", () => {
      const items = timeline(activity);

      expect(shape(items)).toEqual(["opened", "older(2)", "revision:r3"]);
      expect(items[1].data).toEqual({
        kind: "olderRevisions",
        groupKey: "older:r1",
        revisionIds: ["r1", "r2"],
        count: 2,
        author: alice,
        expanded: false,
      });
    });

    test("shows the folded entries when the run is expanded", () => {
      expect(
        shape(timeline(activity, { expanded: { "older:r1": true } })),
      ).toEqual([
        "opened",
        "older(2)",
        "revision:r1",
        "review:v1",
        "revision:r2",
        "revision:r3",
      ]);
    });

    // Current behaviour, which may not be intended: a review by someone else
    // breaks the run, so reviewed revisions rarely fold.
    test("a review by another author breaks the run", () => {
      expect(
        shape(
          timeline([
            revisionOp("r1", 1),
            reviewOp("v1", 2, "r1", bob),
            revisionOp("r2", 3),
            revisionOp("r3", 4),
          ]),
        ),
      ).toEqual([
        "opened",
        "revision:r1",
        "review:v1",
        "revision:r2",
        "revision:r3",
      ]);
    });

    test("doesn't fold a lone older revision", () => {
      expect(
        shape(timeline([revisionOp("r1", 1), revisionOp("r2", 2)])),
      ).toEqual(["opened", "revision:r1", "revision:r2"]);
    });

    test("a different author breaks the run", () => {
      expect(
        shape(
          timeline([
            revisionOp("r1", 1),
            revisionOp("r2", 2, bob),
            revisionOp("r3", 3),
            revisionOp("r4", 4),
          ]),
        ),
      ).toEqual([
        "opened",
        "revision:r1",
        "revision:r2",
        "revision:r3",
        "revision:r4",
      ]);
    });

    test("another entry between revisions breaks the run", () => {
      expect(
        shape(
          timeline([
            revisionOp("r1", 1),
            op("l", 2, [{ type: "label", labels: ["x"] }]),
            revisionOp("r2", 3),
            revisionOp("r3", 4),
          ]),
        ),
      ).toEqual([
        "opened",
        "revision:r1",
        "label:l",
        "revision:r2",
        "revision:r3",
      ]);
    });
  });
});
