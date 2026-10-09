import { z } from "zod";

// How a viewer arranges and filters a board. Kept per repository in this
// browser only; nobody else sees it.

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

export function loadView(rid: string): BoardViewSettings {
  const parsed = schema.partial().safeParse(readAll()[rid]);
  return parsed.success ? { ...defaultView(), ...parsed.data } : defaultView();
}

export function saveView(rid: string, settings: BoardViewSettings) {
  try {
    globalThis.localStorage?.setItem(
      KEY,
      JSON.stringify({ ...readAll(), [rid]: settings }),
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
