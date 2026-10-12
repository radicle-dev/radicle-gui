import type { Author } from "@bindings/cob/Author";
import type { Embed } from "@bindings/cob/thread/Embed";

import { draftReviewStorage } from "@app/lib/draftReviewStorage";
import { invoke } from "@app/lib/invoke";
import { publicKeyFromDid } from "@app/lib/utils";

// Which object a code comment hangs off. Editing, deleting, resolving and
// reacting all dispatch on this, because the protocol action differs per kind.
export type CommentOwner =
  | { kind: "draft"; draftId: string }
  | { kind: "review"; reviewId: string }
  | { kind: "revision"; revisionId: string };

export interface CommentActionsContext {
  rid: string;
  patchId: string;
  publicKey: string;
  announce: boolean;
  // Returns undefined for a comment this view doesn't know about, in which
  // case the action is skipped rather than sent with a guessed target.
  ownerOf: (commentId: string) => CommentOwner | undefined;
  reload: () => Promise<void>;
}

export interface CommentActions {
  editComment: (
    commentId: string,
    body: string,
    embeds: Embed[],
  ) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  changeCommentStatus: (commentId: string, resolved: boolean) => Promise<void>;
  reactOnComment: (
    commentId: string,
    authors: Author[],
    reaction: string,
  ) => Promise<void>;
}

export function commentActions(ctx: CommentActionsContext): CommentActions {
  const { rid, patchId, publicKey, announce, ownerOf, reload } = ctx;
  const opts = { announce };

  async function run(
    label: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: any,
  ): Promise<void> {
    try {
      await invoke("edit_patch", { rid, cobId: patchId, action, opts });
    } catch (error) {
      console.error(`${label} failed`, error);
    } finally {
      await reload();
    }
  }

  return {
    async editComment(commentId, body, embeds) {
      const owner = ownerOf(commentId);
      if (!owner) return;
      if (owner.kind === "draft") {
        draftReviewStorage.updateComment(owner.draftId, commentId, { body });
        await reload();
        return;
      }
      await run(
        "Editing comment",
        owner.kind === "review"
          ? {
              type: "review.comment.edit",
              review: owner.reviewId,
              comment: commentId,
              body,
              embeds,
            }
          : {
              type: "revision.comment.edit",
              revision: owner.revisionId,
              comment: commentId,
              body,
              embeds,
            },
      );
    },

    async deleteComment(commentId) {
      const owner = ownerOf(commentId);
      if (!owner) return;
      if (owner.kind === "draft") {
        draftReviewStorage.deleteComment(owner.draftId, commentId);
        await reload();
        return;
      }
      await run(
        "Deleting comment",
        owner.kind === "review"
          ? {
              type: "review.comment.redact",
              review: owner.reviewId,
              comment: commentId,
            }
          : {
              type: "revision.comment.redact",
              revision: owner.revisionId,
              comment: commentId,
            },
      );
    },

    async changeCommentStatus(commentId, resolved) {
      // Only review comments carry a resolved state; drafts and standalone
      // revision comments have no review to attach the change to.
      const owner = ownerOf(commentId);
      if (owner?.kind !== "review") return;
      await run("Changing comment status", {
        type: resolved ? "review.comment.resolve" : "review.comment.unresolve",
        review: owner.reviewId,
        comment: commentId,
      });
    },

    async reactOnComment(commentId, authors, reaction) {
      const owner = ownerOf(commentId);
      if (!owner || owner.kind === "draft") return;
      const active = !authors.find(
        ({ did }) => publicKeyFromDid(did) === publicKey,
      );
      await run(
        "Reacting on comment",
        owner.kind === "review"
          ? {
              type: "review.comment.react",
              review: owner.reviewId,
              comment: commentId,
              reaction,
              active,
            }
          : {
              type: "revision.comment.react",
              revision: owner.revisionId,
              comment: commentId,
              reaction,
              active,
            },
      );
    },
  };
}
