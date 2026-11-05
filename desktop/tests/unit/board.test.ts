import type { Board } from "@bindings/cob/board/Board";
import type { Card } from "@bindings/cob/board/Card";
import type { Column } from "@bindings/cob/board/Column";
import type { Placement } from "@bindings/cob/board/Placement";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Patch } from "@bindings/cob/patch/Patch";

import { describe, expect, test } from "vitest";

import type { BoardItem, QueuedChange } from "@app/lib/board";
import {
  accepts,
  applyMove,
  baselinePlacement,
  batches,
  between,
  cardKey,
  DEFAULT_COLUMNS,
  displayLabels,
  dropPosition,
  groupItems,
  issueColumn,
  isUnchanged,
  labelsForPriority,
  MAX_NAME_LENGTH,
  MAX_POSITION_LENGTH,
  neighbourPositions,
  overlayBoard,
  overlayIssues,
  patchColumn,
  priorityOf,
  refusal,
  sameState,
  stateAfterMove,
  validName,
} from "@app/lib/board";

import positions from "../../crates/radicle-board/tests/fixtures/positions.json";

const RID = "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5";
const OTHER = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const ME = "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";

function issue(
  id: string,
  state: Issue["state"] = { status: "open" },
  extra: Partial<Issue> = {},
): Issue {
  return {
    id,
    state,
    labels: [],
    timestamp: 1000,
    title: id,
    ...extra,
  } as Issue;
}

function patch(
  id: string,
  status: Patch["state"]["status"] = "open",
  extra: Partial<Patch> = {},
): Patch {
  return {
    id,
    state: { status },
    labels: [],
    timestamp: 1000,
    title: id,
    ...extra,
  } as Patch;
}

function issueCard(oid: string, rid = RID): Card {
  return { rid, typeName: "xyz.radicle.issue", oid };
}

function patchCard(oid: string): Card {
  return { rid: RID, typeName: "xyz.radicle.patch", oid };
}

function placement(card: Card, column: string, position = "V"): Placement {
  return { card, column, position, movedBy: { did: ME }, movedAt: 1 };
}

function board(cards: Placement[], columns = DEFAULT_COLUMNS): Board {
  return { id: "board-1", name: "Board", createdAt: 0, columns, cards };
}

function columnsOf(
  groups: Record<string, BoardItem[]>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(groups).flatMap(([column, items]) =>
      items.map(item => [item.card.oid, column]),
    ),
  );
}

const NO_CLOSING: Column[] = [
  { id: "todo", name: "Todo" },
  { id: "doing", name: "Doing" },
];

describe("issueColumn", () => {
  const closed = (reason: "solved" | "other") =>
    issue("i", { status: "closed", reason });
  const placed = (column: string) => placement(issueCard("i"), column);

  test("a closed issue placed in a closing column for its reason stays", () => {
    expect(
      issueColumn(closed("other"), [], placed("canceled"), DEFAULT_COLUMNS),
    ).toEqual({ column: "canceled", showsClosed: false });
  });

  test("a closed issue placed elsewhere shows in the column for its reason", () => {
    expect(
      issueColumn(closed("solved"), [], placed("todo"), DEFAULT_COLUMNS),
    ).toEqual({ column: "done", showsClosed: false });
    expect(
      issueColumn(closed("solved"), [], placed("canceled"), DEFAULT_COLUMNS),
    ).toEqual({ column: "done", showsClosed: false });
    expect(
      issueColumn(closed("other"), [], undefined, DEFAULT_COLUMNS),
    ).toEqual({ column: "canceled", showsClosed: false });
  });

  test("without a column for its reason a closed issue takes any closing column", () => {
    const columns: Column[] = [
      { id: "todo", name: "Todo" },
      { id: "done", name: "Done", closes: "solved" },
    ];
    expect(issueColumn(closed("other"), [], placed("todo"), columns)).toEqual({
      column: "done",
      showsClosed: false,
    });
  });

  test("without any closing column a closed issue shows in the first column with a badge", () => {
    expect(
      issueColumn(closed("solved"), [], placed("doing"), NO_CLOSING),
    ).toEqual({ column: "todo", showsClosed: true });
  });

  test("an open issue placed in an open column stays", () => {
    expect(
      issueColumn(issue("i"), [], placed("in-progress"), DEFAULT_COLUMNS),
    ).toEqual({ column: "in-progress", showsClosed: false });
  });

  test("an open issue placed in a closing column shows in the first open column", () => {
    expect(
      issueColumn(issue("i"), [patch("p")], placed("done"), DEFAULT_COLUMNS),
    ).toEqual({ column: "backlog", showsClosed: false });
  });

  test("an unplaced open issue follows its linked patches", () => {
    expect(
      issueColumn(issue("i"), [patch("p", "open")], undefined, DEFAULT_COLUMNS),
    ).toEqual({ column: "in-review", showsClosed: false });
    expect(
      issueColumn(
        issue("i"),
        [patch("p", "draft")],
        undefined,
        DEFAULT_COLUMNS,
      ),
    ).toEqual({ column: "in-progress", showsClosed: false });
    expect(
      issueColumn(
        issue("i"),
        [patch("p", "merged")],
        undefined,
        DEFAULT_COLUMNS,
      ),
    ).toEqual({ column: "backlog", showsClosed: false });
    expect(issueColumn(issue("i"), [], undefined, DEFAULT_COLUMNS)).toEqual({
      column: "backlog",
      showsClosed: false,
    });
  });

  test("a linked patch doesn't move an issue to a column the board lacks", () => {
    expect(
      issueColumn(issue("i"), [patch("p", "open")], undefined, NO_CLOSING),
    ).toEqual({ column: "todo", showsClosed: false });
  });
});

describe("patchColumn", () => {
  const placed = (column: string) => placement(patchCard("p"), column);

  test("merged and archived patches show in the closing columns", () => {
    expect(patchColumn(patch("p", "merged"), undefined, DEFAULT_COLUMNS)).toBe(
      "done",
    );
    expect(
      patchColumn(patch("p", "archived"), placed("todo"), DEFAULT_COLUMNS),
    ).toBe("canceled");
    expect(patchColumn(patch("p", "merged"), undefined, NO_CLOSING)).toBe(
      "todo",
    );
  });

  test("an open patch placed in a closing column shows in the first open column", () => {
    expect(patchColumn(patch("p"), placed("done"), DEFAULT_COLUMNS)).toBe(
      "backlog",
    );
    expect(patchColumn(patch("p"), placed("in-review"), DEFAULT_COLUMNS)).toBe(
      "in-review",
    );
    expect(patchColumn(patch("p", "draft"), undefined, DEFAULT_COLUMNS)).toBe(
      "backlog",
    );
  });
});

describe("groupItems", () => {
  test("a card shown away from its placement sorts like an unplaced card", () => {
    const a = issueCard("a");
    const c = issueCard("c");
    const groups = groupItems(
      RID,
      board([placement(a, "todo", "A"), placement(c, "done", "A")]),
      [
        issue("a", { status: "closed", reason: "solved" }),
        issue("b", { status: "closed", reason: "solved" }, { timestamp: 2000 }),
        issue("c", { status: "closed", reason: "solved" }),
      ],
      [],
      [],
    );
    // `c` keeps its stored spot; `a` and `b` are placed as unplaced cards,
    // newest first.
    expect(groups.done.map(i => i.card.oid)).toEqual(["c", "b", "a"]);
    expect(groups.todo).toEqual([]);
  });

  test("a closed issue with no closing column shows a badge", () => {
    const groups = groupItems(
      RID,
      board([], NO_CLOSING),
      [issue("a", { status: "closed", reason: "other" })],
      [],
      [],
    );
    const [item] = groups.todo;
    expect(item.kind === "issue" && item.showsClosed).toBe(true);
  });

  test("a linked patch shows on its issue's card, not as its own", () => {
    const groups = groupItems(
      RID,
      undefined,
      [issue("a")],
      [patch("p", "open"), patch("q", "open")],
      [
        { patch: "p", issues: ["a"] },
        { patch: "q", issues: ["missing"] },
      ],
    );
    expect(columnsOf(groups)).toEqual({ a: "in-review", q: "backlog" });
    const [item] = groups["in-review"];
    expect(item.kind === "issue" && item.patches.map(p => p.id)).toEqual(["p"]);
  });

  test("a linked patch never changes an issue's column from its state", () => {
    const groups = groupItems(
      RID,
      undefined,
      [issue("a")],
      [patch("p", "merged")],
      [{ patch: "p", issues: ["a"] }],
    );
    expect(columnsOf(groups)).toEqual({ a: "backlog" });
  });

  test("foreign and unresolved cards take their placement", () => {
    const foreign = issueCard("f", "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5");
    const unknown = issueCard("u", "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5");
    const groups = groupItems(
      RID,
      board([placement(foreign, "todo"), placement(unknown, "gone")]),
      [],
      [],
      [],
      new Map([
        [
          `${foreign.rid}/${foreign.typeName}/f`,
          { kind: "issue", issue: issue("f") },
        ],
      ]),
    );
    expect(columnsOf(groups)).toEqual({ f: "todo", u: "backlog" });
    expect(groups.backlog[0].kind).toBe("unresolved");
  });
});

type IssueItem = Extract<BoardItem, { kind: "issue" }>;

function issueItem(overrides: Partial<IssueItem> = {}): IssueItem {
  return {
    kind: "issue",
    key: "k",
    card: issueCard("i"),
    column: "todo",
    position: "V",
    issue: issue("i"),
    patches: [],
    showsClosed: false,
    ...overrides,
  };
}

function patchItem(
  status: Patch["state"]["status"],
  column: string,
): BoardItem {
  return {
    kind: "patch",
    key: "p",
    card: patchCard("p"),
    column,
    position: "V",
    patch: patch("p", status),
  };
}

describe("stateAfterMove", () => {
  const columns = DEFAULT_COLUMNS;
  const by = (id: string) => columns.find(c => c.id === id)!;
  const solved: Issue["state"] = { status: "closed", reason: "solved" };
  const other: Issue["state"] = { status: "closed", reason: "other" };
  const closed = (state: Issue["state"], column: string) =>
    issueItem({ issue: issue("i", state), column });

  test("into a closing column closes with its reason", () => {
    expect(stateAfterMove(issueItem(), by("done"), columns)).toEqual(solved);
    expect(stateAfterMove(issueItem(), by("canceled"), columns)).toEqual(other);
  });

  test("out of a closing column reopens", () => {
    expect(stateAfterMove(closed(solved, "done"), by("todo"), columns)).toEqual(
      { status: "open" },
    );
  });

  test("between closing columns with different reasons changes the reason", () => {
    expect(
      stateAfterMove(closed(solved, "done"), by("canceled"), columns),
    ).toEqual(other);
  });

  test("reordering within a column keeps the state", () => {
    expect(stateAfterMove(closed(solved, "done"), by("done"), columns)).toBe(
      closed(solved, "done").issue.state,
    );
    expect(stateAfterMove(issueItem(), by("todo"), columns)).toEqual({
      status: "open",
    });
  });

  test("between open columns keeps the state", () => {
    expect(stateAfterMove(issueItem(), by("in-progress"), columns)).toEqual({
      status: "open",
    });
  });

  test("a closed issue shown in an open column stays closed", () => {
    const noClosing = closed(solved, "todo");
    expect(
      stateAfterMove(
        noClosing,
        NO_CLOSING.find(c => c.id === "todo")!,
        [...NO_CLOSING],
      ),
    ).toEqual(solved);
  });

  test("a closed issue shown in a column closing for another reason keeps its reason", () => {
    const solvedOnly: Column[] = [
      { id: "todo", name: "Todo" },
      { id: "done", name: "Done", closes: "solved" },
    ];
    expect(
      stateAfterMove(closed(other, "done"), solvedOnly[1], solvedOnly),
    ).toEqual(other);
  });
});

describe("refusal", () => {
  const columns = DEFAULT_COLUMNS;
  const by = (id: string) => columns.find(c => c.id === id)!;
  const closed = issue("i", { status: "closed", reason: "solved" });

  test("says why a patch can't move", () => {
    expect(
      refusal(patchItem("merged", "done"), by("todo"), columns, true, RID),
    ).toBe("Merged patches can't be moved");
    expect(
      refusal(
        patchItem("archived", "canceled"),
        by("todo"),
        columns,
        true,
        RID,
      ),
    ).toBe("Archived patches can't be moved");
    expect(
      refusal(patchItem("open", "todo"), by("done"), columns, true, RID),
    ).toBe("Patches can't go in a column that closes issues");
    expect(
      refusal(patchItem("open", "todo"), by("in-review"), columns, true, RID),
    ).toBeUndefined();
  });

  test("says who may close or reopen an issue", () => {
    expect(refusal(issueItem(), by("done"), columns, false, RID)).toBe(
      "Only delegates and the author can close this issue",
    );
    expect(
      refusal(
        issueItem({ column: "done", issue: closed }),
        by("todo"),
        columns,
        false,
        RID,
      ),
    ).toBe("Only delegates and the author can reopen this issue");
    expect(
      refusal(issueItem(), by("in-progress"), columns, false, RID),
    ).toBeUndefined();
  });

  test("lets others reorder within a closing column but not change the reason", () => {
    const inDone = issueItem({
      column: "done",
      issue: closed,
      placement: placement(issueCard("i"), "done"),
    });
    expect(refusal(inDone, by("done"), columns, false, RID)).toBeUndefined();
    expect(refusal(inDone, by("canceled"), columns, false, RID)).toBe(
      "Only delegates and the author can change how this issue was closed",
    );
    expect(
      refusal(
        issueItem({ column: "done", issue: closed }),
        by("done"),
        columns,
        false,
        RID,
      ),
    ).toBe("Only delegates and the author can close this issue");
  });

  test("says that issues from other repositories keep their state", () => {
    expect(
      refusal(
        issueItem({ card: issueCard("i", OTHER) }),
        by("done"),
        columns,
        true,
        RID,
      ),
    ).toBe("Issues from other repositories can't be closed or reopened here");
  });
});

describe("accepts", () => {
  const columns = DEFAULT_COLUMNS;
  const done = columns.find(c => c.id === "done")!;
  const todo = columns.find(c => c.id === "todo")!;
  const inReview = columns.find(c => c.id === "in-review")!;

  test("patches never go into a closing column", () => {
    expect(accepts(patchItem("open", "todo"), done, columns, true, RID)).toBe(
      false,
    );
    expect(accepts(patchItem("open", "todo"), todo, columns, true, RID)).toBe(
      true,
    );
  });

  test("merged and archived patches stay where their state shows them", () => {
    expect(accepts(patchItem("merged", "done"), todo, columns, true, RID)).toBe(
      false,
    );
    expect(
      accepts(patchItem("archived", "canceled"), inReview, columns, true, RID),
    ).toBe(false);
    expect(
      accepts(patchItem("draft", "todo"), inReview, columns, true, RID),
    ).toBe(true);
  });

  test("with the right to close, an issue goes anywhere its state follows", () => {
    expect(accepts(issueItem(), done, columns, true, RID)).toBe(true);
    expect(
      accepts(
        issueItem({
          column: "done",
          issue: issue("i", { status: "closed", reason: "solved" }),
        }),
        todo,
        columns,
        true,
        RID,
      ),
    ).toBe(true);
  });

  test("without it, an issue moves between open columns only", () => {
    expect(accepts(issueItem(), done, columns, false, RID)).toBe(false);
    expect(accepts(issueItem(), todo, columns, false, RID)).toBe(true);
    expect(
      accepts(issueItem({ column: "done" }), todo, columns, false, RID),
    ).toBe(false);
    expect(
      accepts(
        issueItem({ placement: placement(issueCard("i"), "done") }),
        todo,
        columns,
        false,
        RID,
      ),
    ).toBe(false);
  });

  test("an issue from another repository keeps its state, so it only goes where that shows it", () => {
    const open = issueItem({ card: issueCard("i", OTHER) });
    const closed = issueItem({
      card: issueCard("i", OTHER),
      column: "done",
      issue: issue("i", { status: "closed", reason: "solved" }),
    });
    expect(accepts(open, done, columns, true, RID)).toBe(false);
    expect(accepts(open, inReview, columns, true, RID)).toBe(true);
    expect(accepts(closed, todo, columns, true, RID)).toBe(false);
    expect(accepts(closed, done, columns, true, RID)).toBe(true);
  });

  test("a closed issue on a board without closing columns stays in the first column", () => {
    const closed = issueItem({
      column: "todo",
      issue: issue("i", { status: "closed", reason: "solved" }),
      showsClosed: true,
    });
    expect(accepts(closed, NO_CLOSING[1], NO_CLOSING, true, RID)).toBe(false);
    expect(accepts(closed, NO_CLOSING[0], NO_CLOSING, true, RID)).toBe(true);
  });

  test("unresolved cards go anywhere", () => {
    const u = { ...issueItem(), kind: "unresolved" } as BoardItem;
    expect(accepts(u, done, columns, false, RID)).toBe(true);
  });
});

const positioned = (...positions: string[]) =>
  positions.map(position => ({ position }) as BoardItem);

// The fixture is shared with `radicle_board::position`, so both
// implementations are checked against the same keys.
describe("positions", () => {
  test.each(positions.between)(
    "between($before, $after) is $key",
    ({ before, after, key }) => {
      expect(between(before ?? undefined, after ?? undefined)).toBe(
        key ?? undefined,
      );
    },
  );

  test.each(positions.neighbours)(
    "dropping at $index of $positions gives $key",
    ({ positions, index, before, after, key }) => {
      expect(dropPosition(positioned(...positions), index)).toEqual({
        bounds: { before: before ?? undefined, after: after ?? undefined },
        position: key ?? undefined,
      });
    },
  );

  test("keeps keys ordered when inserting at the ends and in the middle", () => {
    const keys = [between()!];
    for (let i = 0; i < 200; i++) keys.push(between(keys.at(-1))!);
    for (let i = 0; i < 200; i++) keys.unshift(between(undefined, keys[0])!);
    for (let i = 0; i < 100; i++) {
      keys.splice(11, 0, between(keys[10], keys[11])!);
    }

    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
    expect(keys.every(k => k.length > 0 && !k.endsWith("0"))).toBe(true);
  });

  test("gives up at the length limit instead of producing a longer key", () => {
    const packed = (length: number, last: string) =>
      `V${"0".repeat(length - 2)}${last}`;
    expect(
      between(
        packed(MAX_POSITION_LENGTH, "1"),
        packed(MAX_POSITION_LENGTH, "2"),
      ),
    ).toBeUndefined();
    expect(
      dropPosition(
        positioned(
          packed(MAX_POSITION_LENGTH, "1"),
          packed(MAX_POSITION_LENGTH, "2"),
        ),
        1,
      ).position,
    ).toBeUndefined();
    expect(
      between(
        packed(MAX_POSITION_LENGTH - 1, "1"),
        packed(MAX_POSITION_LENGTH - 1, "2"),
      ),
    ).toHaveLength(MAX_POSITION_LENGTH);
  });

  test("neighbourPositions is dropPosition's bounds", () => {
    expect(neighbourPositions(positioned("A", "C", "C", "E"), 2)).toEqual({
      before: "C",
      after: "E",
    });
  });
});

describe("applyMove", () => {
  const groups = {
    todo: [issueItem({ key: "a" }), issueItem({ key: "b" })],
    done: [issueItem({ key: "c" })],
  };

  test("moves the item between and within columns", () => {
    expect(
      applyMove(groups, { item: groups.todo[0], column: "done", index: 1 }),
    ).toEqual({
      todo: [groups.todo[1]],
      done: [groups.done[0], groups.todo[0]],
    });
    expect(
      applyMove(groups, { item: groups.todo[0], column: "todo", index: 1 }),
    ).toEqual({ todo: [groups.todo[1], groups.todo[0]], done: groups.done });
    expect(applyMove(groups, undefined)).toBe(groups);
  });

  test("clamps the index and creates a missing column", () => {
    expect(
      applyMove(groups, { item: groups.done[0], column: "todo", index: 9 }),
    ).toEqual({ todo: [...groups.todo, groups.done[0]], done: [] });
    expect(
      applyMove(groups, { item: groups.done[0], column: "new", index: 0 }).new,
    ).toEqual([groups.done[0]]);
  });
});

describe("validName", () => {
  test("counts UTF-8 bytes, trimmed", () => {
    expect(validName("a".repeat(MAX_NAME_LENGTH))).toBe(true);
    expect(validName("a".repeat(MAX_NAME_LENGTH + 1))).toBe(false);
    expect(validName("é".repeat(MAX_NAME_LENGTH / 2))).toBe(true);
    expect(validName("é".repeat(MAX_NAME_LENGTH / 2 + 1))).toBe(false);
    expect(validName(`  ${"a".repeat(MAX_NAME_LENGTH)}  `)).toBe(true);
  });

  test("rejects empty and blank names", () => {
    expect(validName("")).toBe(false);
    expect(validName("   ")).toBe(false);
  });
});

describe("derived positions", () => {
  test("unplaced cards sort by priority, then newest first, then id", () => {
    const groups = groupItems(
      RID,
      undefined,
      [
        issue("a", undefined, { timestamp: 1 }),
        issue("b", undefined, { timestamp: 2 }),
        issue("c", undefined, { timestamp: 2, labels: ["priority:low"] }),
        issue("d", undefined, { timestamp: 1, labels: ["priority:urgent"] }),
        issue("e", undefined, { timestamp: 2 }),
      ],
      [],
      [],
    );
    expect(groups.backlog.map(i => i.card.oid)).toEqual([
      "d",
      "c",
      "b",
      "e",
      "a",
    ]);
  });
});

describe("priority helpers", () => {
  test("reads the priority label and ignores unknown levels", () => {
    expect(priorityOf([])).toBe("none");
    expect(priorityOf(["bug", "priority:high"])).toBe("high");
    expect(priorityOf(["priority:none"])).toBe("none");
    expect(priorityOf(["priority:critical"])).toBe("none");
  });

  test("replaces the priority label and keeps the rest", () => {
    expect(labelsForPriority(["bug", "priority:low"], "urgent")).toEqual([
      "bug",
      "priority:urgent",
    ]);
    expect(labelsForPriority(["bug", "priority:low"], "none")).toEqual(["bug"]);
    expect(labelsForPriority([], "medium")).toEqual(["priority:medium"]);
  });

  test("hides priority labels from display", () => {
    expect(displayLabels(["bug", "priority:low", "docs"])).toEqual([
      "bug",
      "docs",
    ]);
  });
});

function move(
  c: Card,
  column: string,
  position: string,
  extra: Partial<QueuedChange> = {},
): QueuedChange {
  return {
    rid: c.rid,
    board: "board-1",
    opts: { announce: true },
    card: c,
    change: { kind: "move", column, position },
    ...extra,
  };
}

function remove(c: Card, extra: Partial<QueuedChange> = {}): QueuedChange {
  return {
    rid: c.rid,
    board: "board-1",
    opts: { announce: true },
    card: c,
    change: { kind: "remove" },
    ...extra,
  };
}

describe("sameState", () => {
  test("compares closed states by reason", () => {
    expect(
      sameState(
        { status: "closed", reason: "solved" },
        { status: "closed", reason: "solved" },
      ),
    ).toBe(true);
    expect(
      sameState(
        { status: "closed", reason: "solved" },
        { status: "closed", reason: "other" },
      ),
    ).toBe(false);
    expect(sameState({ status: "open" }, { status: "open" })).toBe(true);
    expect(
      sameState({ status: "open" }, { status: "closed", reason: "other" }),
    ).toBe(false);
  });
});

describe("overlayBoard", () => {
  const a = issueCard("aaaa");
  const b = issueCard("bbbb");
  const committed = board([
    placement(a, "todo", "V"),
    placement(b, "todo", "k"),
  ]);

  test("returns the committed board when nothing is queued for it", () => {
    expect(overlayBoard(committed, [], ME, 5)).toBe(committed);
    expect(
      overlayBoard(
        committed,
        [{ ...move(a, "done", "V"), board: "other" }],
        ME,
        5,
      ),
    ).toBe(committed);
    expect(overlayBoard(undefined, [move(a, "done", "V")], ME, 5)).toBe(
      undefined,
    );
  });

  test("replaces moved cards and drops removed ones", () => {
    const shown = overlayBoard(
      committed,
      [move(a, "done", "V"), remove(b)],
      ME,
      5,
    )!;

    expect(shown.cards).toEqual([
      {
        card: a,
        column: "done",
        position: "V",
        movedBy: { did: ME },
        movedAt: 5,
      },
    ]);
    expect(committed.cards).toHaveLength(2);
  });

  test("adds cards that aren't on the board yet", () => {
    const c = issueCard("cccc", OTHER);
    const shown = overlayBoard(committed, [move(c, "todo", "x")], ME, 5)!;

    expect(shown.cards.map(p => cardKey(p.card))).toEqual([
      cardKey(a),
      cardKey(b),
      cardKey(c),
    ]);
  });
});

describe("overlayIssues", () => {
  const issues = [issue("aaaa"), issue("bbbb")];

  test("returns the issues unchanged when no state changes are queued", () => {
    expect(
      overlayIssues(RID, issues, [move(issueCard("aaaa"), "todo", "V")]),
    ).toBe(issues);
  });

  test("applies queued states, later entries winning", () => {
    const shown = overlayIssues(RID, issues, [
      move(issueCard("aaaa"), "done", "V", {
        state: { status: "closed", reason: "solved" },
      }),
      move(issueCard("aaaa"), "todo", "V", { state: { status: "open" } }),
      move(issueCard("bbbb"), "done", "V", {
        state: { status: "closed", reason: "solved" },
      }),
    ]);

    expect(shown.map(i => i.state)).toEqual([
      { status: "open" },
      { status: "closed", reason: "solved" },
    ]);
  });

  test("ignores states for issues from other repositories", () => {
    expect(
      overlayIssues(RID, issues, [
        move(issueCard("aaaa", OTHER), "done", "V", {
          state: { status: "closed", reason: "solved" },
        }),
      ]),
    ).toBe(issues);
  });
});

describe("baselinePlacement", () => {
  const a = issueCard("aaaa");
  const committed = board([placement(a, "todo", "V")]);

  test("uses the committed placement without a write in flight", () => {
    expect(baselinePlacement(committed, a, undefined)).toMatchObject({
      column: "todo",
      position: "V",
    });
    expect(baselinePlacement(committed, issueCard("bbbb"), undefined)).toBe(
      undefined,
    );
  });

  test("uses the change being written over the committed board", () => {
    expect(baselinePlacement(committed, a, move(a, "done", "k"))).toMatchObject(
      { column: "done", position: "k" },
    );
    expect(baselinePlacement(committed, a, remove(a))).toBeUndefined();
  });

  test("ignores a write in flight for another board", () => {
    expect(
      baselinePlacement(committed, a, { ...move(a, "done", "k"), board: "x" }),
    ).toMatchObject({ column: "todo", position: "V" });
  });
});

describe("isUnchanged", () => {
  const a = issueCard("aaaa");
  const placed = { column: "todo", position: "V" };

  test("a card moved back between its old neighbours", () => {
    expect(
      isUnchanged(move(a, "todo", "W"), placed, true, {
        before: "M",
        after: "k",
      }),
    ).toBe(true);
  });

  test("a card moved back to another spot in its column", () => {
    expect(
      isUnchanged(move(a, "todo", "l"), placed, true, {
        before: "k",
        after: "m",
      }),
    ).toBe(false);
    expect(
      isUnchanged(move(a, "todo", "l"), placed, true, { after: "M" }),
    ).toBe(false);
  });

  test("any spot in the column will do without a manual ordering", () => {
    expect(
      isUnchanged(move(a, "todo", "l"), placed, false, { before: "k" }),
    ).toBe(true);
  });

  test("a card in another column, or not on the board", () => {
    expect(isUnchanged(move(a, "done", "V"), placed, false)).toBe(false);
    expect(isUnchanged(move(a, "todo", "V"), undefined, false)).toBe(false);
  });

  test("a move that changes the issue's state", () => {
    expect(
      isUnchanged(
        move(a, "todo", "V", { state: { status: "open" } }),
        placed,
        false,
      ),
    ).toBe(false);
  });

  test("removing a card that isn't on the board", () => {
    expect(isUnchanged(remove(a), undefined, false)).toBe(true);
    expect(isUnchanged(remove(a), placed, false)).toBe(false);
  });
});

describe("batches", () => {
  test("groups changes by repository and board", () => {
    const a = issueCard("aaaa");
    const b = issueCard("bbbb");
    const c = issueCard("cccc", OTHER);
    const result = batches([
      move(a, "todo", "V"),
      remove(b),
      { ...move(b, "todo", "k"), board: "board-2" },
      move(c, "done", "V"),
    ]);

    expect(
      result.map(({ rid, board, moves, removes }) => ({
        rid,
        board,
        moves,
        removes,
      })),
    ).toEqual([
      {
        rid: RID,
        board: "board-1",
        moves: [{ card: a, column: "todo", position: "V" }],
        removes: [b],
      },
      {
        rid: RID,
        board: "board-2",
        moves: [{ card: b, column: "todo", position: "k" }],
        removes: [],
      },
      {
        rid: OTHER,
        board: "board-1",
        moves: [{ card: c, column: "done", position: "V" }],
        removes: [],
      },
    ]);
    expect(result[0].entries).toHaveLength(2);
  });

  test("nothing queued is nothing to write", () => {
    expect(batches([])).toEqual([]);
  });
});
