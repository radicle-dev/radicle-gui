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

/// The latest revision before `revisionId` that has changes of its own, with
/// its 1-based timeline number. An empty revision (head already part of its
/// base) doesn't record why it is empty, so the Changes view points at this
/// one instead of guessing what was meant.
export function lastRevisionWithChanges(
  revisions: Revision[],
  revisionId: string,
): { id: string; number: number } | undefined {
  const index = revisions.findIndex(r => r.id === revisionId);
  for (let i = index - 1; i >= 0; i--) {
    if (revisions[i].base !== revisions[i].head) {
      return { id: revisions[i].id, number: i + 1 };
    }
  }
  return undefined;
}

/// The commit to select automatically: a single-commit revision has nothing
/// to choose between, so its only commit is selected to surface its message.
/// `listedRange` is the `base..head` the list was loaded for. Right after a
/// revision switch the list still holds the previous revision's commits, and
/// selecting from it would carry that commit over.
export function autoSelectedCommit(
  commits: Commit[],
  listedRange: string | undefined,
  range: string,
  selectedCommit: string | undefined,
): Commit | undefined {
  if (listedRange !== range || selectedCommit) return undefined;
  return commits.length === 1 ? commits[0] : undefined;
}
