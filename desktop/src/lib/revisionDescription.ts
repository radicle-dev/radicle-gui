import type { Revision } from "@bindings/cob/patch/Revision";
import type { Commit } from "@bindings/repo/Commit";

/// A description's first line and the rest, both trimmed.
export function splitDescription(text: string): {
  subject?: string;
  body?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const idx = trimmed.indexOf("\n");
  if (idx === -1) return { subject: trimmed };
  const subject = trimmed.slice(0, idx).trim();
  const body = trimmed.slice(idx + 1).trim();
  return {
    subject: subject || undefined,
    body: body || undefined,
  };
}

/// Swaps the body beneath the subject, keeping everything else as written.
export function replaceDescriptionBody(
  description: string,
  body: string,
): string {
  const { subject = "", body: current = "" } = splitDescription(description);
  const subjectEnd = description.indexOf(subject) + subject.length;
  const start = current ? description.indexOf(current, subjectEnd) : -1;
  if (start === -1) {
    return subject ? `${subject}\n\n${body}` : body;
  }
  return (
    description.slice(0, start) +
    body +
    description.slice(start + current.length)
  );
}

/// The first line of a revision's current description.
export function revisionTitle(revision: Revision): string | undefined {
  return splitDescription(revision.description.at(-1)?.body ?? "").subject;
}

/// A description that is exactly the list of commit summaries is the default
/// Radicle produces, and is noise next to the commits themselves.
export function isCommitListDescription(
  description: string,
  commits: Commit[] | undefined,
): boolean {
  if (!commits || commits.length === 0) return false;
  const lines = description
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  if (lines.length !== commits.length) return false;
  const summaries = new Set(commits.map(c => c.summary.trim()));
  return lines.every(line => summaries.has(line));
}

/// Consecutive commits by the same author name.
export function groupCommitsByAuthor(commits: Commit[]): Commit[][] {
  const groups: Commit[][] = [];
  for (const commit of commits) {
    const last = groups[groups.length - 1];
    if (last && last[0].author.name === commit.author.name) {
      last.push(commit);
    } else {
      groups.push([commit]);
    }
  }
  return groups;
}

const MAX_COMMITS_VISIBLE = 3;
const COMMIT_COLLAPSE_THRESHOLD = 5;

/// Which of a group's commits to show. A long group shows its first few until
/// the reader expands it.
export function visibleCommitsOf(
  group: Commit[],
  expanded: boolean,
): { collapsed: boolean; visible: Commit[]; hiddenCount: number } {
  const collapsed = !expanded && group.length > COMMIT_COLLAPSE_THRESHOLD;
  return collapsed
    ? {
        collapsed,
        visible: group.slice(0, MAX_COMMITS_VISIBLE),
        hiddenCount: group.length - MAX_COMMITS_VISIBLE,
      }
    : { collapsed, visible: group, hiddenCount: 0 };
}
