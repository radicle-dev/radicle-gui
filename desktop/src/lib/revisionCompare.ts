import { formatOid } from "@app/lib/utils";

interface RevisionCommits {
  id: string;
  base: string;
  head: string;
}

export interface RevisionRange {
  base: string;
  head: string;
  // The revision before this one, absent for the first.
  previous?: RevisionCommits;
}

export function compareRange(from: string, head: string): string {
  return `${formatOid(from)}..${formatOid(head)}`;
}

/// The range of the revision `revisionId` and the revision before it in
/// `revisions`, which are in timeline order, or nothing if it isn't there.
export function revisionRange(
  revisions: RevisionCommits[],
  revisionId: string,
): RevisionRange | undefined {
  const index = revisions.findIndex(r => r.id === revisionId);
  if (index < 0) return undefined;
  const { base, head } = revisions[index];
  return { base, head, previous: revisions[index - 1] };
}

/// The "compare to previous revision" option, or nothing for the first
/// revision.
export function previousOption({ base, head, previous }: RevisionRange):
  | {
      id: string;
      disabled: boolean;
      title: string;
      // The commit to diff `head` against.
      from: string;
    }
  | undefined {
  if (!previous) return undefined;
  // Diffing two heads on different bases would mix in every change between the
  // bases, so the previous revision is only offered on the same base.
  const baseMoved = previous.base !== base;
  // Nothing changed between two revisions on the same commit.
  const sameHead = previous.head === head;
  // An empty previous revision's head is this one's base, so comparing to it
  // would be comparing to the base.
  const previousEmpty = previous.head === base;
  return {
    id: previous.id,
    disabled: baseMoved || sameHead || previousEmpty,
    title: baseMoved
      ? "Previous revision has different base"
      : sameHead
        ? "Same commit as the previous revision"
        : previousEmpty
          ? "Previous revision has no changes"
          : compareRange(previous.head, head),
    from: previous.head,
  };
}
