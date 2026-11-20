import { describe, expect, test } from "vitest";

import { keys } from "../src/keys";
import { affectedKeys } from "../src/refUpdates";

const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const nid = "z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";
const issue = "d87dcfe8c2b3200e78b128d9b959cfdf7063fefe";

describe("affectedKeys", () => {
  test("an update without refs affects the whole repository", () => {
    expect(affectedKeys({ rid })).toEqual([keys.repo(rid)]);
  });

  test("an issue affects itself, the issue list and the repository info", () => {
    expect(
      affectedKeys({
        rid,
        refs: [
          `refs/namespaces/${nid}/refs/cobs/xyz.radicle.issue/${issue}`,
          `refs/namespaces/${nid}/refs/rad/sigrefs`,
        ],
      }),
    ).toEqual([keys.issue(rid, issue), keys.issues(rid), keys.repoInfo(rid)]);
  });

  test("branches affect the code and the repository info once", () => {
    expect(
      affectedKeys({
        rid,
        refs: [
          `refs/namespaces/${nid}/refs/heads/main`,
          `refs/namespaces/${nid}/refs/tags/v1.0.0`,
        ],
      }),
    ).toEqual([keys.code(rid), keys.repoInfo(rid)]);
  });

  test("a CI job affects the repository's job lists only", () => {
    expect(
      affectedKeys({
        rid,
        refs: [`refs/namespaces/${nid}/refs/cobs/xyz.radworks.job/${issue}`],
      }),
    ).toEqual([keys.jobs(rid)]);
  });

  test("releases and boards affect only their own keys", () => {
    expect(
      affectedKeys({
        rid,
        refs: [
          `refs/namespaces/${nid}/refs/cobs/dev.radicle.artifact/${issue}`,
          `refs/namespaces/${nid}/refs/cobs/works.monadic.board/${issue}`,
        ],
      }),
    ).toEqual([keys.releases(rid), keys.boards(rid)]);
  });

  test("an identity update affects the whole repository", () => {
    expect(
      affectedKeys({
        rid,
        refs: [
          `refs/namespaces/${nid}/refs/cobs/xyz.radicle.patch/${issue}`,
          `refs/namespaces/${nid}/refs/rad/id`,
        ],
      }),
    ).toEqual([keys.repo(rid)]);
  });
});
