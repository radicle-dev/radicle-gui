import type { Author } from "@bindings/cob/Author";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { Commit } from "@bindings/repo/Commit";

import { pluralize, truncateDid } from "@app/lib/utils";

// How a revision's commits compare with the previous revision's.
export type RevisionChange = {
  kind:
    | "first"
    | "previousNotLoaded"
    | "sameHead"
    | "noneShared"
    | "onlyNew"
    | "onlyGone"
    | "newAndGone";
  totalCommits: number;
  previousNumber?: number;
  previousAuthor?: Author;
  newCommits: number;
  goneCommits: number;
  baseMoved: boolean;
  base: string;
  sameLines?: boolean;
};

// Returns how each revision compares with the previous one, keyed by revision
// id. Pass `revisions` in patch order, oldest first. A revision whose commits
// did not load gets no entry, and the next revision is not compared.
export function revisionChanges(
  revisions: Pick<Revision, "id" | "base" | "head" | "author">[],
  commitsOf: (revisionId: string) => Commit[] | undefined,
  diffHashOf: (revisionId: string) => string | undefined = () => undefined,
): Record<string, RevisionChange> {
  const changes: Record<string, RevisionChange> = {};

  revisions.forEach((revision, index) => {
    const commits = commitsOf(revision.id);
    if (commits === undefined) return;
    const totalCommits = commits.length;
    const previous = index > 0 ? revisions[index - 1] : undefined;
    const previousCommits = previous ? commitsOf(previous.id) : undefined;

    if (previous === undefined || previousCommits === undefined) {
      changes[revision.id] = {
        kind: previous ? "previousNotLoaded" : "first",
        totalCommits,
        newCommits: totalCommits,
        goneCommits: 0,
        baseMoved: false,
        base: revision.base,
      };
      return;
    }

    const ids = new Set(commits.map(c => c.id));
    const previousIds = new Set(previousCommits.map(c => c.id));
    const newCommits = commits.filter(c => !previousIds.has(c.id)).length;
    const goneCommits = previousCommits.filter(c => !ids.has(c.id)).length;
    const baseMoved = revision.base !== previous.base;
    const diffHash = diffHashOf(revision.id);
    const previousDiffHash = diffHashOf(previous.id);
    const sameLines =
      diffHash !== undefined && previousDiffHash !== undefined
        ? { sameLines: diffHash === previousDiffHash }
        : {};
    // Set only when someone else pushed the previous revision. Two people can
    // share an alias, and then only the did tells them apart.
    let previousAuthor: Author | undefined;
    if (previous.author.did !== revision.author.did) {
      previousAuthor =
        previous.author.alias === revision.author.alias
          ? { did: previous.author.did }
          : previous.author;
    }

    let kind: RevisionChange["kind"];
    if (revision.head === previous.head) kind = "sameHead";
    else if (newCommits === 0) kind = "onlyGone";
    else if (goneCommits === 0) kind = "onlyNew";
    else if (newCommits === totalCommits) kind = "noneShared";
    else kind = "newAndGone";

    changes[revision.id] = {
      kind,
      totalCommits,
      previousNumber: index,
      ...(previousAuthor && { previousAuthor }),
      newCommits,
      goneCommits,
      baseMoved,
      base: revision.base,
      ...sameLines,
    };
  });

  return changes;
}

// Returns the tooltip text, or undefined when the previous revision did not load.
export function revisionChangeTooltip(
  change: RevisionChange,
): string | undefined {
  const who = change.previousAuthor
    ? ` by ${change.previousAuthor.alias ?? truncateDid(change.previousAuthor.did)}`
    : "";
  const previous = `r${change.previousNumber}${who}`;
  const total = `${change.totalCommits} ${pluralize("commit", change.totalCommits)}`;
  const base = change.base.slice(0, 7);
  // Whether the lines match says whether the code changed, so that sentence comes first.
  const lead =
    change.sameLines === undefined
      ? ""
      : `${change.sameLines ? "Same changed lines as" : "Changed lines differ from"} ${previous}. `;
  const sincePrevious = lead ? "" : ` since ${previous}`;
  const baseNow =
    change.baseMoved && change.kind !== "noneShared"
      ? `, base now ${base}`
      : "";

  switch (change.kind) {
    case "first":
      return `First revision, ${total}`;
    case "previousNotLoaded":
      return undefined;
    case "sameHead":
      return `Same head as ${previous}, ${total}${baseNow}`;
    case "noneShared": {
      const common = `none in common with the ${change.goneCommits} in ${previous}`;
      const newBase = change.baseMoved ? `, new base ${base}` : "";
      return `${lead}${total}, ${common}${newBase}`;
    }
    case "onlyNew":
      return `${change.newCommits} new since ${previous}, ${total} in total${baseNow}`;
    case "onlyGone":
      return `${change.goneCommits} gone since ${previous}, ${total} ${
        change.totalCommits === 1 ? "remains" : "remain"
      }${baseNow}`;
    case "newAndGone":
      if (change.sameLines) {
        const ids = change.newCommits === 1 ? "has a new id" : "have new ids";
        return `${lead}${change.newCommits} of ${total} ${ids}, ${change.goneCommits} gone${baseNow}`;
      }
      return `${lead}${change.newCommits} new, ${change.goneCommits} gone${sincePrevious}, ${total} in total${baseNow}`;
  }
}
