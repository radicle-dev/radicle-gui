import { expect, test } from "vitest";

import { patchContributions } from "@app/lib/patchContributions";

import { author, comment, review, revision } from "./support/cobs";

const alice = author("alice");
const bob = author("bob");

const revisions = [
  revision({
    id: "r1",
    author: alice,
    discussion: [
      comment({ author: alice }),
      comment({ author: bob }),
      comment({ author: bob }),
    ],
    reviews: [
      review({
        author: bob,
        comments: [comment({ author: bob }), comment({ author: alice })],
      }),
    ],
  }),
  revision({
    id: "r2",
    author: bob,
    reviews: [review({ author: alice }), review({ author: bob })],
  }),
];

test("counts one person's revisions, comments and reviews", () => {
  expect(patchContributions(revisions, bob.did)).toEqual({
    revisionCount: 1,
    commentCount: 3,
    reviewCount: 2,
  });
});

test("counts comments in revision discussions and in reviews", () => {
  expect(patchContributions(revisions, alice.did)).toEqual({
    revisionCount: 1,
    commentCount: 2,
    reviewCount: 1,
  });
});

test("counts nothing for someone who took no part", () => {
  expect(patchContributions(revisions, author("carol").did)).toEqual({
    revisionCount: 0,
    commentCount: 0,
    reviewCount: 0,
  });
});
