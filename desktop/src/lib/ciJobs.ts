import type { Author } from "@bindings/cob/Author";
import type { Job } from "@bindings/repo/Job";
import type { Run } from "@bindings/repo/Run";

import { safeHttpUrl } from "@app/lib/utils";

// How the CI status chip groups and summarises a commit's job runs.

export type Status = Run["status"];

export type RunView = {
  run: Run;
  label: string;
  safeLog: string | undefined;
};

export type HostGroup = {
  host: string;
  runs: RunView[];
};

export type Counts = { succeeded: number; failed: number; started: number };

export type NodeGroup = {
  nodeKey: string;
  author: Author;
  hosts: HostGroup[];
  flatRuns?: RunView[];
  inlineHost?: string;
  counts: Counts;
  status: Status;
};

function parseUrl(s: string): URL | undefined {
  try {
    return new URL(s);
  } catch {
    return undefined;
  }
}

export function runLabel(run: Run, url: URL | undefined): string {
  if (url && url.host === "github.com") {
    const m = url.pathname.match(/\/actions\/runs\/(\d+)/);
    if (m) return m[1];
  }
  return run.runId.slice(0, 8);
}

export function isTerminal(status: Status): boolean {
  return status === "succeeded" || status === "failed";
}

export function aggregateStatus(c: Counts): Status {
  if (c.failed) return "failed";
  if (c.started) return "started";
  return "succeeded";
}

export function statusLabel(c: Counts): string {
  const parts: string[] = [];
  if (c.succeeded) parts.push(`${c.succeeded} passed`);
  if (c.failed) parts.push(`${c.failed} failed`);
  if (c.started) parts.push(`${c.started} running`);
  return parts.join(" · ");
}

export function totalCounts(groups: NodeGroup[]): Counts {
  const total: Counts = { succeeded: 0, failed: 0, started: 0 };
  for (const g of groups) {
    total.succeeded += g.counts.succeeded;
    total.failed += g.counts.failed;
    total.started += g.counts.started;
  }
  return total;
}

export function groupJobs(jobs: Job[]): NodeGroup[] {
  const byNode: Record<
    string,
    {
      author: Author;
      byHost: Record<string, RunView[]>;
      seen: Map<string, RunView>;
    }
  > = {};
  const nodeOrder: string[] = [];
  for (const job of jobs) {
    for (const run of job.runs) {
      const url = parseUrl(run.log);
      const host = url && url.host ? url.host : "(unknown host)";
      const safeLog =
        url?.host !== "no.url.example.com" ? safeHttpUrl(run.log) : undefined;
      const view: RunView = {
        run,
        label: runLabel(run, url),
        safeLog,
      };
      const key = run.node.did;
      let entry = byNode[key];
      if (!entry) {
        entry = { author: run.node, byHost: {}, seen: new Map() };
        byNode[key] = entry;
        nodeOrder.push(key);
      }
      const existing = entry.seen.get(run.runId);
      if (existing) {
        // The same run can appear under multiple job COBs. Keep one view
        // per runId, but let a terminal status override a stale "started"
        // one when COBs polled at different times disagree. We mutate the
        // existing view in place because it is the same object referenced
        // from its host bucket below.
        if (!isTerminal(existing.run.status) && isTerminal(run.status)) {
          existing.run = run;
          existing.label = view.label;
          existing.safeLog = view.safeLog;
        }
        continue;
      }
      entry.seen.set(run.runId, view);
      const bucket = entry.byHost[host] ?? (entry.byHost[host] = []);
      bucket.push(view);
    }
  }
  return nodeOrder.map(nodeKey => {
    const { author, byHost } = byNode[nodeKey];
    const hosts: HostGroup[] = Object.entries(byHost).map(([host, runs]) => ({
      host,
      runs,
    }));
    const counts: Counts = { succeeded: 0, failed: 0, started: 0 };
    for (const { runs } of hosts) {
      for (const v of runs) counts[v.run.status]++;
    }
    const group: NodeGroup = {
      nodeKey,
      author,
      hosts,
      counts,
      status: aggregateStatus(counts),
    };
    if (hosts.length === 1) {
      group.flatRuns = hosts[0].runs;
      if (!aliasMatchesHost(author.alias, hosts[0].host)) {
        group.inlineHost = hosts[0].host;
      }
    }
    return group;
  });
}

export function aliasMatchesHost(
  alias: string | undefined,
  host: string,
): boolean {
  if (!alias) return false;
  const a = alias.toLowerCase();
  if (host === a) return true;
  if (host.endsWith("." + a)) return true;
  return host.split(".").includes(a);
}
