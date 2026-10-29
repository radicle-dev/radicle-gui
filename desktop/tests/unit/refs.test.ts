import type { Remote } from "@bindings/repo/Remote";

import { describe, expect, test } from "vitest";

import { selectedRefType, sortedTags, sortRemotes } from "@app/lib/refs";

function tag(timestamp: number) {
  return { oid: "o", timestamp };
}

function remote(props: Partial<Remote> = {}): Remote {
  return { id: "z6Mk", delegate: false, branches: {}, tags: {}, ...props };
}

test("sortedTags sorts by version, newest first", () => {
  const sorted = sortedTags({
    "v0.1.0": tag(1),
    "v0.10.0": tag(4),
    "v0.2.0": tag(2),
    "v1.0.0-rc.10": tag(6),
    "v1.0.0": tag(7),
    "v1.0.0-rc.2": tag(5),
    "v0.10.1": tag(3),
  });

  expect(sorted.map(([name]) => name)).toEqual([
    "v1.0.0",
    "v1.0.0-rc.10",
    "v1.0.0-rc.2",
    "v0.10.1",
    "v0.10.0",
    "v0.2.0",
    "v0.1.0",
  ]);
});

test("sortedTags keeps namespaces together, most recent first", () => {
  const sorted = sortedTags({
    "releases/0.29.0": tag(3),
    "releases/0.9.0": tag(1),
    "releases/desktop/0.16.0": tag(3),
    "releases/desktop/0.17.0": tag(4),
    "releases/httpd/0.29.0": tag(3),
    "releases/httpd/0.30.0": tag(5),
  });

  expect(sorted.map(([name]) => name)).toEqual([
    "releases/httpd/0.30.0",
    "releases/httpd/0.29.0",
    "releases/desktop/0.17.0",
    "releases/desktop/0.16.0",
    "releases/0.29.0",
    "releases/0.9.0",
  ]);
});

test("sortRemotes puts delegates first, then aliased peers by alias, then by NID", () => {
  const sorted = sortRemotes([
    { id: "b", delegate: false },
    { id: "z", alias: "Bob", delegate: false },
    { id: "a", delegate: false },
    { id: "y", alias: "alice", delegate: false },
    { id: "d", delegate: true },
    { id: "x", alias: "zed", delegate: true },
  ]);

  expect(sorted.map(r => r.id)).toEqual(["x", "d", "y", "z", "a", "b"]);
});

describe("selectedRefType", () => {
  const canonical = { branches: { main: "o" }, tags: { "v1.0": tag(1) } };

  test.each([
    [undefined, "branch"],
    ["main", "branch"],
    ["v1.0", "tag"],
    ["default", "branch"],
    ["abc123", undefined],
  ])("canonical %j is a %j", (revision, expected) => {
    expect(selectedRefType(revision, undefined, canonical, "default")).toBe(
      expected,
    );
  });

  test.each([
    ["feature", "branch"],
    ["v2.0", "tag"],
    ["main", undefined],
    ["default", undefined],
  ])("a peer's %j is a %j", (revision, expected) => {
    const peer = remote({
      branches: { feature: "o" },
      tags: { "v2.0": tag(1) },
    });

    expect(selectedRefType(revision, peer, canonical, "default")).toBe(
      expected,
    );
  });

  test("refs that haven't loaded yet only know the default branch", () => {
    expect(selectedRefType("default", undefined, undefined, "default")).toBe(
      "branch",
    );
    expect(selectedRefType("main", undefined, undefined, "default")).toBe(
      undefined,
    );
  });
});
