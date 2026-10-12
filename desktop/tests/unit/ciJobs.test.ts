import type { Job } from "@bindings/repo/Job";
import type { Run } from "@bindings/repo/Run";

import { describe, expect, test } from "vitest";

import {
  aggregateStatus,
  aliasMatchesHost,
  groupJobs,
  isTerminal,
  runLabel,
  statusLabel,
  totalCounts,
} from "@app/lib/ciJobs";

import { author } from "./support/cobs";

const ci = author("ci", "ci.example.com");
const other = author("other", "other");

function run(runId: string, props: Partial<Run> = {}): Run {
  return {
    runId,
    node: ci,
    status: "succeeded",
    log: `https://ci.example.com/runs/${runId}`,
    ...props,
  };
}

function job(runs: Run[]): Job {
  return { jobId: "job", commit: "c", runs };
}

describe("run details", () => {
  test("runLabel uses the GitHub Actions run number when there is one", () => {
    expect(
      runLabel(
        run("abcdefghijk"),
        new URL("https://github.com/o/r/actions/runs/12345/job/1"),
      ),
    ).toBe("12345");
  });

  test("runLabel falls back to a short run id", () => {
    expect(runLabel(run("abcdefghijk"), undefined)).toBe("abcdefgh");
    expect(
      runLabel(run("abcdefghijk"), new URL("https://github.com/o/r")),
    ).toBe("abcdefgh");
    expect(
      runLabel(
        run("abcdefghijk"),
        new URL("https://ci.example.com/actions/runs/12345"),
      ),
    ).toBe("abcdefgh");
  });

  test.each([
    ["succeeded", true],
    ["failed", true],
    ["started", false],
  ] as const)("isTerminal(%j) is %j", (status, expected) => {
    expect(isTerminal(status)).toBe(expected);
  });
});

describe("summaries", () => {
  test.each([
    [{ succeeded: 1, failed: 1, started: 1 }, "failed"],
    [{ succeeded: 1, failed: 0, started: 1 }, "started"],
    [{ succeeded: 2, failed: 0, started: 0 }, "succeeded"],
    [{ succeeded: 0, failed: 0, started: 0 }, "succeeded"],
  ])("aggregateStatus(%j) is %j", (counts, expected) => {
    expect(aggregateStatus(counts)).toBe(expected);
  });

  test("statusLabel names each non-zero count", () => {
    expect(statusLabel({ succeeded: 2, failed: 1, started: 3 })).toBe(
      "2 passed · 1 failed · 3 running",
    );
    expect(statusLabel({ succeeded: 0, failed: 1, started: 0 })).toBe(
      "1 failed",
    );
    expect(statusLabel({ succeeded: 0, failed: 0, started: 0 })).toBe("");
  });

  test("totalCounts adds up every group", () => {
    const groups = groupJobs([
      job([
        run("a"),
        run("b", { status: "failed" }),
        run("c", { node: other, status: "started" }),
      ]),
    ]);

    expect(totalCounts(groups)).toEqual({
      succeeded: 1,
      failed: 1,
      started: 1,
    });
  });
});

describe("aliasMatchesHost", () => {
  test.each([
    ["ci.example.com", "ci.example.com", true],
    ["example.com", "ci.example.com", true],
    ["ci", "ci.example.com", true],
    ["CI", "ci.example.com", true],
    ["other", "ci.example.com", false],
    ["ample.com", "ci.example.com", false],
    [undefined, "ci.example.com", false],
  ])("alias %j on host %j is %j", (alias, host, expected) => {
    expect(aliasMatchesHost(alias, host)).toBe(expected);
  });
});

describe("groupJobs", () => {
  test("groups runs by node in order of first appearance", () => {
    const groups = groupJobs([
      job([run("a"), run("b", { node: other })]),
      job([run("c")]),
    ]);

    expect(groups.map(g => [g.nodeKey, g.counts.succeeded])).toEqual([
      [ci.did, 2],
      [other.did, 1],
    ]);
  });

  test("groups a node's runs by log host", () => {
    const [group] = groupJobs([
      job([
        run("a"),
        run("b", { log: "https://github.com/o/r/actions/runs/7" }),
        run("c", { log: "not a url" }),
        run("d", { log: "mailto:ci@example.com" }),
      ]),
    ]);

    expect(
      group.hosts.map(h => [h.host, h.runs.map(r => r.run.runId)]),
    ).toEqual([
      ["ci.example.com", ["a"]],
      ["github.com", ["b"]],
      ["(unknown host)", ["c", "d"]],
    ]);
    expect(group.flatRuns).toBeUndefined();
  });

  test("lists a single host's runs flat, naming the host unless the alias does", () => {
    const [named] = groupJobs([job([run("a")])]);
    expect(named.flatRuns?.map(r => r.run.runId)).toEqual(["a"]);
    expect(named.inlineHost).toBeUndefined();

    const [unnamed] = groupJobs([job([run("a", { node: other })])]);
    expect(unnamed.inlineHost).toBe("ci.example.com");
  });

  test("keeps one view per run, letting a finished status win", () => {
    const [group] = groupJobs([
      job([run("a", { status: "started" })]),
      job([run("a", { status: "failed" })]),
      job([run("a", { status: "started" })]),
    ]);

    expect(group.hosts[0].runs.map(r => r.run.status)).toEqual(["failed"]);
    expect(group.status).toBe("failed");
  });

  test("keeps the first finished status of a run", () => {
    const [group] = groupJobs([
      job([run("a", { status: "failed" })]),
      job([run("a", { status: "succeeded" })]),
    ]);

    expect(group.hosts[0].runs.map(r => r.run.status)).toEqual(["failed"]);
  });

  test("links only to safe logs, and not to the placeholder host", () => {
    const [group] = groupJobs([
      job([
        run("a"),
        run("b", { log: "javascript:alert(1)" }),
        run("c", { log: "https://no.url.example.com/x" }),
      ]),
    ]);

    expect(
      group.hosts.flatMap(h => h.runs.map(r => [r.run.runId, r.safeLog])),
    ).toEqual([
      ["a", "https://ci.example.com/runs/a"],
      ["b", undefined],
      ["c", undefined],
    ]);
  });
});
