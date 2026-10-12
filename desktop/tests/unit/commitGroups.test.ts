import type { Commit } from "@bindings/repo/Commit";

import { describe, expect, test } from "vitest";

import {
  commitRowsOf,
  dayKey,
  dayLabel,
  groupCommitsByDay,
} from "@app/lib/commitGroups";

// The unit tests run with TZ=UTC.
const now = Date.UTC(2026, 8, 30, 12);
const hour = 3600 * 1000;

function commit(id: string, at: number): Commit {
  const person = { name: "Alice", email: "a@x", time: at / 1000 };
  return {
    id,
    author: person,
    committer: person,
    summary: id,
    message: id,
    parents: [],
  } as unknown as Commit;
}

test("dayKey is the calendar day", () => {
  expect(dayKey(Date.UTC(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  expect(dayKey(Date.UTC(2026, 0, 6, 0, 0))).toBe("2026-01-06");
});

describe("dayLabel", () => {
  test.each([
    [now, "Today"],
    [Date.UTC(2026, 8, 30, 0, 0), "Today"],
    [Date.UTC(2026, 8, 29, 23, 59), "Yesterday"],
    [Date.UTC(2026, 8, 29, 0, 0), "Yesterday"],
    [Date.UTC(2026, 8, 28, 23, 59), "Monday, September 28, 2026"],
  ])("labels %j as %j", (timestamp, expected) => {
    expect(dayLabel(timestamp, now)).toBe(expected);
  });

  test("defaults to the current time", () => {
    expect(dayLabel(Date.now())).toBe("Today");
  });

  test("handles yesterday across a month boundary", () => {
    expect(dayLabel(Date.UTC(2026, 8, 30, 10), Date.UTC(2026, 9, 1, 10))).toBe(
      "Yesterday",
    );
  });
});

describe("grouping", () => {
  const commits = [
    commit("a", now),
    commit("b", now - 2 * hour),
    commit("c", now - 24 * hour),
    commit("d", now - 1000 * hour),
  ];

  test("groups commits by day in order", () => {
    expect(
      groupCommitsByDay(commits, now).map(g => [
        g.label,
        ...g.commits.map(c => c.id),
      ]),
    ).toEqual([
      ["Today", "a", "b"],
      ["Yesterday", "c"],
      ["Wednesday, August 19, 2026", "d"],
    ]);
  });

  test("merges a day's commits even when they aren't adjacent", () => {
    expect(
      groupCommitsByDay(
        [
          commit("a", now),
          commit("c", now - 24 * hour),
          commit("b", now - hour),
        ],
        now,
      ).map(g => g.commits.map(c => c.id)),
    ).toEqual([["a", "b"], ["c"]]);
  });

  test("groups by commit date, not author date", () => {
    const rebased = {
      ...commit("r", now),
      author: { name: "Alice", email: "a@x", time: (now - 1000 * hour) / 1000 },
    };

    expect(groupCommitsByDay([rebased], now)[0].label).toBe("Today");
  });

  test("flattens groups into header and commit rows", () => {
    const rows = commitRowsOf(groupCommitsByDay(commits.slice(0, 3), now));

    expect(
      rows.map(row =>
        row.type === "header"
          ? `# ${row.label}`
          : `${row.commit.id}${row.first ? " first" : ""}${row.last ? " last" : ""}`,
      ),
    ).toEqual(["# Today", "a first", "b last", "# Yesterday", "c first last"]);
  });
});
