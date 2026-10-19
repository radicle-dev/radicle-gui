import type { Snapshot } from "@app/node/diff";
import type { Repo } from "@app/node/model";

export interface Entry {
  name: string;
  path: string;
  kind: "tree" | "blob";
}

export function listDir(snapshot: Snapshot, dir: string): Entry[] {
  const prefix = dir ? `${dir}/` : "";
  const seen = new Map<string, Entry>();
  for (const path of Object.keys(snapshot)) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const [name, ...more] = rest.split("/");
    if (!name) continue;
    const kind = more.length > 0 ? "tree" : "blob";
    if (!seen.has(name) || kind === "tree") {
      seen.set(name, { name, path: prefix + name, kind });
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "tree" ? -1 : 1,
  );
}

export function isDir(snapshot: Snapshot, path: string): boolean {
  if (!path) return true;
  return Object.keys(snapshot).some(p => p.startsWith(`${path}/`));
}

export function findReadme(snapshot: Snapshot, dir = ""): string | undefined {
  return listDir(snapshot, dir).find(
    e => e.kind === "blob" && /^readme(\.md|\.markdown|\.txt)?$/i.test(e.name),
  )?.path;
}

// The last commit on `from`'s first-parent history that touched `path`.
export function lastCommitFor(
  repo: Repo,
  from: string,
  path: string,
): string | undefined {
  if (!path) return from;
  let cursor: string | undefined = from;
  while (cursor) {
    const commit: Repo["commits"][string] | undefined = repo.commits[cursor];
    if (!commit) return undefined;
    const parent: string | undefined = commit.parents[0];
    const now = repo.snapshots[cursor];
    const before = parent ? repo.snapshots[parent] : {};
    const touched = Object.keys({ ...now, ...before }).some(
      p => (p === path || p.startsWith(`${path}/`)) && now[p] !== before[p],
    );
    if (touched || !parent) return cursor;
    cursor = parent;
  }
  return undefined;
}

// Splits "branch/with/slashes/and/then/a/path" into a known ref and a path.
export function splitRef(
  repo: Repo,
  rest: string,
  peerBranches?: Record<string, string>,
): { ref: string; commit: string; path: string } {
  const segments = rest.split("/").filter(Boolean);
  const branches = peerBranches ?? repo.branches;
  for (let end = segments.length; end > 0; end--) {
    const candidate = segments.slice(0, end).join("/");
    const commit =
      branches[candidate] ??
      repo.tags.find(t => t.name === candidate)?.commit ??
      (repo.commits[candidate] ? candidate : undefined);
    if (commit) {
      return { ref: candidate, commit, path: segments.slice(end).join("/") };
    }
  }
  const fallback = branches[repo.defaultBranch] !== undefined
    ? repo.defaultBranch
    : (Object.keys(branches)[0] ?? repo.defaultBranch);
  return {
    ref: fallback,
    commit: branches[fallback] ?? repo.branches[repo.defaultBranch],
    path: segments.join("/"),
  };
}
