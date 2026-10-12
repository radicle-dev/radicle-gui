import { describe, expect, test } from "vitest";

import type { ReviewEntry } from "@app/lib/reviewSummary";
import {
  entriesFromReviewers,
  entriesFromRevisions,
  isOutdatedReview,
  reviewSummary,
  summaryTitle,
} from "@app/lib/reviewSummary";

import * as cobs from "./support/cobs";

function review(
  alias: string,
  revisionNumber: number,
  verdict?: ReviewEntry["verdict"],
  delegate = false,
): ReviewEntry {
  return {
    author: { did: `did:key:${alias}`, alias },
    verdict,
    revisionNumber,
    delegate,
  };
}

describe("reviewSummary", () => {
  test("a verdict on the current revision keeps its colour", () => {
    const state = reviewSummary([review("alice", 2, "accept")], 2);
    expect(state.outdated).toBe(false);
    expect(state.allAccept).toBe(true);
  });

  test("an accept left behind by a newer revision is outdated, not approved", () => {
    const state = reviewSummary([review("alice", 1, "accept")], 3);
    expect(state.outdated).toBe(true);
    // The whole point: a stale accept must not read as a current approval.
    expect(state.allAccept).toBe(false);
  });

  test("a rejection is likewise suppressed once superseded", () => {
    const state = reviewSummary([review("alice", 1, "reject")], 2);
    expect(state.outdated).toBe(true);
    expect(state.hasReject).toBe(false);
  });

  test("one review covering the head keeps the summary current", () => {
    const state = reviewSummary(
      [review("alice", 1, "accept"), review("bob", 3, "accept")],
      3,
    );
    expect(state.outdated).toBe(false);
    expect(state.allAccept).toBe(true);
  });

  test("a single non-accept verdict blocks the accepted state", () => {
    const state = reviewSummary(
      [review("alice", 2, "accept"), review("bob", 2)],
      2,
    );
    expect(state.allAccept).toBe(false);
    expect(state.hasReject).toBe(false);
  });

  test("counts reviews but lists people once", () => {
    const state = reviewSummary(
      [
        review("alice", 1, "accept"),
        review("alice", 2, "accept"),
        review("bob", 2, "accept"),
      ],
      2,
    );
    expect(state.reviews).toHaveLength(3);
    expect(state.authors).toHaveLength(2);
  });

  test("delegates come first so they survive a truncated avatar stack", () => {
    const state = reviewSummary(
      [review("alice", 1), review("bob", 1, undefined, true)],
      1,
    );
    expect(state.authors.map(a => a.alias)).toEqual(["bob", "alice"]);
    expect(state.delegateCount).toBe(1);
  });

  test("groups an author's reviews together, newest revision first", () => {
    const state = reviewSummary(
      [review("alice", 1), review("bob", 2), review("alice", 3)],
      3,
    );
    expect(
      state.reviews.map(r => `${r.author.alias}${r.revisionNumber}`),
    ).toEqual(["alice3", "alice1", "bob2"]);
  });

  test("names the newest reviewed revision for the outdated hint", () => {
    const state = reviewSummary(
      [review("alice", 1, "accept"), review("bob", 2, "accept")],
      5,
    );
    expect(state.outdated).toBe(true);
    // The pill renders this as "· r2" — the latest anyone looked at, not the
    // oldest and not the patch's current revision.
    expect(state.latestReviewedRevision).toBe(2);
  });

  test("no reviews is not outdated", () => {
    const state = reviewSummary([], 3);
    expect(state.outdated).toBe(false);
    expect(state.reviews).toHaveLength(0);
  });

  test("an unknown revision count leaves the summary alone", () => {
    // The revision picker renders one revision's own reviews and passes no
    // count, since "outdated" has no meaning there.
    const state = reviewSummary([review("alice", 1, "accept")], 0);
    expect(state.outdated).toBe(false);
    expect(state.allAccept).toBe(true);
  });
});

describe("entries", () => {
  test("entriesFromRevisions numbers reviews by revision and marks delegates", () => {
    const alice = cobs.author("alice");
    const bob = cobs.author("bob");
    const entries = entriesFromRevisions(
      [
        cobs.revision({
          id: "rev1",
          reviews: [cobs.review({ id: "a", author: alice, verdict: "accept" })],
        }),
        cobs.revision({ id: "rev2" }),
        cobs.revision({
          id: "rev3",
          reviews: [cobs.review({ id: "b", author: bob, verdict: "reject" })],
        }),
      ],
      [bob.did],
    );

    expect(entries).toEqual([
      {
        author: alice,
        verdict: "accept",
        revisionNumber: 1,
        delegate: false,
        reviewId: "a",
      },
      {
        author: bob,
        verdict: "reject",
        revisionNumber: 3,
        delegate: true,
        reviewId: "b",
      },
    ]);
  });

  test("entriesFromReviewers keeps the reviewer fields, without a review id", () => {
    const reviewer = {
      author: cobs.author("alice"),
      verdict: "accept" as const,
      revisionNumber: 2,
      delegate: true,
    };

    expect(entriesFromReviewers([reviewer])).toEqual([reviewer]);
  });
});

test.each([
  [2, 3, true],
  [3, 3, false],
  [1, 0, false],
])(
  "isOutdatedReview for revision %j of %j is %j",
  (revisionNumber, revisionCount, expected) => {
    expect(
      isOutdatedReview(review("alice", revisionNumber), revisionCount),
    ).toBe(expected);
  },
);

describe("summaryTitle", () => {
  test("counts reviews and reviewers, singular and plural", () => {
    expect(summaryTitle(reviewSummary([review("alice", 1)], 1))).toBe(
      "1 review by 1 reviewer",
    );
    expect(
      summaryTitle(
        reviewSummary(
          [review("alice", 1), review("alice", 2), review("bob", 2)],
          2,
        ),
      ),
    ).toBe("3 reviews by 2 reviewers");
  });

  test("mentions delegates", () => {
    expect(
      summaryTitle(reviewSummary([review("alice", 1, undefined, true)], 1)),
    ).toBe("1 review by 1 reviewer, 1 a delegate");
  });

  test("warns when the reviews are outdated", () => {
    expect(summaryTitle(reviewSummary([review("alice", 2)], 4))).toBe(
      "1 review by 1 reviewer — newest is of revision 2, so these may no longer apply",
    );
  });
});
