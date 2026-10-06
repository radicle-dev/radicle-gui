import type { Board } from "@bindings/cob/board/Board";
import type { Card } from "@bindings/cob/board/Card";
import type { Column } from "@bindings/cob/board/Column";
import type { PatchLink } from "@bindings/cob/board/PatchLink";
import type { Placement } from "@bindings/cob/board/Placement";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Patch } from "@bindings/cob/patch/Patch";

import { publicKeyFromDid } from "@app/lib/utils";

export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export type BoardView = "board" | "list";

export const ISSUE_TYPE = "xyz.radicle.issue";
export const PATCH_TYPE = "xyz.radicle.patch";

// Mirrors `radicle_board::default_columns`, for repositories that have no
// board yet.
export const DEFAULT_COLUMNS: Column[] = [
  { id: "backlog", name: "Backlog" },
  { id: "todo", name: "Todo" },
  { id: "in-progress", name: "In Progress" },
  { id: "in-review", name: "In Review" },
  { id: "done", name: "Done", closes: "solved" },
  { id: "canceled", name: "Canceled", closes: "other" },
];

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "none", label: "No priority" },
];

const PRIORITY_PREFIX = "priority:";

const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export function priorityOf(labels: string[]): Priority {
  const label = labels.find(l => l.startsWith(PRIORITY_PREFIX));
  const value = label?.slice(PRIORITY_PREFIX.length);
  return PRIORITIES.find(p => p.id === value && p.id !== "none")?.id ?? "none";
}

export function labelsForPriority(
  labels: string[],
  priority: Priority,
): string[] {
  const rest = labels.filter(l => !l.startsWith(PRIORITY_PREFIX));
  return priority === "none"
    ? rest
    : [...rest, `${PRIORITY_PREFIX}${priority}`];
}

export function displayLabels(labels: string[]): string[] {
  return labels.filter(l => !l.startsWith(PRIORITY_PREFIX));
}

interface ItemBase {
  key: string;
  card: Card;
  placement?: Placement;
  column: string;
  // Where the card sorts in its column: its stored position when it was
  // placed in that column, otherwise a position derived from the card itself.
  position: string;
}

export type BoardItem =
  | (ItemBase & {
      kind: "issue";
      issue: Issue;
      patches: Patch[];
      // Placed in a closing column but still open: someone without the right
      // to close it moved it there, and it closes once someone with the right
      // opens the board.
      pendingClose: boolean;
    })
  | (ItemBase & { kind: "patch"; patch: Patch })
  // A card from a repository we don't have locally.
  | (ItemBase & { kind: "unresolved" });

// What a card from another repository resolved to, if anything.
export type ForeignCard =
  | { kind: "issue"; issue: Issue }
  | { kind: "patch"; patch: Patch }
  | { kind: "unresolved" };

type Unpositioned = BoardItem extends infer T
  ? T extends BoardItem
    ? Omit<T, "position">
    : never
  : never;

export function cardKey(card: Card): string {
  return `${card.rid}/${card.typeName}/${card.oid}`;
}

export function cardFor(rid: string, typeName: string, oid: string): Card {
  return { rid, typeName, oid };
}

export function itemTitle(item: Unpositioned): string {
  if (item.kind === "issue") return item.issue.title;
  if (item.kind === "patch") return item.patch.title;
  return "Unresolved card";
}

export function itemLabels(item: Unpositioned): string[] {
  if (item.kind === "issue") return item.issue.labels;
  if (item.kind === "patch") return item.patch.labels;
  return [];
}

export function itemTimestamp(item: Unpositioned): number {
  if (item.kind === "issue") return item.issue.timestamp;
  if (item.kind === "patch") return item.patch.timestamp;
  return item.placement?.movedAt ?? 0;
}

function openColumn(columns: Column[]): string {
  return (columns.find(c => !c.closes) ?? columns[0]).id;
}

function closingColumn(
  columns: Column[],
  reason: "solved" | "other",
  placed?: Placement,
): string | undefined {
  const placedColumn = columns.find(c => c.id === placed?.column);
  if (placedColumn?.closes === reason) return placedColumn.id;
  return columns.find(c => c.closes === reason)?.id;
}

function hasColumn(columns: Column[], id: string): boolean {
  return columns.some(c => c.id === id);
}

function issueColumn(
  issue: Issue,
  patches: Patch[],
  placement: Placement | undefined,
  columns: Column[],
): { column: string; pendingClose: boolean } {
  if (issue.state.status === "closed") {
    return {
      column:
        closingColumn(columns, issue.state.reason, placement) ??
        openColumn(columns),
      pendingClose: false,
    };
  }
  if (patches.some(p => p.state.status === "merged")) {
    return {
      column: closingColumn(columns, "solved") ?? openColumn(columns),
      pendingClose: true,
    };
  }
  const placed = columns.find(c => c.id === placement?.column);
  if (placed) {
    return { column: placed.id, pendingClose: Boolean(placed.closes) };
  }
  if (
    patches.some(p => p.state.status === "open") &&
    hasColumn(columns, "in-review")
  ) {
    return { column: "in-review", pendingClose: false };
  }
  if (
    patches.some(p => p.state.status === "draft") &&
    hasColumn(columns, "in-progress")
  ) {
    return { column: "in-progress", pendingClose: false };
  }
  return { column: openColumn(columns), pendingClose: false };
}

function patchColumn(
  patch: Patch,
  placement: Placement | undefined,
  columns: Column[],
): string {
  if (patch.state.status === "merged") {
    return closingColumn(columns, "solved", placement) ?? openColumn(columns);
  }
  if (patch.state.status === "archived") {
    return closingColumn(columns, "other", placement) ?? openColumn(columns);
  }
  const placed = columns.find(c => c.id === placement?.column);
  return placed && !placed.closes ? placed.id : openColumn(columns);
}

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TIME_WIDTH = 8;
const TIME_MAX = DIGITS.length ** TIME_WIDTH - 1;

function base62(value: number, width: number): string {
  let out = "";
  let rest = Math.max(0, Math.floor(value));
  for (let i = 0; i < width; i++) {
    out = DIGITS[rest % DIGITS.length] + out;
    rest = Math.floor(rest / DIGITS.length);
  }
  return out;
}

// A position for a card nobody has placed in this column, valid for
// `radicle_board::position`: by priority, then newest first, then card. Every
// peer derives the same one, so a card dropped between two unplaced cards
// gets a stored position that keeps it between them.
function derivedPosition(item: Unpositioned): string {
  const labels = itemLabels(item);
  const timestamp = itemTimestamp(item);
  const rank = DIGITS[1 + PRIORITY_RANK[priorityOf(labels)]];
  return `U${rank}${base62(TIME_MAX - timestamp, TIME_WIDTH)}${item.card.oid.slice(0, 8)}1`;
}

// Cards in each column, in board order.
export function groupItems(
  rid: string,
  board: Board | undefined,
  issues: Issue[],
  patches: Patch[],
  links: PatchLink[],
  foreign: Map<string, ForeignCard> = new Map(),
): Record<string, BoardItem[]> {
  const columns = board?.columns ?? DEFAULT_COLUMNS;
  const placements = new Map<string, Placement>();
  for (const placement of board?.cards ?? []) {
    placements.set(cardKey(placement.card), placement);
  }

  const linkedPatches = new Set<string>();
  const patchesByIssue = new Map<string, Patch[]>();
  const patchById = new Map(patches.map(p => [p.id, p]));
  for (const link of links) {
    const patch = patchById.get(link.patch);
    if (!patch) continue;
    linkedPatches.add(patch.id);
    for (const issue of link.issues) {
      patchesByIssue.set(issue, [...(patchesByIssue.get(issue) ?? []), patch]);
    }
  }

  const items: Unpositioned[] = [];
  for (const issue of issues) {
    const card = cardFor(rid, ISSUE_TYPE, issue.id);
    const key = cardKey(card);
    const placement = placements.get(key);
    const linked = patchesByIssue.get(issue.id) ?? [];
    items.push({
      kind: "issue",
      key,
      card,
      placement,
      issue,
      patches: linked,
      ...issueColumn(issue, linked, placement, columns),
    });
  }
  for (const patch of patches) {
    if (linkedPatches.has(patch.id)) continue;
    const card = cardFor(rid, PATCH_TYPE, patch.id);
    const key = cardKey(card);
    const placement = placements.get(key);
    items.push({
      kind: "patch",
      key,
      card,
      placement,
      patch,
      column: patchColumn(patch, placement, columns),
    });
  }

  for (const placement of board?.cards ?? []) {
    if (placement.card.rid === rid) continue;
    const key = cardKey(placement.card);
    const resolved = foreign.get(key) ?? { kind: "unresolved" };
    const base = { key, card: placement.card, placement };
    if (resolved.kind === "issue") {
      items.push({
        ...base,
        kind: "issue",
        issue: resolved.issue,
        patches: [],
        ...issueColumn(resolved.issue, [], placement, columns),
        pendingClose: false,
      });
    } else if (resolved.kind === "patch") {
      items.push({
        ...base,
        kind: "patch",
        patch: resolved.patch,
        column: patchColumn(resolved.patch, placement, columns),
      });
    } else {
      items.push({
        ...base,
        kind: "unresolved",
        column: columns.some(c => c.id === placement.column)
          ? placement.column
          : openColumn(columns),
      });
    }
  }

  const groups: Record<string, BoardItem[]> = Object.fromEntries(
    columns.map(c => [c.id, []]),
  );
  for (const item of items) {
    const position =
      item.placement?.column === item.column
        ? item.placement.position
        : derivedPosition(item);
    groups[item.column].push({ ...item, position } as BoardItem);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) =>
      a.position < b.position
        ? -1
        : a.position > b.position
          ? 1
          : a.key < b.key
            ? -1
            : a.key > b.key
              ? 1
              : 0,
    );
  }
  return groups;
}

// Bounds for a new position at `index` in a column that doesn't contain the
// card being moved. Neighbours that share a position leave no room between
// them, so the card goes after the upper one.
export function neighbourPositions(
  list: BoardItem[],
  index: number,
): { before?: string; after?: string } {
  const before = list[index - 1]?.position;
  const after = list[index]?.position;
  if (before !== undefined && after !== undefined && before >= after) {
    return { before };
  }
  return { before, after };
}

export function isMe(did: string, publicKey: string): boolean {
  return publicKeyFromDid(did) === publicKey;
}
