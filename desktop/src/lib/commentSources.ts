import type { Revision } from "@bindings/cob/patch/Revision";

import { publicKeyFromDid } from "@app/lib/utils";

/// Identifies the bucket of code comments that belong to no review, so the
/// Changes tab can toggle them like it toggles a review. Not a review id, and
/// deliberately not shaped like one.
export const STANDALONE_COMMENTS = "standalone";

/// A togglable layer of code comments on the revision diff: one per review that
/// left any, plus a bucket for the comments that belong to no review.
export interface CommentSource {
  id: string;
  name: string;
  count: number;
  // A review has one author; the comments that belong to no review can have
  // several, so the row stacks the first few avatars.
  nids: string[];
}

export function commentSourcesOf(revision: Revision): CommentSource[] {
  const sources: CommentSource[] = [];
  for (const review of revision.reviews ?? []) {
    const count = (review.comments ?? []).filter(
      c => c.location && !c.replyTo,
    ).length;
    if (count === 0) continue;
    sources.push({
      id: review.id,
      name:
        review.author.alias ??
        publicKeyFromDid(review.author.did).substring(0, 6),
      count,
      nids: [publicKeyFromDid(review.author.did)],
    });
  }
  // Standalone located comments are a category of their own: a code comment can
  // be left on a revision without joining any review.
  const standalone = (revision.discussion ?? []).filter(
    c => c.location && !c.replyTo,
  );
  if (standalone.length > 0) {
    sources.push({
      id: STANDALONE_COMMENTS,
      name: "Not part of a review",
      count: standalone.length,
      nids: [...new Set(standalone.map(c => publicKeyFromDid(c.author.did)))],
    });
  }
  return sources;
}
