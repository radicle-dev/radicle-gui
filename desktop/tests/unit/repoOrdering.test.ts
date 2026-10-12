import { describe, expect, test } from "vitest";

import {
  inboxRepoOrder,
  pinnedFirst,
  pinnedIn,
  togglePinned,
} from "@app/lib/repoOrdering";

type Repo = { rid: string; name: string };
const repo = (rid: string, name = rid): Repo => ({ rid, name });
const rids = (repos: Repo[]) => repos.map(r => r.rid);
const ridOf = (r: Repo) => r.rid;

describe("togglePinned", () => {
  test("pins at the front", () => {
    expect(togglePinned(["a"], "b")).toEqual(["b", "a"]);
  });

  test("unpins", () => {
    expect(togglePinned(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  test("doesn't change the given list", () => {
    const list = ["a"];
    togglePinned(list, "b");

    expect(list).toEqual(["a"]);
  });
});

describe("pinned ordering", () => {
  const repos = [repo("a"), repo("b"), repo("c"), repo("d")];

  test("pinnedIn lists present pins in pin order", () => {
    expect(rids(pinnedIn(repos, ["c", "gone", "a"], ridOf))).toEqual([
      "c",
      "a",
    ]);
  });

  test("pinnedFirst puts pins first and keeps the rest in order", () => {
    expect(rids(pinnedFirst(repos, ["c", "a"], ridOf))).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });
});

test("inboxRepoOrder lists pinned, then the rest by name, then hidden by name", () => {
  const repos = [
    repo("1", "zebra"),
    repo("3", "mango"),
    repo("2", "apple"),
    repo("4", "banana"),
    repo("6", "yak"),
    repo("5", "cherry"),
  ];

  expect(
    rids(inboxRepoOrder(repos, ["3"], ["6", "5"], ridOf, r => r.name)),
  ).toEqual(["3", "2", "4", "1", "5", "6"]);
});
