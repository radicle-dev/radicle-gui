import type { Column } from "@bindings/cob/board/Column";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Patch } from "@bindings/cob/patch/Patch";

import { z } from "zod";

import type { BoardItem } from "@app/lib/board";
import {
  displayLabels,
  itemAssignees,
  itemLabels,
  itemTimestamp,
  itemTitle,
  PRIORITIES,
  PRIORITY_RANK,
  priorityOf,
} from "@app/lib/board";

// How a viewer arranges and filters a board. Kept per board in this browser
// only.

export const PROPERTIES = [
  { id: "id", label: "ID" },
  { id: "priority", label: "Priority" },
  { id: "assignees", label: "Assignees" },
  { id: "labels", label: "Labels" },
  { id: "created", label: "Created" },
  { id: "patches", label: "Patches" },
  { id: "comments", label: "Comments" },
  { id: "repository", label: "Repository" },
] as const;

export type Property = (typeof PROPERTIES)[number]["id"];

const propertySchema = z.enum([
  "id",
  "priority",
  "assignees",
  "labels",
  "created",
  "patches",
  "comments",
  "repository",
]);

export const GROUPINGS = [
  { id: "status", label: "Status" },
  { id: "assignee", label: "Assignee" },
  { id: "priority", label: "Priority" },
  { id: "label", label: "Label" },
  { id: "none", label: "No grouping" },
] as const;

export const ORDERINGS = [
  { id: "manual", label: "Manual" },
  { id: "priority", label: "Priority" },
  { id: "created", label: "Created" },
  { id: "title", label: "Title" },
] as const;

export type Grouping = (typeof GROUPINGS)[number]["id"];
export type Ordering = (typeof ORDERINGS)[number]["id"];

const filtersSchema = z.object({
  types: z.array(z.enum(["issue", "patch"])),
  assignees: z.array(z.string()),
  priorities: z.array(z.string()),
  labels: z.array(z.string()),
});

export type BoardFilters = z.infer<typeof filtersSchema>;

const schema = z.object({
  grouping: z.enum(["status", "assignee", "priority", "label", "none"]),
  ordering: z.enum(["manual", "priority", "created", "title"]),
  descending: z.boolean(),
  showCompleted: z.boolean(),
  showCanceled: z.boolean(),
  showEmpty: z.boolean(),
  properties: z.array(propertySchema),
  filters: filtersSchema,
  view: z.enum(["board", "list"]),
});

export type BoardViewSettings = z.infer<typeof schema>;

export function defaultView(): BoardViewSettings {
  return {
    grouping: "status",
    ordering: "manual",
    descending: false,
    showCompleted: true,
    showCanceled: false,
    showEmpty: true,
    properties: [
      "id",
      "priority",
      "assignees",
      "labels",
      "created",
      "patches",
      "comments",
      "repository",
    ],
    filters: { types: [], assignees: [], priorities: [], labels: [] },
    view: "board",
  };
}

const KEY = "boardView";

function readAll(): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function keyOf(rid: string, board: string | undefined): string {
  return board ? `${rid}/${board}` : rid;
}

// A board with nothing saved yet starts from what was saved for its
// repository, which is where settings lived before boards had their own.
export function loadView(
  rid: string,
  board: string | undefined,
): BoardViewSettings {
  const all = readAll();
  const parsed = schema.partial().safeParse(all[keyOf(rid, board)] ?? all[rid]);
  return parsed.success ? { ...defaultView(), ...parsed.data } : defaultView();
}

export function saveView(
  rid: string,
  board: string | undefined,
  settings: BoardViewSettings,
) {
  try {
    globalThis.localStorage?.setItem(
      KEY,
      JSON.stringify({ ...readAll(), [keyOf(rid, board)]: settings }),
    );
  } catch {
    // Storage can be unavailable; the view still works for this session.
  }
}

export function activeFilterCount(filters: BoardFilters): number {
  return (
    filters.types.length +
    filters.assignees.length +
    filters.priorities.length +
    filters.labels.length
  );
}

export function matchesFilters(
  item: BoardItem,
  filters: BoardFilters,
  search: string,
): boolean {
  const assignees = itemAssignees(item);
  const { types, assignees: people, priorities, labels } = filters;
  if (
    types.length > 0 &&
    (item.kind === "unresolved" || !types.includes(item.kind))
  ) {
    return false;
  }
  if (
    people.length > 0 &&
    !(
      (people.includes("none") && assignees.length === 0) ||
      assignees.some(a => people.includes(a.did))
    )
  ) {
    return false;
  }
  if (
    priorities.length > 0 &&
    !priorities.includes(priorityOf(itemLabels(item)))
  ) {
    return false;
  }
  if (
    labels.length > 0 &&
    !displayLabels(itemLabels(item)).some(l => labels.includes(l))
  ) {
    return false;
  }
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return (
    itemTitle(item).toLowerCase().includes(query) ||
    item.card.oid.startsWith(query) ||
    itemLabels(item).some(l => l.toLowerCase().includes(query)) ||
    assignees.some(a => a.alias?.toLowerCase().includes(query))
  );
}

export function compareItems(
  a: BoardItem,
  b: BoardItem,
  ordering: Ordering,
  descending: boolean,
): number {
  let order = 0;
  if (ordering === "priority") {
    order =
      PRIORITY_RANK[priorityOf(itemLabels(a))] -
        PRIORITY_RANK[priorityOf(itemLabels(b))] ||
      itemTimestamp(b) - itemTimestamp(a);
  } else if (ordering === "created") {
    order = itemTimestamp(b) - itemTimestamp(a);
  } else if (ordering === "title") {
    order = itemTitle(a).localeCompare(itemTitle(b));
  }
  return descending ? -order : order;
}

// Board order, or the chosen ordering on top of it.
export function arrange(
  groups: Record<string, BoardItem[]>,
  ordering: Ordering,
  descending: boolean,
): Record<string, BoardItem[]> {
  if (ordering === "manual") return groups;
  return Object.fromEntries(
    Object.entries(groups).map(([id, list]) => [
      id,
      [...list].sort((a, b) => compareItems(a, b, ordering, descending)),
    ]),
  );
}

export function visibleColumns(
  columns: Column[],
  settings: Pick<
    BoardViewSettings,
    "showCanceled" | "showCompleted" | "showEmpty"
  >,
  groups: Record<string, BoardItem[]>,
  dragging: boolean,
): Column[] {
  return columns.filter(
    c =>
      (settings.showCanceled || c.closes !== "other") &&
      (settings.showCompleted || c.closes !== "solved") &&
      (settings.showEmpty || dragging || (groups[c.id]?.length ?? 0) > 0),
  );
}

export interface Person {
  did: string;
  name: string;
}

// Everyone assigned to anything, filtered or not, so the filter menu doesn't
// change shape as filters are picked.
export function assigneeOptions(issues: Issue[], patches: Patch[]): Person[] {
  const seen: Record<string, string> = {};
  for (const a of [...issues, ...patches].flatMap(i => i.assignees)) {
    seen[a.did] = a.alias ?? `${a.did.slice(8, 16)}…`;
  }
  return Object.entries(seen).map(([did, name]) => ({ did, name }));
}

export function labelOptions(issues: Issue[], patches: Patch[]): string[] {
  return [
    ...new Set(
      [...issues.map(i => i.labels), ...patches.map(p => p.labels)].flatMap(
        displayLabels,
      ),
    ),
  ].sort();
}

export interface ListGroup {
  id: string;
  name: string;
  items: BoardItem[];
}

// Grouping by status follows the columns; the other groupings regroup the
// cards of the visible columns.
export function listGroups(
  settings: Pick<BoardViewSettings, "grouping" | "showEmpty">,
  columns: Column[],
  groups: Record<string, BoardItem[]>,
  people: Person[],
  labels: string[],
): ListGroup[] {
  const shown = columns.flatMap(c => groups[c.id] ?? []);
  const byKey = (
    entries: { id: string; name: string }[],
    keyOf: (item: BoardItem) => string,
  ) =>
    entries
      .map(e => ({
        ...e,
        items: shown.filter(item => keyOf(item) === e.id),
      }))
      .filter(g => settings.showEmpty || g.items.length > 0);

  switch (settings.grouping) {
    case "status":
      return columns.map(c => ({
        id: c.id,
        name: c.name,
        items: groups[c.id] ?? [],
      }));
    case "priority":
      return byKey(
        PRIORITIES.map(p => ({ id: p.id, name: p.label })),
        item => priorityOf(itemLabels(item)),
      );
    case "assignee":
      return byKey(
        [
          ...people.map(p => ({ id: p.did, name: p.name })),
          { id: "none", name: "No assignee" },
        ],
        item => itemAssignees(item)[0]?.did ?? "none",
      );
    case "label":
      return byKey(
        [
          ...labels.map(l => ({ id: l, name: l })),
          { id: "none", name: "No label" },
        ],
        item => displayLabels(itemLabels(item))[0] ?? "none",
      );
    default:
      return [{ id: "all", name: "All cards", items: shown }];
  }
}
