// A simulated Ryph integration (https://ryph.ai). Ryph runs coding agents in
// sandboxes. On Radicle, a delegate summons one by commenting
// `/ryph <agent> <instructions>` on an issue or patch; the agent reads the
// thread, works in an environment built for the repo, runs the repo's checks
// and delivers its change as a patch, signed by the Ryph instance's node.

import type { Snapshot } from "./diff";
import type {
  AgentKey,
  Check,
  Person,
  Repo,
  RyphAgent,
  RyphConnection,
  RyphRun,
  RyphRunKind,
  World,
} from "./model";

import { nidFor, oid, rng } from "./hash";

export const AGENTS: RyphAgent[] = [
  {
    id: "agent-mender",
    handle: "mender",
    name: "Mender",
    does: "Fixes bugs from issues and addresses review comments on patches.",
    model: "claude-opus-5-5",
  },
  {
    id: "agent-scout",
    handle: "scout",
    name: "Scout",
    does: "Investigates a question across the code and writes up what it finds.",
    model: "claude-sonnet-5-5",
  },
  {
    id: "agent-sweeper",
    handle: "sweeper",
    name: "Sweeper",
    does: "Keeps the tracker tidy: labels, duplicates and stale threads.",
    model: "claude-haiku-5-5",
  },
];

export function agentPeople(): Record<string, Person> {
  const out: Record<string, Person> = {};
  for (const a of AGENTS) {
    const nid = nidFor(a.id);
    out[a.id] = {
      id: a.id,
      nid,
      did: `did:key:${nid}`,
      alias: a.handle,
      name: `${a.name} (Ryph agent)`,
      bio: a.does,
      keys: 1,
    };
  }
  return out;
}

export function isAgent(person: string): person is AgentKey {
  return person.startsWith("agent-");
}

const DEFAULT_CHECKS: Record<string, string[]> = {
  beacon: ["fmt", "clippy", "test"],
  "atlas-ui": ["lint", "typecheck", "test"],
};

// Which repos start out connected, to which instance.
export function seedConnections(world: World, epoch: number): Record<string, RyphConnection> {
  const out: Record<string, RyphConnection> = {};
  for (const repo of Object.values(world.repos)) {
    if (repo.name === "beacon") {
      out[repo.rid] = {
        instance: "ryph.lumenlabs.dev",
        connectedBy: "ada",
        connectedAt: epoch - 40 * 86400000,
        agents: ["agent-mender", "agent-scout", "agent-sweeper"],
        checks: DEFAULT_CHECKS.beacon,
        allowlist: ["yuki"],
      };
    } else if (repo.name === "atlas-ui") {
      out[repo.rid] = {
        instance: "ryph.fieldwork.studio",
        connectedBy: "mira",
        connectedAt: epoch - 22 * 86400000,
        agents: ["agent-mender", "agent-sweeper"],
        checks: DEFAULT_CHECKS["atlas-ui"],
        allowlist: [],
      };
    }
  }
  return out;
}

export function checksFor(repo: Repo): string[] {
  return DEFAULT_CHECKS[repo.name] ?? ["lint", "test"];
}

// Give every revision on a connected repo a check result, so patches show the
// agentic CI suite. A revision someone rejected usually failed something.
export function seedChecks(world: World, connections: Record<string, RyphConnection>) {
  for (const [rid, conn] of Object.entries(connections)) {
    const repo = world.repos[rid];
    if (!repo) continue;
    for (const patch of repo.patches) {
      patch.revisions.forEach((rev, i) => {
        const random = rng(rev.id);
        const rejected = rev.reviews.some(r => r.verdict === "reject");
        const failing = rejected && i < patch.revisions.length - 1 ? conn.checks.length - 1 : -1;
        rev.checks = conn.checks.map((name, n) => ({
          name,
          status: n === failing ? "failed" : "passed",
          durationSec: Math.round(8 + random() * 140),
        }));
      });
    }
  }
}

export function seedRuns(world: World, epoch: number): RyphRun[] {
  const beacon = Object.values(world.repos).find(r => r.name === "beacon");
  if (!beacon) return [];
  const issue = beacon.issues.find(i => i.state === "open") ?? beacon.issues[0];
  if (!issue) return [];
  const startedAt = epoch - 3 * 86400000;
  return [
    {
      id: oid("seed-run", beacon.rid).slice(0, 4),
      rid: beacon.rid,
      agent: "agent-sweeper",
      requestedBy: "ada",
      thread: { kind: "issue", id: issue.id, title: issue.title },
      instruction: "label the open issues and flag duplicates",
      kind: "triage",
      startedAt,
      plan: plan("triage", []),
      checks: [],
      deliveredAt: startedAt + 30000,
      summary: "Labelled 4 issues and found no duplicates.",
    },
  ];
}

export function kindFor(agent: AgentKey, threadKind: "issue" | "patch"): RyphRunKind {
  if (agent === "agent-scout") return "research";
  if (agent === "agent-sweeper") return "triage";
  return threadKind === "patch" ? "review" : "fix";
}

// Seconds after the run starts that each step finishes.
export function plan(kind: RyphRunKind, checks: string[]): RyphRun["plan"] {
  const steps: RyphRun["plan"] = [
    { label: "Checked your access and accepted the run", at: 1 },
    { label: "Read the thread", at: 3 },
  ];
  if (kind === "triage") {
    steps.push({ label: "Read the open issues", at: 7 }, { label: "Applied labels", at: 10 });
    return steps;
  }
  steps.push({ label: "Started the repo's environment", at: 6 });
  if (kind === "research") {
    steps.push({ label: "Explored the code", at: 11 }, { label: "Wrote up the findings", at: 15 });
    return steps;
  }
  steps.push({
    label: kind === "review" ? "Addressed the review comments" : "Made the change",
    at: 11,
  });
  let t = 13;
  for (const name of checks) {
    t += 2;
    steps.push({ label: `Check ${name} passed`, at: t });
  }
  steps.push({ label: kind === "review" ? "Pushed a new revision" : "Submitted a patch", at: t + 2 });
  return steps;
}

export function runDuration(run: RyphRun): number {
  return run.plan[run.plan.length - 1]?.at ?? 0;
}

// Where a run is at `now`.
export function runState(run: RyphRun, now: number) {
  const elapsed = (now - run.startedAt) / 1000;
  const done = run.plan.filter(s => s.at <= elapsed).length;
  const finished = run.deliveredAt !== undefined || done >= run.plan.length;
  const checks: Check[] = run.checks.map(name => {
    const step = run.plan.find(s => s.label === `Check ${name} passed`);
    const passed = step && step.at <= elapsed;
    const running = step && step.at - 2 <= elapsed;
    return {
      name,
      status: finished || passed ? "passed" : running ? "running" : "queued",
    };
  });
  return {
    elapsed,
    stepsDone: finished ? run.plan.length : done,
    finished,
    status: finished ? ("done" as const) : done === 0 ? ("queued" as const) : ("running" as const),
    checks,
  };
}

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

// The change an agent makes for an issue: a regression test in the repo's own
// language and a changelog entry.
export function fixChanges(snapshot: Snapshot, title: string, runId: string): Snapshot {
  const next = { ...snapshot };
  const name = slug(title) || `issue_${runId}`;
  const paths = Object.keys(snapshot);
  if (paths.some(p => p.endsWith(".rs"))) {
    next[`tests/regression_${name}.rs`] = [
      `//! Regression test for "${title}".`,
      "",
      "use beacon::{Beacon, Config};",
      "",
      "#[test]",
      `fn ${name}() {`,
      "    let mut beacon = Beacon::new(Config::default());",
      "    // Reproduces the report, then checks the fixed behaviour.",
      "    assert!(beacon.peers().count() == 0);",
      "}",
      "",
    ].join("\n");
  } else if (paths.some(p => p.endsWith(".ts") || p.endsWith(".svelte"))) {
    next[`src/__tests__/${name}.test.ts`] = [
      `// Regression test for "${title}".`,
      'import { describe, expect, it } from "vitest";',
      "",
      `describe("${title.replace(/"/g, "'")}", () => {`,
      '  it("stays fixed", () => {',
      "    expect(true).toBe(true);",
      "  });",
      "});",
      "",
    ].join("\n");
  } else if (paths.some(p => p.endsWith(".go"))) {
    next[`internal/regression/${name}_test.go`] = [
      "package regression",
      "",
      'import "testing"',
      "",
      `// Regression test for "${title}".`,
      `func Test_${name}(t *testing.T) {}`,
      "",
    ].join("\n");
  } else if (paths.some(p => p.endsWith(".py"))) {
    next[`tests/test_${name}.py`] = [`"""Regression test for "${title}"."""`, "", `def test_${name}():`, "    assert True", ""].join("\n");
  }
  const changelog = paths.find(p => /^changelog\.md$/i.test(p));
  if (changelog) {
    const content = snapshot[changelog];
    const entry = `- ${title}.\n`;
    next[changelog] = /## Unreleased\n\n/.test(content)
      ? content.replace(/## Unreleased\n\n/, `## Unreleased\n\n${entry}`)
      : content.replace(/\n## /, `\n## Unreleased\n\n${entry}\n## `);
  }
  return next;
}

// The change an agent makes to address review comments: a note at each
// commented line explaining what changed there.
export function reviewChanges(
  snapshot: Snapshot,
  comments: { path: string; line: number; body: string }[],
): Snapshot {
  const next = { ...snapshot };
  const byFile = new Map<string, { line: number; body: string }[]>();
  for (const c of comments) {
    if (!next[c.path]) continue;
    byFile.set(c.path, [...(byFile.get(c.path) ?? []), c]);
  }
  for (const [path, list] of byFile) {
    const lines = next[path].split("\n");
    const marker = path.endsWith(".py") ? "#" : "//";
    for (const c of [...list].sort((a, b) => b.line - a.line)) {
      const indent = lines[c.line - 1]?.match(/^\s*/)?.[0] ?? "";
      const note = c.body.replace(/\s+/g, " ").slice(0, 72);
      lines.splice(c.line - 1, 0, `${indent}${marker} Per review: ${note}`);
    }
    next[path] = lines.join("\n");
  }
  return next;
}

export function researchWriteUp(repo: Repo, snapshot: Snapshot, question: string): string {
  const files = Object.entries(snapshot)
    .filter(([p]) => !/readme|license|changelog|\.gitignore/i.test(p))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([p, c]) => `- \`${p}\` (${c.split("\n").length} lines)`);
  return [
    `I looked into: _${question || "the question in this thread"}_.`,
    "",
    "**Where it lives**",
    ...files,
    "",
    "**What I found**",
    `The relevant logic is concentrated in the first file above. ${repo.name} keeps this path free of I/O, so the behaviour can be reproduced in a unit test without a network.`,
    "",
    "I haven't changed any code. Ask `/ryph mender` to make the fix if you'd like a patch.",
  ].join("\n");
}
