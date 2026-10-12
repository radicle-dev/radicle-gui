import type { Revision } from "@bindings/cob/patch/Revision";
import type { Commit } from "@bindings/repo/Commit";

import type { RevisionListSettings } from "@app/lib/revisionListSettings";

// How the revision picker presents a patch's revisions. Kept out of the patch
// view so the ordering rules can be read — and tested — on their own.
//
// Revisions arrive in the patch's timeline order and that order is what the
// numbering means; see `revisionPosition` in `utils`. Sorting only reorders the
// dropdown and grouping only buckets it, so neither may change what "Revision
// N of M" refers to.

/// 1-based timeline position per revision id, so the dropdown labels a revision
/// the same way the button above it does no matter how the list is arranged.
export function revisionNumbers(revisions: Revision[]): Record<string, number> {
  const numbers: Record<string, number> = {};
  revisions.forEach((rev, index) => {
    numbers[rev.id] = index + 1;
  });
  return numbers;
}

export function orderRevisions(
  revisions: Revision[],
  patchAuthorDid: string,
  settings: RevisionListSettings,
): Revision[] {
  if (!settings.groupByAuthor) {
    return settings.sortDesc ? [...revisions].reverse() : [...revisions];
  }
  // The patch author's revisions come first, then every other author's in the
  // order they first appear in the timeline. The date direction applies within
  // each group rather than to the group order.

  const groups = new Map<string, Revision[]>();
  for (const rev of revisions) {
    const group = groups.get(rev.author.did);
    if (group) group.push(rev);
    else groups.set(rev.author.did, [rev]);
  }
  const orderedKeys = [...groups.keys()].sort(
    (a, b) => Number(b === patchAuthorDid) - Number(a === patchAuthorDid),
  );
  return orderedKeys.flatMap(key => {
    const group = groups.get(key) ?? [];
    return settings.sortDesc ? [...group].reverse() : group;
  });
}

/// The commits each revision adds over the revisions before it, in the order
/// `commitsOf` lists them. A later revision usually contains every earlier
/// commit, so counting its full range would count them again.
export function newCommitsByRevision(
  revisions: { id: string }[],
  commitsOf: (revisionId: string) => Commit[],
): Record<string, Commit[]> {
  const seen = new Set<string>();
  const result: Record<string, Commit[]> = {};
  for (const revision of revisions) {
    const added = commitsOf(revision.id).filter(c => !seen.has(c.id));
    added.forEach(c => seen.add(c.id));
    result[revision.id] = added;
  }
  return result;
}
