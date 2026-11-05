import type { Author } from "@bindings/cob/Author";
import type { Board } from "@bindings/cob/board/Board";
import type { Card } from "@bindings/cob/board/Card";
import type { Column } from "@bindings/cob/board/Column";
import type { PatchLink } from "@bindings/cob/board/PatchLink";
import type { Placement } from "@bindings/cob/board/Placement";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { State } from "@bindings/cob/issue/State";
import type { Patch } from "@bindings/cob/patch/Patch";

import { publicKeyFromDid } from "@app/lib/utils";

export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export type BoardView = "board" | "list";

export const ISSUE_TYPE = "xyz.radicle.issue";
export const PATCH_TYPE = "xyz.radicle.patch";

// The evaluator's limits, in UTF-8 bytes.
export const MAX_NAME_LENGTH = 100;
export const MAX_COLUMNS = 50;
export const MAX_COLUMN_ID_LENGTH = 64;
export const MAX_POSITION_LENGTH = 64;

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function validName(name: string): boolean {
  const length = utf8Length(name.trim());
  return length > 0 && length <= MAX_NAME_LENGTH;
}

// Mirrors `radicle_board::default_columns`.
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

export const PRIORITY_RANK: Record<Priority, number> = {
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
  // The stored position when the card is placed in `column`, otherwise one
  // derived from the card itself.
  position: string;
}

export type BoardItem =
  | (ItemBase & {
      kind: "issue";
      issue: Issue;
      patches: Patch[];
      // Closed, but shown in an open column because the board has no closing
      // column.
      showsClosed: boolean;
    })
  | (ItemBase & { kind: "patch"; patch: Patch })
  | (ItemBase & { kind: "unresolved" });

export type IssueItem = Extract<BoardItem, { kind: "issue" }>;

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

export function itemAssignees(item: Unpositioned): Author[] {
  if (item.kind === "issue") return item.issue.assignees;
  if (item.kind === "patch") return item.patch.assignees;
  return [];
}

export function itemComments(item: Unpositioned): number {
  if (item.kind === "issue") return item.issue.commentCount;
  if (item.kind === "patch") return item.patch.commentCount;
  return 0;
}

function openColumn(columns: Column[]): string {
  return (columns.find(c => !c.closes) ?? columns[0]).id;
}

function closingColumn(
  columns: Column[],
  reason: "solved" | "other",
  placed: Column | undefined,
): string | undefined {
  if (placed?.closes === reason) return placed.id;
  return (columns.find(c => c.closes === reason) ?? columns.find(c => c.closes))
    ?.id;
}

function hasColumn(columns: Column[], id: string): boolean {
  return columns.some(c => c.id === id);
}

// The issue's state decides where it shows: the stored placement counts only
// while it agrees with the state.
export function issueColumn(
  issue: Issue,
  patches: Patch[],
  placement: Placement | undefined,
  columns: Column[],
): { column: string; showsClosed: boolean } {
  const placed = columns.find(c => c.id === placement?.column);
  if (issue.state.status === "closed") {
    const column = closingColumn(columns, issue.state.reason, placed);
    return column
      ? { column, showsClosed: false }
      : { column: openColumn(columns), showsClosed: true };
  }
  if (placed && !placed.closes) {
    return { column: placed.id, showsClosed: false };
  }
  if (!placed) {
    if (
      patches.some(p => p.state.status === "open") &&
      hasColumn(columns, "in-review")
    ) {
      return { column: "in-review", showsClosed: false };
    }
    if (
      patches.some(p => p.state.status === "draft") &&
      hasColumn(columns, "in-progress")
    ) {
      return { column: "in-progress", showsClosed: false };
    }
  }
  return { column: openColumn(columns), showsClosed: false };
}

export function patchColumn(
  patch: Patch,
  placement: Placement | undefined,
  columns: Column[],
): string {
  const placed = columns.find(c => c.id === placement?.column);
  if (patch.state.status === "merged") {
    return closingColumn(columns, "solved", placed) ?? openColumn(columns);
  }
  if (patch.state.status === "archived") {
    return closingColumn(columns, "other", placed) ?? openColumn(columns);
  }
  return placed && !placed.closes ? placed.id : openColumn(columns);
}

function stateFor(column: Column): State {
  return column.closes
    ? { status: "closed", reason: column.closes }
    : { status: "open" };
}

// The state only changes when the move crosses between open and closing
// columns, or between closing columns with different reasons, as seen from
// the column the card is shown in. Reordering a closed issue shown in an open
// column never rewrites it.
export function stateAfterMove(
  item: IssueItem,
  target: Column,
  columns: Column[],
): State {
  const from = columns.find(c => c.id === item.column);
  return from?.closes === target.closes ? item.issue.state : stateFor(target);
}

// Mirrors the evaluator's rule for closing columns, and on top of that
// refuses drops after which the card wouldn't show in `target`.
export function accepts(
  item: BoardItem,
  target: Column,
  columns: Column[],
  canClose: boolean,
  rid: string,
): boolean {
  return refusal(item, target, columns, canClose, rid) === undefined;
}

// Why `item` can't be dropped in `target`, or `undefined` if it can.
export function refusal(
  item: BoardItem,
  target: Column,
  columns: Column[],
  canClose: boolean,
  rid: string,
): string | undefined {
  if (item.kind === "unresolved") return undefined;
  if (item.kind === "patch" && item.patch.state.status === "merged") {
    return "Merged patches can't be moved";
  }
  if (item.kind === "patch" && item.patch.state.status === "archived") {
    return "Archived patches can't be moved";
  }
  if (target.closes && item.kind === "patch") {
    return "Patches can't go in a column that closes issues";
  }
  const placed: Placement = {
    card: item.card,
    column: target.id,
    position: "",
    movedBy: { did: "" },
    movedAt: 0,
  };
  if (item.kind === "patch") {
    return patchColumn(item.patch, placed, columns) === target.id
      ? undefined
      : "This patch can't go in this column";
  }
  if (!canClose) {
    // Mirrors the evaluator: others may only move a card between columns
    // that do the same thing to issues, judged by where the card is stored.
    const stored = columns.find(c => c.id === item.placement?.column)?.closes;
    const shown = columns.find(c => c.id === item.column)?.closes;
    if (target.closes && !stored) {
      return "Only delegates and the author can close this issue";
    }
    if (target.closes && stored !== target.closes) {
      return "Only delegates and the author can change how this issue was closed";
    }
    if (!target.closes && (stored || shown)) {
      return "Only delegates and the author can reopen this issue";
    }
  }
  const foreign = item.card.rid !== rid;
  const state =
    canClose && !foreign
      ? stateAfterMove(item, target, columns)
      : item.issue.state;
  if (
    issueColumn({ ...item.issue, state }, item.patches, placed, columns)
      .column === target.id
  ) {
    return undefined;
  }
  return foreign
    ? "Issues from other repositories can't be closed or reopened here"
    : "This issue can't go in this column";
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

// A position for a card nobody has placed in this column: by priority, then
// newest first, then card. Every peer derives the same one, so a card dropped
// between two unplaced cards gets a stored position that keeps it there.
function derivedPosition(item: Unpositioned): string {
  const labels = itemLabels(item);
  const timestamp = itemTimestamp(item);
  const rank = DIGITS[1 + PRIORITY_RANK[priorityOf(labels)]];
  return `U${rank}${base62(TIME_MAX - timestamp, TIME_WIDTH)}${item.card.oid.slice(0, 8)}1`;
}

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
  const issueIds = new Set(issues.map(i => i.id));
  for (const link of links) {
    const patch = patchById.get(link.patch);
    if (!patch) continue;
    for (const issue of link.issues.filter(id => issueIds.has(id))) {
      linkedPatches.add(patch.id);
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

export interface Move {
  item: BoardItem;
  column: string;
  index: number;
}

export function applyMove(
  groups: Record<string, BoardItem[]>,
  move: Move | undefined,
): Record<string, BoardItem[]> {
  if (!move) return groups;
  const result = Object.fromEntries(
    Object.entries(groups).map(([id, list]) => [
      id,
      list.filter(i => i.key !== move.item.key),
    ]),
  );
  const target = [...(result[move.column] ?? [])];
  target.splice(Math.min(move.index, target.length), 0, move.item);
  result[move.column] = target;
  return result;
}

// Mirrors `radicle_board::position::is_valid`.
function isValidPosition(position: string): boolean {
  return (
    position.length > 0 &&
    [...position].every(c => DIGITS.includes(c)) &&
    !position.endsWith("0")
  );
}

// Mirrors `radicle_board::position::between`, including giving up at the
// length limit.
export function between(before?: string, after?: string): string | undefined {
  if (before !== undefined && !isValidPosition(before)) return undefined;
  if (after !== undefined && !isValidPosition(after)) return undefined;
  if (before !== undefined && after !== undefined && before >= after) {
    return undefined;
  }

  const low = before ?? "";
  let high = after;
  let key = "";
  for (let i = 0; i < MAX_POSITION_LENGTH; i++) {
    const lo = i < low.length ? DIGITS.indexOf(low[i]) : 0;
    const hi =
      high === undefined
        ? DIGITS.length
        : i < high.length
          ? DIGITS.indexOf(high[i])
          : 0;
    if (hi > lo + 1) {
      return key + DIGITS[Math.floor((lo + hi) / 2)];
    }
    key += DIGITS[lo];
    if (hi === lo + 1) high = undefined;
  }
  return undefined;
}

export interface Bounds {
  before?: string;
  after?: string;
}

// Mirrors `radicle_board::position::neighbours`.
export function neighbourPositions(list: BoardItem[], index: number): Bounds {
  const before = list[index - 1]?.position;
  const after = list[index]?.position;
  if (before !== undefined && after !== undefined && before >= after) {
    return {
      before,
      after: list.slice(index).find(i => i.position > before)?.position,
    };
  }
  return { before, after };
}

// The position has no value when the keys around `index` are packed to the
// length limit; the card then stays where it was rather than going elsewhere.
export function dropPosition(
  list: BoardItem[],
  index: number,
): { bounds: Bounds; position?: string } {
  const bounds = neighbourPositions(list, index);
  return { bounds, position: between(bounds.before, bounds.after) };
}

export function isMe(did: string, publicKey: string): boolean {
  return publicKeyFromDid(did) === publicKey;
}

export interface QueuedChange {
  rid: string;
  board: string;
  opts: { announce: boolean };
  card: Card;
  change:
    { kind: "move"; column: string; position: string } | { kind: "remove" };
  // The state the card's issue moves to with it, if it changes.
  state?: State;
}

export function sameState(a: State, b: State): boolean {
  return (
    a.status === b.status &&
    (a.status !== "closed" || (b.status === "closed" && a.reason === b.reason))
  );
}

export function overlayBoard(
  board: Board | undefined,
  queued: QueuedChange[],
  movedBy: string,
  movedAt: number,
): Board | undefined {
  if (!board) return board;
  const entries = queued.filter(q => q.board === board.id);
  if (entries.length === 0) return board;
  const keys = new Set(entries.map(q => cardKey(q.card)));
  const cards = board.cards.filter(p => !keys.has(cardKey(p.card)));
  for (const q of entries) {
    if (q.change.kind !== "move") continue;
    cards.push({
      card: q.card,
      column: q.change.column,
      position: q.change.position,
      movedBy: { did: movedBy },
      movedAt,
    });
  }
  return { ...board, cards };
}

// Later entries win, so pass changes being written before the ones still
// queued.
export function overlayIssues(
  rid: string,
  issues: Issue[],
  queued: QueuedChange[],
): Issue[] {
  const states = new Map(
    queued
      .filter(q => q.state && q.card.rid === rid)
      .map(q => [q.card.oid, q.state!]),
  );
  if (states.size === 0) return issues;
  return issues.map(i => {
    const state = states.get(i.id);
    return state ? { ...i, state } : i;
  });
}

// Where the card stands as far as new changes are concerned: where the change
// being written puts it, otherwise where the committed board has it.
export function baselinePlacement(
  board: Board | undefined,
  card: Card,
  inFlight: QueuedChange | undefined,
): { column: string; position: string } | undefined {
  const key = cardKey(card);
  if (
    inFlight &&
    cardKey(inFlight.card) === key &&
    inFlight.board === board?.id
  ) {
    return inFlight.change.kind === "move" ? inFlight.change : undefined;
  }
  return board?.cards.find(p => cardKey(p.card) === key);
}

// `bounds` are the positions the card was dropped between; without a manual
// ordering any spot in the column will do.
export function isUnchanged(
  entry: QueuedChange,
  placed: { column: string; position: string } | undefined,
  manual: boolean,
  bounds: Bounds = {},
): boolean {
  const change = entry.change;
  if (change.kind === "remove") return placed === undefined;
  return (
    placed !== undefined &&
    placed.column === change.column &&
    (!manual ||
      ((bounds.before === undefined || bounds.before < placed.position) &&
        (bounds.after === undefined || placed.position < bounds.after))) &&
    entry.state === undefined
  );
}

export interface Batch {
  rid: string;
  board: string;
  opts: { announce: boolean };
  entries: QueuedChange[];
  moves: { card: Card; column: string; position: string }[];
  removes: Card[];
}

export function batches(queued: QueuedChange[]): Batch[] {
  const result: Batch[] = [];
  for (const entry of queued) {
    let batch = result.find(
      b => b.rid === entry.rid && b.board === entry.board,
    );
    if (!batch) {
      batch = {
        rid: entry.rid,
        board: entry.board,
        opts: entry.opts,
        entries: [],
        moves: [],
        removes: [],
      };
      result.push(batch);
    }
    batch.entries.push(entry);
    if (entry.change.kind === "move") {
      batch.moves.push({
        card: entry.card,
        column: entry.change.column,
        position: entry.change.position,
      });
    } else {
      batch.removes.push(entry.card);
    }
  }
  return result;
}
