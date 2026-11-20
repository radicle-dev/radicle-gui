import { describe, expect, test } from "vitest";

import { isCobCacheKey, isJobsKey, isRepoInfoKey, keys } from "../src/keys";

const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const id = "d87dcfe8c2b3200e78b128d9b959cfdf7063fefe";

describe("key classifiers", () => {
  test("job lists", () => {
    expect(isJobsKey(keys.jobs(rid))).toBe(true);
    expect(isJobsKey(keys.repo(rid))).toBe(false);
    expect(isJobsKey(keys.issues(rid))).toBe(false);
  });

  test("repository info", () => {
    expect(isRepoInfoKey(keys.repoInfo(rid))).toBe(true);
    expect(isRepoInfoKey(keys.repos())).toBe(false);
  });

  test("data the COB cache holds", () => {
    for (const key of [
      keys.repoInfo(rid),
      keys.issues(rid),
      keys.issueList(rid, "open"),
      keys.issue(rid, id),
      keys.patches(rid),
      keys.patch(rid, id),
    ]) {
      expect(isCobCacheKey(key)).toBe(true);
    }
    for (const key of [
      keys.repo(rid),
      keys.code(rid),
      keys.jobs(rid),
      keys.releases(rid),
      keys.boards(rid),
      keys.notifications(),
    ]) {
      expect(isCobCacheKey(key)).toBe(false);
    }
  });
});
