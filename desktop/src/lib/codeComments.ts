import type { Author } from "@bindings/cob/Author";
import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
import type { Embed } from "@bindings/cob/thread/Embed";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { Config } from "@bindings/config/Config";

import type { Resolution } from "@app/lib/commentResolutions";

/// Says where a comment lives when a view mixes comments from several places —
/// a review's own comments and comments left directly on a revision look alike
/// otherwise, but they differ in what can be done to them.
export interface CommentOrigin {
  text: string;
  title?: string;
  onclick?: () => void;
}

/// Everything a diff renderer needs to superimpose code comments on the changes
/// and act on them. The host resolves which object each comment hangs off (a
/// draft review, a published review, or the revision itself) and which of them
/// the reader chose to see, so the renderer only places what it is handed.
export interface CodeComments {
  changeCommentStatus?: (commentId: string, resolved: boolean) => Promise<void>;
  // Whether this thread can be resolved and the current user may do it.
  // Decided by the host: the protocol allows the comment author, the review
  // author or the revision author, and only the host knows all three.
  canResolveComment?: (commentId: string) => boolean;
  // Who resolved a comment, for the resolved badge to name. Only the host can
  // say: it comes from the patch's operation log rather than from the comment
  // (see `resolutionsByComment`).
  resolvedBy?: (commentId: string) => Resolution | undefined;
  config: Config;
  createComment: (
    body: string,
    embeds: Embed[],
    replyTo?: string,
    location?: CodeLocation,
  ) => Promise<void>;
  // Defaults to "Comment".
  newCommentCaption?: string;
  newCommentDescription?: string;
  // When provided, the new-code-comment composer shows a second submit option
  // in the split-button dropdown that posts a `revision.comment` directly
  // (no review wrapping). The primary `createComment` continues to take
  // whatever path the host wires (typically: stash into a draft review).
  addCodeCommentDirect?: (
    body: string,
    embeds: Embed[],
    location: CodeLocation,
  ) => Promise<void>;
  addCodeCommentDirectCaption?: string;
  addCodeCommentDirectDescription?: string;
  editComment: (
    commentId: string,
    body: string,
    embeds: Embed[],
  ) => Promise<void>;
  reactOnComment?: (
    commentId: string,
    authors: Author[],
    reaction: string,
  ) => Promise<void>;
  deleteComment?: (commentId: string) => Promise<void>;
  // Defaults to `true`.
  canReply?: boolean;
  // See `ExtendedTextarea`.
  disableAttachments?: boolean | string;
  // For hosts whose surrounding context already shows the file path.
  hideThreadFileHeader?: boolean;
  // Unpublished draft roots, which render alongside published threads and so
  // have to be told apart.
  draftThreadIds?: string[];
  // Root comment id -> where that thread lives, so comments merged from
  // several sources stay distinguishable in one diff.
  threadOrigins?: Record<string, CommentOrigin>;
  repoDelegates: Author[];
  rid: string;
  threads: Thread<CodeLocation>[];
}
