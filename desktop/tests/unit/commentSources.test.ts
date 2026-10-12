import { describe, expect, test } from "vitest";

import { commentSourcesOf, STANDALONE_COMMENTS } from "@app/lib/commentSources";

import { author, comment, location, review, revision } from "./support/cobs";

const alice = author("alice");
const bob = author("bob");
const carol = author("carol");
const code = location("src/main.rs", "new", 3);

describe("commentSourcesOf", () => {
  test("lists each review with code comments, counting only roots", () => {
    const sources = commentSourcesOf(
      revision({
        reviews: [
          review({
            id: "r1",
            author: alice,
            comments: [
              comment({ id: "a", location: code }),
              comment({ id: "b", location: code }),
              comment({ id: "reply", location: code, replyTo: "a" }),
            ],
          }),
        ],
      }),
    );

    expect(sources).toEqual([
      { id: "r1", name: "alice", count: 2, nids: ["z6Mkalice"] },
    ]);
  });

  test("skips reviews without code comments", () => {
    const sources = commentSourcesOf(
      revision({
        reviews: [
          review({ id: "r1", comments: [comment({ location: null })] }),
          review({ id: "r2", comments: [] }),
        ],
      }),
    );

    expect(sources).toEqual([]);
  });

  test("names a review author without an alias by a short key", () => {
    const [source] = commentSourcesOf(
      revision({
        reviews: [
          review({
            author: author("anonymous", null),
            comments: [comment({ location: code })],
          }),
        ],
      }),
    );

    expect(source.name).toBe("z6Mkan");
  });

  test("collects code comments outside reviews into their own bucket", () => {
    const sources = commentSourcesOf(
      revision({
        discussion: [
          comment({ id: "1", author: bob, location: code }),
          comment({ id: "2", author: carol, location: code }),
          comment({ id: "3", author: bob, location: code }),
          comment({ id: "plain", author: alice, location: null }),
          comment({ id: "reply", author: alice, location: code, replyTo: "1" }),
        ],
      }),
    );

    expect(sources).toEqual([
      {
        id: STANDALONE_COMMENTS,
        name: "Not part of a review",
        count: 3,
        nids: ["z6Mkbob", "z6Mkcarol"],
      },
    ]);
  });

  test("puts reviews before the standalone bucket", () => {
    const sources = commentSourcesOf(
      revision({
        reviews: [
          review({ id: "r1", comments: [comment({ location: code })] }),
        ],
        discussion: [comment({ location: code })],
      }),
    );

    expect(sources.map(s => s.id)).toEqual(["r1", STANDALONE_COMMENTS]);
  });
});
