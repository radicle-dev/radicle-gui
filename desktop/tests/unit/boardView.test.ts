import type { Issue } from "@bindings/cob/issue/Issue";
import type { Patch } from "@bindings/cob/patch/Patch";

import { beforeEach, describe, expect, test } from "vitest";

import type { BoardItem } from "@app/lib/board";
import { DEFAULT_COLUMNS } from "@app/lib/board";
import {
  activeFilterCount,
  arrange,
  assigneeOptions,
  compareItems,
  defaultView,
  labelOptions,
  listGroups,
  loadView,
  matchesFilters,
  saveView,
  visibleColumns,
} from "@app/lib/boardView";

const RID = "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5";

beforeEach(() => {
  localStorage.clear();
});

describe("boardView storage", () => {
  test("starts from the defaults when nothing is stored", () => {
    expect(loadView(RID, "board-1")).toEqual(defaultView());
  });

  test("round-trips saved settings per board", () => {
    const settings = {
      ...defaultView(),
      grouping: "priority" as const,
      view: "list" as const,
      filters: {
        types: ["issue" as const],
        assignees: [],
        priorities: [],
        labels: [],
      },
    };
    saveView(RID, "board-1", settings);
    expect(loadView(RID, "board-1")).toEqual(settings);
    expect(loadView(RID, "board-2")).toEqual(defaultView());
  });

  test("a board without settings starts from its repository's", () => {
    saveView(RID, undefined, { ...defaultView(), showEmpty: false });
    expect(loadView(RID, "board-1").showEmpty).toBe(false);
  });

  test("falls back to the defaults on invalid stored values", () => {
    localStorage.setItem("boardView", "not json");
    expect(loadView(RID, "board-1")).toEqual(defaultView());

    localStorage.setItem(
      "boardView",
      JSON.stringify({ [`${RID}/board-1`]: { grouping: "nope", view: 3 } }),
    );
    expect(loadView(RID, "board-1")).toEqual(defaultView());

    localStorage.setItem("boardView", JSON.stringify([1, 2]));
    expect(loadView(RID, "board-1")).toEqual(defaultView());
  });

  test("fills in fields missing from stored settings", () => {
    localStorage.setItem(
      "boardView",
      JSON.stringify({ [`${RID}/board-1`]: { ordering: "title" } }),
    );
    expect(loadView(RID, "board-1")).toEqual({
      ...defaultView(),
      ordering: "title",
    });
  });
});

test("activeFilterCount counts every chosen filter", () => {
  expect(activeFilterCount(defaultView().filters)).toBe(0);
  expect(
    activeFilterCount({
      types: ["issue"],
      assignees: ["a", "b"],
      priorities: [],
      labels: ["bug"],
    }),
  ).toBe(4);
});

function item(
  oid: string,
  extra: Partial<Issue> = {},
  column = "todo",
): BoardItem {
  const issue = {
    id: oid,
    title: oid,
    labels: [],
    assignees: [],
    timestamp: 1000,
    state: { status: "open" },
    ...extra,
  } as unknown as Issue;
  return {
    kind: "issue",
    key: oid,
    card: { rid: RID, typeName: "xyz.radicle.issue", oid },
    column,
    position: "V",
    issue,
    patches: [],
    showsClosed: false,
  };
}

function patchItem(oid: string, extra: Partial<Patch> = {}): BoardItem {
  const patch = {
    id: oid,
    title: oid,
    labels: [],
    assignees: [],
    timestamp: 1000,
    state: { status: "open" },
    ...extra,
  } as unknown as Patch;
  return {
    kind: "patch",
    key: oid,
    card: { rid: RID, typeName: "xyz.radicle.patch", oid },
    column: "todo",
    position: "V",
    patch,
  };
}

const unresolved: BoardItem = {
  kind: "unresolved",
  key: "u",
  card: { rid: RID, typeName: "xyz.radicle.issue", oid: "uuuu" },
  column: "todo",
  position: "V",
};

const alice = { did: "did:key:alice", alias: "alice" };
const bob = { did: "did:key:bob" };

describe("matchesFilters", () => {
  const none = defaultView().filters;

  test("everything matches without filters", () => {
    expect(matchesFilters(item("a"), none, "")).toBe(true);
    expect(matchesFilters(unresolved, none, "")).toBe(true);
  });

  test("by type, which unresolved cards never have", () => {
    const filters = { ...none, types: ["patch" as const] };
    expect(matchesFilters(patchItem("p"), filters, "")).toBe(true);
    expect(matchesFilters(item("a"), filters, "")).toBe(false);
    expect(matchesFilters(unresolved, filters, "")).toBe(false);
  });

  test("by assignee, including nobody", () => {
    const assigned = item("a", { assignees: [alice] });
    expect(
      matchesFilters(assigned, { ...none, assignees: [alice.did] }, ""),
    ).toBe(true);
    expect(
      matchesFilters(assigned, { ...none, assignees: [bob.did] }, ""),
    ).toBe(false);
    expect(
      matchesFilters(item("b"), { ...none, assignees: ["none"] }, ""),
    ).toBe(true);
    expect(
      matchesFilters(assigned, { ...none, assignees: ["none", bob.did] }, ""),
    ).toBe(false);
  });

  test("by priority and label", () => {
    const high = item("a", { labels: ["priority:high", "bug"] });
    expect(matchesFilters(high, { ...none, priorities: ["high"] }, "")).toBe(
      true,
    );
    expect(matchesFilters(high, { ...none, priorities: ["none"] }, "")).toBe(
      false,
    );
    expect(matchesFilters(high, { ...none, labels: ["bug"] }, "")).toBe(true);
    expect(
      matchesFilters(high, { ...none, labels: ["priority:high"] }, ""),
    ).toBe(false);
  });

  test("by search over title, id, labels and aliases", () => {
    const a = item("abcdef", {
      title: "Fix the Thing",
      labels: ["Docs"],
      assignees: [alice],
    });
    expect(matchesFilters(a, none, " thing ")).toBe(true);
    expect(matchesFilters(a, none, "abc")).toBe(true);
    expect(matchesFilters(a, none, "cde")).toBe(false);
    expect(matchesFilters(a, none, "doc")).toBe(true);
    expect(matchesFilters(a, none, "ALICE")).toBe(true);
    expect(matchesFilters(a, none, "bob")).toBe(false);
  });
});

describe("compareItems", () => {
  const urgent = item("u", { labels: ["priority:urgent"], timestamp: 1 });
  const low = item("l", { labels: ["priority:low"], timestamp: 3 });
  const plain = item("p", { title: "Alpha", timestamp: 2 });

  test("by priority, then newest first", () => {
    expect(compareItems(urgent, low, "priority", false)).toBeLessThan(0);
    expect(compareItems(plain, low, "priority", false)).toBeGreaterThan(0);
    expect(compareItems(low, plain, "priority", true)).toBeGreaterThan(0);
    const older = item("o", { labels: ["priority:low"], timestamp: 1 });
    expect(compareItems(low, older, "priority", false)).toBeLessThan(0);
  });

  test("by creation and title", () => {
    expect(compareItems(low, urgent, "created", false)).toBeLessThan(0);
    expect(compareItems(low, urgent, "created", true)).toBeGreaterThan(0);
    expect(compareItems(plain, low, "title", false)).toBeLessThan(0);
  });

  test("arrange keeps board order when manual", () => {
    const groups = { todo: [low, urgent], done: [] };
    expect(arrange(groups, "manual", false)).toBe(groups);
    expect(arrange(groups, "priority", false).todo).toEqual([urgent, low]);
    expect(groups.todo).toEqual([low, urgent]);
  });
});

describe("visibleColumns", () => {
  const groups = { backlog: [item("a")] };
  const all = { showCanceled: true, showCompleted: true, showEmpty: true };

  test("hides closing columns and empty ones by setting", () => {
    expect(visibleColumns(DEFAULT_COLUMNS, all, groups, false)).toEqual(
      DEFAULT_COLUMNS,
    );
    expect(
      visibleColumns(
        DEFAULT_COLUMNS,
        { ...all, showCanceled: false, showCompleted: false },
        groups,
        false,
      ).map(c => c.id),
    ).toEqual(["backlog", "todo", "in-progress", "in-review"]);
    expect(
      visibleColumns(
        DEFAULT_COLUMNS,
        { ...all, showEmpty: false },
        groups,
        false,
      ).map(c => c.id),
    ).toEqual(["backlog"]);
  });

  test("shows empty columns while dragging", () => {
    expect(
      visibleColumns(
        DEFAULT_COLUMNS,
        { ...all, showEmpty: false },
        groups,
        true,
      ),
    ).toEqual(DEFAULT_COLUMNS);
  });
});

describe("listGroups", () => {
  const columns = DEFAULT_COLUMNS.slice(0, 2);
  const a = item("a", { labels: ["bug", "priority:high"], assignees: [alice] });
  const b = item("b", {}, "backlog");
  const groups = {
    backlog: [b],
    todo: [a],
    done: [item("hidden", {}, "done")],
  };
  const people = [{ did: alice.did, name: "alice" }];

  test("by status follows the columns", () => {
    expect(
      listGroups(
        { grouping: "status", showEmpty: true },
        columns,
        groups,
        [],
        [],
      ),
    ).toEqual([
      { id: "backlog", name: "Backlog", items: [b] },
      { id: "todo", name: "Todo", items: [a] },
    ]);
  });

  test("other groupings regroup the visible columns' cards", () => {
    expect(
      listGroups(
        { grouping: "priority", showEmpty: false },
        columns,
        groups,
        [],
        [],
      ),
    ).toEqual([
      { id: "high", name: "High", items: [a] },
      { id: "none", name: "No priority", items: [b] },
    ]);
    expect(
      listGroups(
        { grouping: "assignee", showEmpty: false },
        columns,
        groups,
        people,
        [],
      ),
    ).toEqual([
      { id: alice.did, name: "alice", items: [a] },
      { id: "none", name: "No assignee", items: [b] },
    ]);
    expect(
      listGroups(
        { grouping: "label", showEmpty: true },
        columns,
        groups,
        [],
        ["bug", "docs"],
      ),
    ).toEqual([
      { id: "bug", name: "bug", items: [a] },
      { id: "docs", name: "docs", items: [] },
      { id: "none", name: "No label", items: [b] },
    ]);
    expect(
      listGroups(
        { grouping: "none", showEmpty: false },
        columns,
        groups,
        [],
        [],
      ),
    ).toEqual([{ id: "all", name: "All cards", items: [b, a] }]);
  });
});

describe("filter options", () => {
  const issues = [
    { assignees: [alice], labels: ["bug", "priority:low"] },
    { assignees: [bob], labels: ["docs"] },
  ] as unknown as Issue[];
  const patches = [
    { assignees: [alice], labels: ["bug"] },
  ] as unknown as Patch[];

  test("lists each assignee once, by alias or shortened key", () => {
    expect(assigneeOptions(issues, patches)).toEqual([
      { did: alice.did, name: "alice" },
      { did: bob.did, name: "bob…" },
    ]);
    expect(assigneeOptions([], [])).toEqual([]);
  });

  test("lists display labels once, sorted", () => {
    expect(labelOptions(issues, patches)).toEqual(["bug", "docs"]);
  });
});
