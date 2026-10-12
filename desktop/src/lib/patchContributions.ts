import type { Revision } from "@bindings/cob/patch/Revision";

import type { PatchUserActivity } from "@app/lib/patchActivityContext";

/// What one person contributed to a patch, counted from the revisions in hand.
///
/// A revision's discussion holds only real comments — its description is a
/// field of its own — and the same is true of a review's summary versus its
/// code comments, so nothing has to be excluded from either count.
export function patchContributions(
  revisions: Revision[],
  did: string,
): Pick<PatchUserActivity, "revisionCount" | "commentCount" | "reviewCount"> {
  let revisionCount = 0;
  let commentCount = 0;
  let reviewCount = 0;
  for (const rev of revisions) {
    if (rev.author.did === did) revisionCount += 1;
    for (const comment of rev.discussion ?? []) {
      if (comment.author.did === did) commentCount += 1;
    }
    for (const review of rev.reviews ?? []) {
      if (review.author.did === did) reviewCount += 1;
      for (const comment of review.comments ?? []) {
        if (comment.author.did === did) commentCount += 1;
      }
    }
  }
  return { revisionCount, commentCount, reviewCount };
}
