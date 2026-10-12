import { describe, expect, test } from "vitest";

import {
  buildThreads,
  codeThreadsByReview,
  discussionThreadsByReview,
  groupThreadsByFile,
  isCodeRoot,
  reviewDiscussionThreads,
  reviewIdByComment,
  revisionDiscussionThreads,
  revisionIdByComment,
} from "@app/lib/threads";

import {
  author,
  comment,
  location,
  review,
  revision,
  thread,
} from "./support/cobs";

const alice = author("alice");
const bob = author("bob");
const code = location("a.ts", "new", 1);

function ids(threads: { root: { id: string }; replies: { id: string }[] }[]) {
  return threads.map(t => [t.root.id, ...t.replies.map(r => r.id)]);
}

describe("buildThreads", () => {
  test("attaches replies to their root, oldest first", () => {
    const threads = buildThreads(
      [
        comment({ id: "root" }),
        comment({ id: "late", replyTo: "root", timestamp: 20 }),
        comment({ id: "early", replyTo: "root", timestamp: 10 }),
        comment({ id: "other" }),
      ],
      c => !c.replyTo,
    );

    expect(ids(threads)).toEqual([["root", "early", "late"], ["other"]]);
  });

  test("isCodeRoot picks located comments that aren't replies", () => {
    expect(isCodeRoot(comment({ location: code }))).toBe(true);
    expect(isCodeRoot(comment({ location: code, replyTo: "x" }))).toBe(false);
    expect(isCodeRoot(comment({ location: null }))).toBe(false);
  });
});

describe("threads by review", () => {
  const reviews = [
    review({
      id: "r1",
      comments: [
        comment({ id: "code", location: code }),
        comment({ id: "code-reply", location: code, replyTo: "code" }),
        comment({ id: "general" }),
        comment({ id: "on-review", location: code, replyTo: "r1" }),
      ],
    }),
    review({ id: "r2", comments: [] }),
  ];

  test("codeThreadsByReview keeps reviews with code threads", () => {
    const map = codeThreadsByReview(reviews);

    expect([...map.keys()]).toEqual(["r1"]);
    expect(ids(map.get("r1") ?? [])).toEqual([["code", "code-reply"]]);
  });

  test("a reply to the review itself starts a discussion thread", () => {
    expect(ids(reviewDiscussionThreads(reviews[0]))).toEqual([
      ["general"],
      ["on-review"],
    ]);
  });

  test("discussionThreadsByReview keeps reviews with discussion threads", () => {
    expect([...discussionThreadsByReview(reviews).keys()]).toEqual(["r1"]);
  });

  test("reviewIdByComment maps roots and replies to their review", () => {
    const map = reviewIdByComment(
      codeThreadsByReview(reviews),
      discussionThreadsByReview(reviews),
    );

    expect(Object.fromEntries(map)).toEqual({
      code: "r1",
      "code-reply": "r1",
      general: "r1",
      "on-review": "r1",
    });
  });
});

test("revisionIdByComment maps discussion comments to their revision", () => {
  const map = revisionIdByComment([
    revision({ id: "v1", discussion: [comment({ id: "a" })] }),
    revision({ id: "v2", discussion: [comment({ id: "b" })] }),
  ]);

  expect(Object.fromEntries(map)).toEqual({ a: "v1", b: "v2" });
});

test("groupThreadsByFile groups by path in order of first appearance", () => {
  const groups = groupThreadsByFile([
    thread(comment({ id: "b1", location: location("b.ts", "new", 1) })),
    thread(comment({ id: "a1", location: location("a.ts", "new", 1) })),
    thread(comment({ id: "b2", location: location("b.ts", "old", 4) })),
    thread(comment({ id: "none", location: null })),
  ]);

  expect(groups.map(g => [g.path, ...g.threads.map(t => t.root.id)])).toEqual([
    ["b.ts", "b1", "b2"],
    ["a.ts", "a1"],
  ]);
});

describe("revisionDiscussionThreads", () => {
  test("collects each revision's plain comments and replies to it", () => {
    const threads = revisionDiscussionThreads([
      revision({
        id: "v1",
        discussion: [
          comment({ id: "c1" }),
          comment({ id: "reply", replyTo: "c1" }),
          comment({ id: "code", location: code }),
          comment({ id: "on-revision", replyTo: "v1" }),
        ],
      }),
      revision({ id: "v2", discussion: [comment({ id: "c2" })] }),
    ]);

    expect(ids(threads)).toEqual([["c1", "reply"], ["on-revision"], ["c2"]]);
  });

  test("skips the revision's own description comment", () => {
    expect(
      revisionDiscussionThreads([
        revision({ id: "v1", discussion: [comment({ id: "v1" })] }),
      ]),
    ).toEqual([]);
  });

  test("skips a comment repeating its author's review summary", () => {
    const threads = revisionDiscussionThreads([
      revision({
        id: "v1",
        reviews: [review({ author: alice, summary: "LGTM" })],
        discussion: [
          comment({
            id: "repeat",
            author: alice,
            edits: [edit(alice, "LGTM")],
          }),
          comment({
            id: "other-author",
            author: bob,
            edits: [edit(bob, "LGTM")],
          }),
          comment({
            id: "edited",
            author: alice,
            edits: [edit(alice, "LGTM"), edit(alice, "Changed")],
          }),
        ],
      }),
    ]);

    expect(ids(threads)).toEqual([["other-author"], ["edited"]]);
  });
});

function edit(by: typeof alice, body: string) {
  return { author: by, timestamp: 0, body };
}
