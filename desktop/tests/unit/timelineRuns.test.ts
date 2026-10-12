import type { Author } from "@bindings/cob/Author";
import type { Thread } from "@bindings/cob/thread/Thread";

import { describe, expect, test } from "vitest";

import type { Run, TimelineEntry } from "@app/lib/timelineRuns";
import { mergeTimeline, timelineRuns } from "@app/lib/timelineRuns";

import { author, comment } from "./support/cobs";

const alice = author("alice");
const bob = author("bob");

type Data = { by: Author };

function activity(key: string, by: Author, standalone = false) {
  return {
    kind: "activity" as const,
    key,
    timestamp: 0,
    data: { by },
    standalone,
  };
}

function threadEntry(key: string, by: Author): TimelineEntry<Data> {
  return {
    kind: "thread",
    key,
    timestamp: 0,
    thread: {
      root: comment({ id: key, author: by }),
      replies: [],
    } as unknown as Thread,
  };
}

// `a:x` for a single entry, `a:[x,y]` for a group, `thread:x` for a thread;
// `+` marks a run that repeats the previous run's author.
function shape(runs: Run<Data>[]): string[] {
  return runs.map(run => {
    if (run.kind === "thread") return `thread:${run.entry.key}`;
    const repeat = run.repeatsAuthor ? "+" : "";
    if (run.kind === "single") return `${repeat}${run.entry.key}`;
    return `${repeat}[${run.entries.map(e => e.key).join(",")}]`;
  });
}

const authorOf = (data: Data) => data.by;

describe("mergeTimeline", () => {
  test("merges threads and activity, oldest first", () => {
    const merged = mergeTimeline<Data>(
      [
        {
          root: comment({ id: "t", timestamp: 2 }),
          replies: [],
        } as unknown as Thread,
      ],
      [
        { key: "late", timestamp: 3, data: { by: alice } },
        { key: "early", timestamp: 1, data: { by: alice }, standalone: true },
      ],
    );

    expect(merged.map(e => [e.kind, e.key])).toEqual([
      ["activity", "early"],
      ["thread", "t"],
      ["activity", "late"],
    ]);
    expect(merged[0]).toMatchObject({ standalone: true });
    expect(merged[2]).toMatchObject({ standalone: false });
  });
});

describe("timelineRuns", () => {
  test("groups consecutive activity by the same author", () => {
    expect(
      shape(
        timelineRuns(
          [activity("a1", alice), activity("a2", alice), activity("a3", alice)],
          authorOf,
        ),
      ),
    ).toEqual(["[a1,a2,a3]"]);
  });

  test("starts a new run for another author", () => {
    expect(
      shape(
        timelineRuns(
          [activity("a1", alice), activity("b1", bob), activity("a2", alice)],
          authorOf,
        ),
      ),
    ).toEqual(["a1", "b1", "a2"]);
  });

  test("a thread breaks a run, and the author isn't named again after it", () => {
    const thread = threadEntry("t", alice);
    const runs = timelineRuns(
      [
        activity("a1", alice),
        thread,
        activity("a2", alice),
        activity("a3", alice),
      ],
      authorOf,
    );

    expect(shape(runs)).toEqual(["a1", "thread:t", "+[a2,a3]"]);
    expect(runs[1]).toEqual({ kind: "thread", entry: thread });
  });

  test("standalone entries are never grouped", () => {
    expect(
      shape(
        timelineRuns(
          [
            activity("a1", alice),
            activity("card", alice, true),
            activity("a2", alice),
          ],
          authorOf,
        ),
      ),
    ).toEqual(["a1", "+card", "+a2"]);
  });

  test("a group keeps the repeat flag of the entry it grew from", () => {
    expect(
      shape(
        timelineRuns(
          [
            activity("card", alice, true),
            activity("a1", alice),
            activity("a2", alice),
          ],
          authorOf,
        ),
      ),
    ).toEqual(["card", "+[a1,a2]"]);
  });

  test("activity without an author is never grouped", () => {
    expect(
      shape(timelineRuns([activity("x", alice), activity("y", alice)])),
    ).toEqual(["x", "y"]);
  });
});
