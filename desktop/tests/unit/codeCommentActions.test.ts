import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CommentOwner } from "@app/lib/codeCommentActions";
import { commentActions } from "@app/lib/codeCommentActions";

import { author } from "./support/cobs";

const { invoke, draftReviewStorage } = vi.hoisted(() => ({
  invoke: vi.fn(),
  draftReviewStorage: { updateComment: vi.fn(), deleteComment: vi.fn() },
}));
vi.mock("@app/lib/invoke", () => ({ invoke }));
vi.mock("@app/lib/draftReviewStorage", () => ({ draftReviewStorage }));

const me = author("me");
const other = author("other");
const embeds = [{ name: "a.png", content: "data:image/png;base64," }];

const owners: Record<string, CommentOwner> = {
  d: { kind: "draft", draftId: "draft-1" },
  r: { kind: "review", reviewId: "review-1" },
  v: { kind: "revision", revisionId: "revision-1" },
};

let reload: ReturnType<typeof vi.fn<() => Promise<void>>>;

function actions(announce = false) {
  return commentActions({
    rid: "rad:z1",
    patchId: "patch-1",
    publicKey: me.did.replace("did:key:", ""),
    announce,
    ownerOf: id => owners[id],
    reload,
  });
}

function sentAction() {
  expect(invoke).toHaveBeenCalledTimes(1);
  const [command, args] = invoke.mock.calls[0];
  expect(command).toBe("edit_patch");
  expect(args).toMatchObject({ rid: "rad:z1", cobId: "patch-1" });
  return args.action;
}

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  draftReviewStorage.updateComment.mockReset();
  draftReviewStorage.deleteComment.mockReset();
  reload = vi.fn(() => Promise.resolve());
});

test("passes the announce option through", async () => {
  await actions(true).deleteComment("r");

  expect(invoke.mock.calls[0][1].opts).toEqual({ announce: true });
});

describe("editComment", () => {
  test("updates a draft comment locally", async () => {
    await actions().editComment("d", "new", embeds);

    expect(draftReviewStorage.updateComment).toHaveBeenCalledWith(
      "draft-1",
      "d",
      { body: "new" },
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      "r",
      {
        type: "review.comment.edit",
        review: "review-1",
        comment: "r",
        body: "new",
        embeds,
      },
    ],
    [
      "v",
      {
        type: "revision.comment.edit",
        revision: "revision-1",
        comment: "v",
        body: "new",
        embeds,
      },
    ],
  ])("edits comment %s on its owner", async (id, expected) => {
    await actions().editComment(id, "new", embeds);

    expect(sentAction()).toEqual(expected);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("deleteComment", () => {
  test("deletes a draft comment locally", async () => {
    await actions().deleteComment("d");

    expect(draftReviewStorage.deleteComment).toHaveBeenCalledWith(
      "draft-1",
      "d",
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["r", { type: "review.comment.redact", review: "review-1", comment: "r" }],
    [
      "v",
      { type: "revision.comment.redact", revision: "revision-1", comment: "v" },
    ],
  ])("redacts comment %s on its owner", async (id, expected) => {
    await actions().deleteComment(id);

    expect(sentAction()).toEqual(expected);
  });
});

describe("changeCommentStatus", () => {
  test.each([
    [true, "review.comment.resolve"],
    [false, "review.comment.unresolve"],
  ])("resolved=%s sends %s", async (resolved, type) => {
    await actions().changeCommentStatus("r", resolved);

    expect(sentAction()).toEqual({ type, review: "review-1", comment: "r" });
  });

  test.each(["d", "v"])("ignores comment %s outside a review", async id => {
    await actions().changeCommentStatus(id, true);

    expect(invoke).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("reactOnComment", () => {
  test.each([
    ["adds", [other], true],
    ["removes", [other, me], false],
  ])("%s the viewer's reaction", async (_, authors, active) => {
    await actions().reactOnComment("r", authors, "🚀");

    expect(sentAction()).toEqual({
      type: "review.comment.react",
      review: "review-1",
      comment: "r",
      reaction: "🚀",
      active,
    });
  });

  test("reacts on a revision comment", async () => {
    await actions().reactOnComment("v", [], "🚀");

    expect(sentAction()).toEqual({
      type: "revision.comment.react",
      revision: "revision-1",
      comment: "v",
      reaction: "🚀",
      active: true,
    });
  });

  test("ignores draft comments", async () => {
    await actions().reactOnComment("d", [], "🚀");

    expect(invoke).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

test.each([
  [
    "editComment",
    (a: ReturnType<typeof actions>) => a.editComment("x", "", []),
  ],
  ["deleteComment", (a: ReturnType<typeof actions>) => a.deleteComment("x")],
  [
    "reactOnComment",
    (a: ReturnType<typeof actions>) => a.reactOnComment("x", [], "🚀"),
  ],
])("%s skips comments without a known owner", async (_, act) => {
  await act(actions());

  expect(invoke).not.toHaveBeenCalled();
  expect(draftReviewStorage.updateComment).not.toHaveBeenCalled();
  expect(draftReviewStorage.deleteComment).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

test("reloads and logs when the action fails", async () => {
  const error = vi.spyOn(console, "error").mockReturnValue(undefined);
  invoke.mockRejectedValue(new Error("boom"));

  await actions().deleteComment("r");

  expect(error).toHaveBeenCalledWith(
    "Deleting comment failed",
    expect.any(Error),
  );
  expect(reload).toHaveBeenCalledTimes(1);
});
