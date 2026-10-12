import type { Commit } from "@bindings/repo/Commit";

import { describe, expect, test } from "vitest";

import {
  groupCommitsByAuthor,
  isCommitListDescription,
  replaceDescriptionBody,
  revisionTitle,
  splitDescription,
  visibleCommitsOf,
} from "@app/lib/revisionDescription";

import { revision } from "./support/cobs";

function commit(id: string, summary = id, name = "Alice"): Commit {
  const person = { name, email: `${name}@x`, time: 0 };
  return {
    id,
    author: person,
    committer: person,
    summary,
    message: summary,
    parents: [],
  };
}

describe("splitDescription", () => {
  test.each([
    ["", {}],
    ["  ", {}],
    ["Subject", { subject: "Subject" }],
    ["  Subject  \n\n  Body text  ", { subject: "Subject", body: "Body text" }],
    ["Subject\n", { subject: "Subject" }],
  ])("splits %j into %j", (text, expected) => {
    expect(splitDescription(text)).toEqual(expected);
  });
});

describe("replaceDescriptionBody", () => {
  test.each([
    ["Subject\n\nold", "Subject\n\nnew"],
    ["Subject\nold", "Subject\nnew"],
    ["Subject\r\n\r\nold\r\n", "Subject\r\n\r\nnew\r\n"],
    ["  Subject  \n\n  old  \n", "  Subject  \n\n  new  \n"],
  ])("keeps the subject and spacing of %j", (description, expected) => {
    expect(replaceDescriptionBody(description, "new")).toBe(expected);
  });

  test("replaces the body even when the subject contains its text", () => {
    expect(replaceDescriptionBody("Fix old\n\nold", "new")).toBe(
      "Fix old\n\nnew",
    );
  });

  test("adds a body to a description that has none", () => {
    expect(replaceDescriptionBody("Subject", "new")).toBe("Subject\n\nnew");
  });

  test("leaves an empty description as just the body", () => {
    expect(replaceDescriptionBody("", "new")).toBe("new");
  });
});

test("revisionTitle is the first line of the current description", () => {
  const edit = (body: string) => ({
    author: revision().author,
    timestamp: 0,
    body,
  });

  expect(
    revisionTitle(revision({ description: [edit("Old"), edit("New\nbody")] })),
  ).toBe("New");
  expect(revisionTitle(revision({ description: [] }))).toBeUndefined();
  expect(
    revisionTitle(revision({ description: [edit("  \n  ")] })),
  ).toBeUndefined();
});

describe("isCommitListDescription", () => {
  const commits = [commit("a", "Add a"), commit("b", "Fix b")];

  test("matches a description that lists the commit summaries", () => {
    expect(isCommitListDescription("Add a\nFix b", commits)).toBe(true);
    expect(isCommitListDescription("  Fix b\n\nAdd a  ", commits)).toBe(true);
  });

  test.each([
    ["Add a", "a line is missing"],
    ["Add a\nFix b\nMore", "there is an extra line"],
    ["Add a\nSomething else", "a line isn't a summary"],
  ])("doesn't match %j because %s", description => {
    expect(isCommitListDescription(description, commits)).toBe(false);
  });

  test("doesn't match without commits", () => {
    expect(isCommitListDescription("", [])).toBe(false);
    expect(isCommitListDescription("Add a", undefined)).toBe(false);
  });
});

test("groupCommitsByAuthor groups consecutive commits by author name", () => {
  const groups = groupCommitsByAuthor([
    commit("1", "1", "Alice"),
    commit("2", "2", "Alice"),
    commit("3", "3", "Bob"),
    commit("4", "4", "Alice"),
  ]);

  expect(groups.map(g => g.map(c => c.id))).toEqual([["1", "2"], ["3"], ["4"]]);
});

describe("visibleCommitsOf", () => {
  const group = (n: number) =>
    Array.from({ length: n }, (_, i) => commit(`${i}`));

  test("shows a short group in full", () => {
    expect(visibleCommitsOf(group(5), false)).toMatchObject({
      collapsed: false,
      hiddenCount: 0,
    });
    expect(visibleCommitsOf(group(5), false).visible).toHaveLength(5);
  });

  test("collapses a long group to its first three", () => {
    const { collapsed, visible, hiddenCount } = visibleCommitsOf(
      group(6),
      false,
    );

    expect(collapsed).toBe(true);
    expect(visible.map(c => c.id)).toEqual(["0", "1", "2"]);
    expect(hiddenCount).toBe(3);
  });

  test("shows a long group in full once expanded", () => {
    expect(visibleCommitsOf(group(6), true)).toMatchObject({
      collapsed: false,
      hiddenCount: 0,
    });
    expect(visibleCommitsOf(group(6), true).visible).toHaveLength(6);
  });
});
