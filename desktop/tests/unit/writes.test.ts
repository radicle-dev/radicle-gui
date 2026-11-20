import { keys } from "@radicle-gui/core/keys";
import { describe, expect, test } from "vitest";

import { writtenKeys } from "@app/lib/writes";

const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const id = "d87dcfe8c2b3200e78b128d9b959cfdf7063fefe";

describe("writtenKeys", () => {
  test("an issue edit affects the issue, its list and the counts", () => {
    expect(writtenKeys("edit_issue", { rid, cobId: id }, null)).toEqual([
      keys.issue(rid, id),
      keys.issues(rid),
      keys.repoInfo(rid),
    ]);
  });

  test("a new issue is named by the command's result", () => {
    expect(writtenKeys("create_issue", { rid }, { id })).toEqual([
      keys.issue(rid, id),
      keys.issues(rid),
      keys.repoInfo(rid),
    ]);
  });

  test("a patch comment affects the patch it was made on", () => {
    expect(
      writtenKeys("create_patch_comment", { rid, new: { id } }, null),
    ).toEqual([keys.patch(rid, id), keys.patches(rid), keys.repoInfo(rid)]);
  });

  test("a review refetches the repository's patches, which names none", () => {
    const written = writtenKeys(
      "create_patch_review",
      { args: { rid, revision: id } },
      id,
    );
    expect(written).toEqual([keys.patchDetails(rid), keys.patches(rid)]);
    // A prefix, so it covers whichever patch the review is on.
    expect(keys.patch(rid, id).slice(0, keys.patchDetails(rid).length)).toEqual(
      [...keys.patchDetails(rid)],
    );
  });

  test("seeding changes the repository info and list, cleaning anything", () => {
    expect(writtenKeys("seed", { rid }, null)).toEqual([
      keys.repoInfo(rid),
      keys.repos(),
    ]);
    expect(writtenKeys("unseed", { rid }, null)).toEqual([
      keys.repoInfo(rid),
      keys.repos(),
    ]);
    expect(writtenKeys("clean", { rid }, null)).toEqual([
      keys.repo(rid),
      keys.repos(),
    ]);
  });

  test("a failed issue creation names no issue", () => {
    expect(writtenKeys("create_issue", { rid }, undefined)).toEqual([]);
  });

  test("reads affect nothing", () => {
    expect(writtenKeys("issue_by_id", { rid, id }, null)).toEqual([]);
  });
});
