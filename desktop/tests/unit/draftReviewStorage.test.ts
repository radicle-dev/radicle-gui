import { beforeEach, describe, expect, test, vi } from "vitest";

import { author, location } from "./support/cobs";

const invoke = vi.fn();
vi.mock("@app/lib/invoke", () => ({ invoke }));

const key = "repo.patches.draftReviews";
const alice = author("alice");
const bob = author("bob");
const aliceNid = "z6Mkalice";
const bobNid = "z6Mkbob";

// The store reads localStorage once, when the module loads.
async function load() {
  vi.resetModules();
  return (await import("@app/lib/draftReviewStorage")).draftReviewStorage;
}

function stored(): Record<string, Record<string, unknown>> {
  return JSON.parse(localStorage.getItem(key) ?? "{}");
}

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

describe("draftReviewStorage", () => {
  test("creates an empty accepting draft for its author", async () => {
    const drafts = await load();
    const id = drafts.create("rad:repo", "patch", "rev", aliceNid);

    expect(drafts.get(id, alice)).toEqual({
      id,
      draft: true,
      rid: "rad:repo",
      author: alice,
      revisionId: "rev",
      verdict: "accept",
      summary: "",
      labels: [],
      comments: [],
      checkedFiles: [],
    });
    expect(stored()[id]).toMatchObject({ nid: aliceNid, patchId: "patch" });
  });

  test("hides a draft from other identities", async () => {
    const drafts = await load();
    const id = drafts.create("rad:repo", "patch", "rev", aliceNid);

    expect(drafts.get(id, bob)).toBeUndefined();
    expect(drafts.getForRevision("rev", bob)).toBeUndefined();
    expect(drafts.hasForRevision("rev", bobNid)).toBe(false);
  });

  test("finds a draft by revision", async () => {
    const drafts = await load();
    drafts.create("rad:repo", "patch", "other", aliceNid);
    const id = drafts.create("rad:repo", "patch", "rev", aliceNid);

    expect(drafts.getForRevision("rev", alice)?.id).toBe(id);
    expect(drafts.hasForRevision("rev", aliceNid)).toBe(true);
    expect(drafts.hasForRevision("missing", aliceNid)).toBe(false);
  });

  test("updates summary, verdict and labels", async () => {
    const drafts = await load();
    const id = drafts.create("rad:repo", "patch", "rev", aliceNid);
    drafts.update(id, { summary: "LGTM", verdict: undefined, labels: ["ok"] });

    expect(drafts.get(id, alice)).toMatchObject({
      summary: "LGTM",
      verdict: undefined,
      labels: ["ok"],
    });
  });

  test("toggles checked files", async () => {
    const drafts = await load();
    const id = drafts.create("rad:repo", "patch", "rev", aliceNid);

    drafts.toggleCheckedFile(id, "a.ts");
    drafts.toggleCheckedFile(id, "b.ts");
    expect(drafts.isFileChecked(id, "a.ts")).toBe(true);

    drafts.toggleCheckedFile(id, "a.ts");
    expect(drafts.isFileChecked(id, "a.ts")).toBe(false);
    expect(drafts.get(id, alice)?.checkedFiles).toEqual(["b.ts"]);
    expect(drafts.isFileChecked("missing", "a.ts")).toBe(false);
  });

  describe("comments", () => {
    test("adds a comment as the draft author's", async () => {
      const drafts = await load();
      const id = drafts.create("rad:repo", "patch", "rev", aliceNid);
      const where = location("a.ts", "new", 3);
      const commentId = drafts.addComment(id, { body: "nit", location: where });

      expect(drafts.get(id, alice)?.comments).toEqual([
        {
          id: commentId,
          author: alice,
          edits: [{ author: alice, timestamp: 0, body: "nit" }],
          reactions: [],
          replyTo: null,
          location: where,
          resolved: false,
        },
      ]);
    });

    test("edits a comment's body", async () => {
      const drafts = await load();
      const id = drafts.create("rad:repo", "patch", "rev", aliceNid);
      const commentId = drafts.addComment(id, {
        body: "nit",
        location: location("a.ts", "new", 3),
      });
      drafts.updateComment(id, commentId, { body: "fixed" });

      expect(drafts.get(id, alice)?.comments[0].edits[0].body).toBe("fixed");
      expect(() => drafts.updateComment(id, "missing", { body: "x" })).toThrow(
        "Comment missing does not exist",
      );
    });

    test("deletes only the given comment", async () => {
      const drafts = await load();
      const id = drafts.create("rad:repo", "patch", "rev", aliceNid);
      const where = location("a.ts", "new", 3);
      const first = drafts.addComment(id, { body: "one", location: where });
      const second = drafts.addComment(id, { body: "two", location: where });

      drafts.deleteComment(id, "missing");
      expect(drafts.get(id, alice)?.comments.map(c => c.id)).toEqual([
        first,
        second,
      ]);

      drafts.deleteComment(id, first);
      expect(drafts.get(id, alice)?.comments.map(c => c.id)).toEqual([second]);
    });

    test("editing a draft that doesn't exist throws", async () => {
      const drafts = await load();

      expect(() =>
        drafts.addComment("missing", {
          body: "x",
          location: location("a.ts", "new", 1),
        }),
      ).toThrow("Draft review missing does not exist");
    });
  });

  test("deletes a draft and returns it", async () => {
    const drafts = await load();
    const id = drafts.create("rad:repo", "patch", "rev", aliceNid);

    expect(drafts.delete(id)?.id).toBe(id);
    expect(drafts.get(id, alice)).toBeUndefined();
    expect(stored()).toEqual({});
  });

  test("prunes only this author's drafts on this patch's removed revisions", async () => {
    const drafts = await load();
    const gone = drafts.create("rad:repo", "patch", "gone", aliceNid);
    const live = drafts.create("rad:repo", "patch", "live", aliceNid);
    const otherPatch = drafts.create("rad:repo", "other", "gone", aliceNid);
    const otherAuthor = drafts.create("rad:repo", "patch", "gone", bobNid);

    drafts.pruneStale("patch", ["live"], aliceNid);

    expect(Object.keys(stored()).sort()).toEqual(
      [live, otherPatch, otherAuthor].sort(),
    );
    expect(stored()[gone]).toBeUndefined();
  });

  describe("publish", () => {
    test("publishes the review, then deletes the draft", async () => {
      invoke.mockResolvedValue(undefined);
      const drafts = await load();
      const id = drafts.create("rad:repo", "patch", "rev", aliceNid);
      drafts.update(id, {
        summary: "LGTM",
        verdict: undefined,
        labels: ["ok"],
      });
      const where = location("a.ts", "new", 3);
      drafts.addComment(id, { body: "nit", location: where });

      await drafts.publish(id);

      expect(invoke).toHaveBeenCalledWith("create_patch_review", {
        args: {
          rid: "rad:repo",
          revision: "rev",
          verdict: null,
          summary: "LGTM",
          labels: ["ok"],
          comments: [{ body: "nit", location: where }],
        },
      });
      expect(drafts.get(id, alice)).toBeUndefined();
    });

    test("publishes a comment without a location as null", async () => {
      invoke.mockResolvedValue(undefined);
      localStorage.setItem(
        key,
        JSON.stringify({
          old: {
            id: "old",
            rid: "rad:repo",
            revision: "rev",
            labels: [],
            comments: [{ id: "c", body: "general remark" }],
          },
        }),
      );
      const drafts = await load();

      await drafts.publish("old");

      expect(invoke.mock.calls[0][1].args.comments).toEqual([
        { body: "general remark", location: null },
      ]);
    });

    test("keeps the draft when publishing fails", async () => {
      invoke.mockRejectedValue(new Error("offline"));
      const drafts = await load();
      const id = drafts.create("rad:repo", "patch", "rev", aliceNid);

      await expect(drafts.publish(id)).rejects.toThrow("offline");
      expect(drafts.get(id, alice)?.id).toBe(id);
    });

    test("rejects a draft that doesn't exist", async () => {
      const drafts = await load();

      await expect(drafts.publish("missing")).rejects.toThrow(
        "Review missing does not exist",
      );
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("persistence", () => {
    test("drafts survive a reload", async () => {
      const id = (await load()).create("rad:repo", "patch", "rev", aliceNid);

      expect((await load()).get(id, alice)?.revisionId).toBe("rev");
    });

    test("reads drafts stored before nid, patchId, summary and checkedFiles existed", async () => {
      localStorage.setItem(
        key,
        JSON.stringify({
          old: {
            id: "old",
            rid: "rad:repo",
            revision: "rev",
            labels: [],
            comments: [{ id: "c", body: "legacy" }],
          },
        }),
      );
      const drafts = await load();

      // Without a recorded author, the draft belongs to whoever is signed in.
      expect(drafts.get("old", bob)).toMatchObject({
        summary: "",
        checkedFiles: [],
        comments: [{ id: "c", location: null }],
      });
      // Without a patch id it can't be pruned.
      drafts.pruneStale("patch", [], bobNid);
      expect(drafts.get("old", bob)).toBeDefined();
    });

    test("starts empty when the stored data is invalid", async () => {
      localStorage.setItem(key, "{not json");
      expect((await load()).hasForRevision("rev", aliceNid)).toBe(false);

      localStorage.setItem(key, JSON.stringify({ x: { id: 1 } }));
      expect((await load()).get("x", alice)).toBeUndefined();
    });
  });
});
