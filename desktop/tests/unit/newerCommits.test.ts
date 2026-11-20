import { describe, expect, test } from "vitest";

import { newerCommits } from "@app/lib/newerCommits";

function commit(id: string, parents = ["p"]) {
  return { id, parents };
}

// A branch's history from its head, newest first, paged like the backend.
function history(...commits: { id: string; parents: string[] }[]) {
  return async (skip: number, take: number) => ({
    cursor: skip,
    content: commits.slice(skip, skip + take),
    more: skip + take < commits.length,
  });
}

describe("newerCommits", () => {
  test("returns the commits before the old head", async () => {
    const fetch = history(commit("c"), commit("b"), commit("a"));
    expect(await newerCommits(fetch, "a", 100, 10)).toEqual({
      type: "added",
      commits: [commit("c"), commit("b")],
      merge: false,
    });
  });

  test("follows pages until it finds the old head", async () => {
    const fetch = history(commit("d"), commit("c"), commit("b"), commit("a"));
    const result = await newerCommits(fetch, "a", 100, 2);
    expect(result).toEqual({
      type: "added",
      commits: [commit("d"), commit("c"), commit("b")],
      merge: false,
    });
  });

  test("says when a merge brought in older commits", async () => {
    const fetch = history(commit("m", ["a", "x"]), commit("a"));
    const result = await newerCommits(fetch, "a", 100, 10);
    expect(result).toMatchObject({ type: "added", merge: true });
  });

  test("an unmoved head adds nothing", async () => {
    const fetch = history(commit("a"));
    expect(await newerCommits(fetch, "a", 100, 10)).toEqual({
      type: "added",
      commits: [],
      merge: false,
    });
  });

  test("history without the old head was rewritten", async () => {
    const fetch = history(commit("c"), commit("b"));
    expect(await newerCommits(fetch, "a", 100, 10)).toEqual({
      type: "rewritten",
    });
  });

  test("gives up past the limit", async () => {
    const fetch = history(commit("d"), commit("c"), commit("b"), commit("a"));
    expect(await newerCommits(fetch, "a", 2, 2)).toEqual({ type: "rewritten" });
  });
});
