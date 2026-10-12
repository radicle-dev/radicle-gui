import { describe, expect, test } from "vitest";

import { findMentionTrigger } from "@app/lib/mentionTrigger";

const repo = "z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const rid = `rad:${repo}`;
const nid = "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi";
const oid = "5e4683023476778201ab25c87e1343fbfbe67c89";

function trigger(text: string, caret = text.length) {
  return findMentionTrigger(text, caret);
}

describe("queries", () => {
  test.each([
    ["@", { scope: "all", start: 0, query: "" }],
    ["#", { scope: "cobs", start: 0, query: "" }],
    ["hi @rud", { scope: "all", start: 3, query: "rud" }],
    ["(#fix", { scope: "cobs", start: 1, query: "fix" }],
    ["line\n@a.b-c", { scope: "all", start: 5, query: "a.b-c" }],
  ])("%j", (text, expected) => {
    expect(trigger(text)).toEqual({
      kind: "query",
      end: text.length,
      ...expected,
    });
  });

  test.each([
    ["an email address", "me@example"],
    ["a URL fragment", "page#section"],
    ["a heading", "# Heading"],
    ["a query past the limit", `@${"a".repeat(65)}`],
  ])("ignores %s", (_, text) => {
    expect(trigger(text)).toBeUndefined();
  });

  test("only considers text up to the caret", () => {
    expect(trigger("@rud and more", 4)).toMatchObject({ query: "rud" });
    expect(trigger("@rud and more")).toBeUndefined();
  });
});

describe("identifiers", () => {
  test.each([
    [`see did:key:${nid}`, 4, { type: "node", nid }],
    [`(${rid}`, 1, { type: "repo", rid }],
    [
      `https://app.radicle.xyz/nodes/seed/${rid}/issues/${oid}`,
      0,
      { type: "cob", kind: "issue", rid, oid },
    ],
    [`https://app.radicle.xyz/nodes/seed/${rid}`, 0, { type: "repo", rid }],
    [nid, 0, { type: "node", nid }],
    [`x ${repo}`, 2, { type: "repo", rid }],
  ])("%s", (text, start, target) => {
    expect(trigger(text)).toEqual({
      kind: "identifier",
      start,
      end: text.length,
      target,
    });
  });

  test("does not reopen on an inserted link", () => {
    expect(trigger(`[heartwood](${rid})`)).toBeUndefined();
  });

  test("offers a full oid, lowercased", () => {
    expect(trigger(`see ${oid.toUpperCase()}`)).toEqual({
      kind: "oid",
      start: 4,
      end: 44,
      oid,
    });
  });

  test("ignores an abbreviated oid", () => {
    expect(trigger(oid.slice(0, 39))).toBeUndefined();
  });
});

describe("explorer file links", () => {
  test("defers the branch and path split to the repo", () => {
    const url = `https://radicle.network/nodes/seed/${rid}/tree/0004-general-uri-scheme/general-uri-scheme.adoc`;
    expect(trigger(`see ${url}`)).toEqual({
      kind: "tree",
      start: 4,
      end: 4 + url.length,
      rid,
      namespace: undefined,
      path: "0004-general-uri-scheme/general-uri-scheme.adoc",
    });
  });
});

describe("rad: file links", () => {
  test("offers a file URI as a file", () => {
    const uri = `${rid}/commit/master?path=.github/README.md`;
    expect(trigger(`see ${uri}`)).toMatchObject({
      kind: "link",
      start: 4,
      end: 4 + uri.length,
    });
  });

  test.each([
    ["a tag", `${rid}/tag/v1.0`],
    ["a branch", `${rid}/commit/main`],
    ["a remote", `${rid}/${nid}`],
    [
      "a remote's explorer page",
      `https://radicle.network/nodes/seed/${rid}/remotes/${nid}`,
    ],
  ])("offers %s as a link", (_, text) => {
    expect(trigger(text)).toMatchObject({ kind: "link", start: 0 });
  });

  test.each([
    ["a tree by oid", `${rid}/tree/${oid}`],
    ["a blob by oid", `${rid}/blob/${oid}`],
    ["an unknown cob type", `${rid}/cob/org.example/${oid}`],
  ])("offers nothing for %s, which has no page", (_, text) => {
    expect(trigger(text)).toBeUndefined();
  });

  test("does not take the tail of a path as a bare id", () => {
    expect(trigger(`/some/path/${nid}`)).toBeUndefined();
    expect(trigger(`see:${oid}`)).toBeUndefined();
  });
});

describe("explorer links without a chip", () => {
  const node = "https://radicle.network/nodes/seed";

  test.each([
    ["an issue list", `${node}/${rid}/issues`],
    ["a path at an oid", `${node}/${rid}/tree/${oid}/src`],
    ["a tree at an oid", `${node}/${rid}/tree/${oid}`],
  ])("offers %s as a link", (_, url) => {
    expect(trigger(url)).toMatchObject({ kind: "link", start: 0 });
  });

  test("leaves a lone branch for the repo to resolve", () => {
    expect(trigger(`${node}/${rid}/tree/main`)).toMatchObject({
      kind: "tree",
      path: "main",
    });
  });
});

describe("releases and lines", () => {
  const node = "https://radicle.network/nodes/seed";

  test.each([
    `${node}/${rid}/releases/${oid}`,
    `${rid}/cob/dev.radicle.artifact/${oid}`,
  ])("offers %s as a release", link => {
    expect(trigger(link)).toMatchObject({
      kind: "identifier",
      target: { type: "cob", kind: "release", rid, oid },
    });
  });

  test("offers a release list as a link", () => {
    expect(trigger(`${node}/${rid}/releases`)).toMatchObject({
      kind: "link",
      reference: {
        uri: { resource: { type: "cob", typeName: "dev.radicle.artifact" } },
      },
    });
  });

  test("keeps the line of a file on a branch", () => {
    expect(trigger(`${node}/${rid}/tree/main/src/lib.rs#L10`)).toMatchObject({
      kind: "tree",
      path: "main/src/lib.rs",
      fragment: "L10",
    });
  });

  test("offers a rad: file URI with a line as a link", () => {
    expect(trigger(`${rid}/commit/main?path=src/lib.rs#L10`)).toMatchObject({
      kind: "link",
      reference: { uri: { fragment: "L10" } },
    });
  });
});
