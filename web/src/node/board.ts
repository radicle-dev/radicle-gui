import type { Board, BoardColumn, BoardPlacement, Issue, Patch, PersonId, Repo } from "./model";

import { rng } from "./hash";

// The columns a repository's board starts with, as desktop has them.
export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: "backlog", name: "Backlog" },
  { id: "todo", name: "Todo" },
  { id: "in-progress", name: "In Progress" },
  { id: "in-review", name: "In Review" },
  { id: "done", name: "Done", closes: "solved" },
  { id: "canceled", name: "Canceled", closes: "closed" },
];

export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "none", label: "No priority" },
];

const PRIORITY_PREFIX = "priority:";
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

// Priority is a label, `priority:high`, so any client can read it.
export function priorityOf(labels: string[]): Priority {
  const value = labels.find(l => l.startsWith(PRIORITY_PREFIX))?.slice(PRIORITY_PREFIX.length);
  return PRIORITIES.find(p => p.id === value && p.id !== "none")?.id ?? "none";
}

export function labelsForPriority(labels: string[], priority: Priority): string[] {
  const rest = labels.filter(l => !l.startsWith(PRIORITY_PREFIX));
  return priority === "none" ? rest : [...rest, `${PRIORITY_PREFIX}${priority}`];
}

export function displayLabels(labels: string[]): string[] {
  return labels.filter(l => !l.startsWith(PRIORITY_PREFIX));
}

// Where a card nobody has placed sorts: by priority, then newest first. Every
// peer derives the same one, so a card dropped between two unplaced cards
// keeps its place between them.
export function derivedPosition(labels: string[], time: number): number {
  return PRIORITY_RANK[priorityOf(labels)] * 1e13 + (1e13 - time);
}

// Patches that mention an issue's short id work on that issue.
export function patchesFor(issue: Issue, patches: Patch[]): Patch[] {
  const short = issue.id.slice(0, 7);
  return patches.filter(
    p => p.title.includes(short) || p.revisions.some(r => r.description.includes(short)),
  );
}

// Who may move a card: delegates, its author, and anyone assigned to it.
export function canMoveCard(repo: Repo, person: PersonId, cob: Issue | Patch): boolean {
  return (
    repo.delegates.includes(person) ||
    cob.author === person ||
    ("assignees" in cob && cob.assignees.includes(person))
  );
}

// The board each seeded repository starts with, so boards look used rather
// than empty: work in flight sits in its column, and bugs carry a priority.
export function seedBoard(repo: Repo): Board | undefined {
  if (repo.issues.length + repo.patches.length < 4) return undefined;
  const r = rng(`board:${repo.rid}`);
  const by = repo.delegates[0];
  const cards: BoardPlacement[] = [];
  const place = (kind: "issue" | "patch", cob: Issue | Patch, column: string) =>
    cards.push({
      kind,
      id: cob.id,
      column,
      position: derivedPosition(cob.labels, cob.time),
      movedBy: by,
      movedAt: cob.time,
    });

  for (const issue of repo.issues) {
    if (issue.state !== "open") continue;
    const bug = issue.labels.includes("bug");
    const roll = r();
    const priority: Priority = bug
      ? roll < 0.25
        ? "urgent"
        : "high"
      : roll < 0.3
        ? "medium"
        : roll < 0.55
          ? "low"
          : "none";
    issue.labels = labelsForPriority(issue.labels, priority);
    if (issue.assignees.length > 0) place("issue", issue, "in-progress");
    else if (bug || r() < 0.35) place("issue", issue, "todo");
  }
  for (const patch of repo.patches) {
    if (patch.state === "open") place("patch", patch, "in-review");
    else if (patch.state === "draft") place("patch", patch, "in-progress");
  }
  return { columns: DEFAULT_COLUMNS.map(c => ({ ...c })), cards };
}
