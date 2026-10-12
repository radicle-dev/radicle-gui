import type { Issue } from "@bindings/cob/issue/Issue";

import { expect, test } from "vitest";

import { issueTimeline } from "@app/lib/issueTimeline";

import { author, operation } from "./support/cobs";

const alice = author("alice");
const bob = author("bob");

function issue(props: Partial<Issue> = {}): Issue {
  return {
    id: "issue",
    author: alice,
    title: "Title",
    state: { status: "open" },
    assignees: [],
    commentCount: 0,
    labels: [],
    timestamp: 50,
    ...props,
  };
}

test("starts with the opening, timed by the first edit of the body", () => {
  const [opened] = issueTimeline(
    issue({
      body: {
        id: "body",
        author: alice,
        edits: [{ author: alice, timestamp: 7, body: "Description" }],
        reactions: [],
        replyTo: null,
        location: null,
        resolved: false,
      },
    }),
    [],
  );

  expect(opened).toEqual({
    key: "issue:opened",
    timestamp: 7,
    data: { type: "opened", id: "issue", author: alice, timestamp: 7 },
  });
});

test("falls back to the issue's timestamp without a body", () => {
  expect(issueTimeline(issue(), [])[0].timestamp).toBe(50);
});

test("leaves comments out of the timeline", () => {
  const items = issueTimeline(issue(), [
    operation(bob, 60, [
      { type: "comment", body: "Hi" },
      { type: "comment.edit", id: "c", body: "Hello" },
      { type: "comment.react", id: "c", reaction: "👍", active: true },
      { type: "comment.redact", id: "c" },
      { type: "label", labels: ["bug"] },
    ]),
  ]);

  expect(items.map(i => i.data.type)).toEqual(["opened", "label"]);
});
