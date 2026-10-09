import type { AliasSuggestion } from "@bindings/cob/AliasSuggestion";
import type { DiffOptions } from "@bindings/cob/DiffOptions";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
import type { Patch } from "@bindings/cob/patch/Patch";
import type { Release } from "@bindings/cob/release/Release";
import type { ReleaseFilter } from "@bindings/cob/release/ReleaseFilter";
import type { Config } from "@bindings/config/Config";
import type { Diff } from "@bindings/diff/Diff";
import type { Stats } from "@bindings/diff/Stats";
import type { Commit } from "@bindings/repo/Commit";
import type { Job } from "@bindings/repo/Job";
import type { RepoInfo } from "@bindings/repo/RepoInfo";
import type { RepoSummary } from "@bindings/repo/RepoSummary";
import type { TreePath } from "@bindings/repo/TreePath";

import * as tauri from "@tauri-apps/api/core";

import { cached } from "@app/lib/cached";
import type { RepoListScope } from "@app/lib/repoListScope";

export async function invoke<T = null>(
  cmd: string,
  args?: tauri.InvokeArgs,
  options?: tauri.InvokeOptions,
): Promise<T> {
  if (import.meta.env.VITE_LOG_INVOKE_TIMINGS === "true") {
    const start = performance.now();
    try {
      return await withTestBackend<T>(tauri.invoke, cmd, args, options);
    } finally {
      const ms = Math.round(performance.now() - start);

      console.debug(`[invoke] ${cmd} ${ms}ms`);
    }
  }
  return withTestBackend<T>(tauri.invoke, cmd, args, options);
}

/**
 * Invoking a Tauri command returned an error with the given message
 */
class InvokeError extends Error {
  name = "InvokeError";
  code: string;

  constructor(message: string, code = "Unknown Error") {
    super(message);
    this.code = code;
    Error.captureStackTrace?.(this, InvokeError);
  }
}

async function withTestBackend<T>(
  fn: (
    cmd: string,
    args?: tauri.InvokeArgs,
    options?: tauri.InvokeOptions,
  ) => Promise<T>,
  cmd: string,
  args?: tauri.InvokeArgs,
  options?: tauri.InvokeOptions,
) {
  if (window.__TAURI_INTERNALS__) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return fn(cmd, args, options).catch((error: any) => {
      if (typeof error === "object" && error !== null && "message" in error) {
        throw new InvokeError(String(error.message), String(error.code));
      } else {
        throw new InvokeError(`Invalid error object: ${error}`);
      }
    });
  } else {
    const raw = args instanceof Uint8Array;
    const headers = new Headers(options?.headers);
    headers.set(
      "Content-Type",
      raw ? "application/octet-stream" : "application/json",
    );
    return fetch(`http://127.0.0.1:${testHttpApiPort()}/${cmd}`, {
      method: "POST",
      headers,
      body: raw ? args.slice() : JSON.stringify(args ?? {}),
    }).then(async response => {
      if (response.status === 404) {
        throw new InvokeError(
          `test-http-api has no route for \`${cmd}\``,
          "TestHttpApi.MissingRoute",
        );
      }
      if (
        response.ok &&
        response.headers.get("Content-Type") === "application/octet-stream"
      ) {
        return response.arrayBuffer();
      }
      const json = await response.json();
      if (!response.ok) {
        if (typeof json === "object" && json !== null && "message" in json) {
          throw new InvokeError(String(json.message), String(json.code));
        } else {
          throw new InvokeError(`Invalid error object: ${json}`);
        }
      }

      return json;
    });
  }
}

function testHttpApiPort(): number | string {
  return (
    window.__TEST_HTTP_API_PORT__ ??
    import.meta.env.VITE_TEST_HTTP_API_PORT ??
    8081
  );
}

// The test backend can't stream, so outside Tauri events are dropped.
export function channel<T>(
  onMessage: (message: T) => void,
): tauri.Channel<T> | undefined {
  return window.__TAURI_INTERNALS__
    ? new tauri.Channel<T>(onMessage)
    : undefined;
}

async function getDiff(rid: string, options: DiffOptions): Promise<Diff> {
  return withTestBackend(tauri.invoke, "get_diff", {
    rid,
    options,
  });
}

export const cachedGetDiff = cached(
  getDiff,
  (...[rid, options]) =>
    `get_diff:${rid}:${JSON.stringify(options, Object.keys(options).sort())}`,
  { max: 10_000 },
);

async function listCommits(
  rid: string,
  base: string,
  head: string,
): Promise<Commit[]> {
  return withTestBackend(tauri.invoke, "list_commits", { rid, base, head });
}

export const cachedListCommits = cached(
  listCommits,
  (...[rid, base, head]) => `list_commits:${rid}:${base}:${head}`,
  { max: 5_000 },
);

async function repoCommitCount(rid: string, head: string): Promise<number> {
  return withTestBackend(tauri.invoke, "repo_commit_count", { rid, head });
}

export const cachedRepoCommitCount = cached(
  repoCommitCount,
  (...[rid, head]) => `repo_commit_count:${rid}:${head}`,
  { max: 5_000 },
);

async function listJobs(rid: string, sha: string): Promise<Job[]> {
  return withTestBackend(tauri.invoke, "list_jobs", { rid, sha });
}

// Listing jobs scans every job COB in the repo, so it is slow (hundreds of ms
// to seconds). It is re-requested on every JobCob mount; caching by (rid, sha)
// collapses concurrent identical calls into one in-flight request and reuses
// the result across navigations. A short TTL keeps CI status reasonably fresh.
export const cachedListJobs = cached(
  listJobs,
  (...[rid, sha]) => `list_jobs:${rid}:${sha}`,
  { max: 200, ttl: 30_000 },
);

async function alias(nid: string): Promise<string | null> {
  return withTestBackend(tauri.invoke, "alias", { nid });
}

export const cachedAlias = cached(alias, (...[nid]) => `alias:${nid}`, {
  max: 5_000,
});

async function searchAliases(query: string): Promise<AliasSuggestion[]> {
  return withTestBackend(tauri.invoke, "search_aliases", {
    query: query === "" ? undefined : query,
  });
}

export const cachedSearchAliases = cached(
  searchAliases,
  (...[query]) => `search_aliases:${query}`,
  { max: 200, ttl: 60_000 },
);

const MENTION_CANDIDATE_TAKE = 200;

async function listIssueCandidates(rid: string): Promise<Issue[]> {
  const issues = await invoke<PaginatedQuery<Issue[]>>("list_issues", {
    rid,
    status: undefined,
    skip: 0,
    take: MENTION_CANDIDATE_TAKE,
  });

  return issues.content;
}

export const cachedListIssueCandidates = cached(
  listIssueCandidates,
  (...[rid]) => `issue_candidates:${rid}`,
  { max: 10, ttl: 30_000 },
);

async function listPatchCandidates(rid: string): Promise<Patch[]> {
  const patches = await invoke<PaginatedQuery<Patch[]>>("list_patches", {
    rid,
    status: undefined,
    skip: 0,
    take: MENTION_CANDIDATE_TAKE,
  });

  return patches.content;
}

export const cachedListPatchCandidates = cached(
  listPatchCandidates,
  (...[rid]) => `patch_candidates:${rid}`,
  { max: 10, ttl: 30_000 },
);

async function listReleaseCandidates(rid: string): Promise<Release[]> {
  const releases = await invoke<PaginatedQuery<Release[]>>("list_releases", {
    rid,
    filter: { scope: "trusted", showRedacted: false } satisfies ReleaseFilter,
    skip: 0,
    take: MENTION_CANDIDATE_TAKE,
  });

  return releases.content;
}

export const cachedListReleaseCandidates = cached(
  listReleaseCandidates,
  (...[rid]) => `release_candidates:${rid}`,
  { max: 10, ttl: 30_000 },
);

const missTtl = 5_000;

async function repoById(rid: string): Promise<RepoInfo | null> {
  return withTestBackend(tauri.invoke, "repo_by_id", { rid });
}

export const cachedRepoById = cached(
  repoById,
  (...[rid]) => `repo_by_id:${rid}`,
  { max: 200, ttl: 60_000 },
  missTtl,
);

async function issueById(rid: string, id: string): Promise<Issue | null> {
  return withTestBackend(tauri.invoke, "issue_by_id", { rid, id });
}

export const cachedIssueById = cached(
  issueById,
  (...[rid, id]) => `issue_by_id:${rid}:${id}`,
  { max: 200, ttl: 60_000 },
  missTtl,
);

async function patchById(rid: string, id: string): Promise<Patch | null> {
  return withTestBackend(tauri.invoke, "patch_by_id", { rid, id });
}

export const cachedPatchById = cached(
  patchById,
  (...[rid, id]) => `patch_by_id:${rid}:${id}`,
  { max: 200, ttl: 60_000 },
  missTtl,
);

async function releaseById(rid: string, id: string): Promise<Release | null> {
  return withTestBackend(tauri.invoke, "release_by_id", { rid, id });
}

export const cachedReleaseById = cached(
  releaseById,
  (...[rid, id]) => `release_by_id:${rid}:${id}`,
  { max: 200, ttl: 60_000 },
  missTtl,
);

async function repoCommit(rid: string, sha: string): Promise<Commit | null> {
  return withTestBackend(tauri.invoke, "repo_commit", { rid, sha });
}

export const cachedRepoCommit = cached(
  repoCommit,
  (...[rid, sha]) => `repo_commit:${rid}:${sha}`,
  { max: 200, ttl: 60_000 },
  missTtl,
);

async function repoCommitsByPrefix(
  rid: string,
  prefix: string,
): Promise<Commit[]> {
  return withTestBackend(tauri.invoke, "repo_commits_by_prefix", {
    rid,
    prefix,
  });
}

export const cachedRepoCommitsByPrefix = cached(
  repoCommitsByPrefix,
  (...[rid, prefix]) => `repo_commits_by_prefix:${rid}:${prefix}`,
  { max: 200, ttl: 60_000 },
);

async function repoSplitTreePath(
  rid: string,
  peer: string | undefined,
  path: string,
): Promise<TreePath> {
  return withTestBackend(tauri.invoke, "repo_split_tree_path", {
    rid,
    peer,
    path,
  });
}

export const cachedRepoSplitTreePath = cached(
  repoSplitTreePath,
  (...[rid, peer, path]) => `repo_split_tree_path:${rid}:${peer}:${path}`,
  { max: 50, ttl: 60_000 },
);

async function config(): Promise<Config> {
  return withTestBackend(tauri.invoke, "config", {});
}

// A single-entry cache collapses the many callers (e.g. every NodeId hover
// card) into one in-flight request. Clear it after writing the config.
export const cachedConfig = cached(config, () => "config", { max: 1 });

async function diffStats(
  rid: string,
  base: string,
  head: string,
): Promise<Stats> {
  return withTestBackend(tauri.invoke, "diff_stats", {
    rid,
    base,
    head,
  });
}

export const cachedDiffStats = cached(
  diffStats,
  (...[rid, base, head]) => `diff_stats:${rid}:${base}:${head}`,
  { max: 10_000 },
);

// Patch text is generated by libgit2 on the backend (byte-accurate `git diff`
// output) instead of being reconstructed from the structured diff model.
// Callers pass the same `unified` value the rendered diff used so the text
// matches what's on screen; `base` unset diffs `head` against its first
// parent; `path` limits output to a single file.
export async function getDiffText(
  rid: string,
  base: string | undefined,
  head: string,
  unified: number,
  path?: string,
): Promise<string> {
  return withTestBackend(tauri.invoke, "get_diff_text", {
    rid,
    base,
    head,
    unified,
    path,
  });
}

// Commits and patch revisions are immutable, so the same (base, head, unified,
// path) always yields the same patch text — safe to cache. Capped since a
// commit's full patch can be sizeable.
export const cachedGetDiffText = cached(
  getDiffText,
  (...[rid, base, head, unified, path]) =>
    `get_diff_text:${rid}:${base}:${head}:${unified}:${path}`,
  { max: 100 },
);

async function getCommitDiff(rid: string, sha: string): Promise<Diff> {
  return withTestBackend(tauri.invoke, "get_commit_diff", { rid, sha });
}

// Commits are immutable, so SHA is a perfect cache key. Cap entries since a
// Diff can be sizeable.
export const cachedGetCommitDiff = cached(
  getCommitDiff,
  (...[rid, sha]) => `get_commit_diff:${rid}:${sha}`,
  { max: 100 },
);

/**
 * Enumerating repos loads and verifies the identity doc of every repo in
 * storage, which takes ~100ms with many repos. The list rarely changes, so it
 * is cached with a short TTL; mutations that change it (adding, seeding,
 * unseeding) go through invalidateReposSummary().
 */
export const cachedListReposSummary = cached(
  (show: RepoListScope) =>
    invoke<RepoSummary[]>("list_repos_summary", { show }),
  show => `list_repos_summary:${show}`,
  { max: 2, ttl: 30_000 },
);

export function invalidateReposSummary(): void {
  cachedListReposSummary.clear();
}

export async function writeToClipboard(
  text: string,
  opts?: {
    label?: string;
  },
) {
  if (window.__TAURI_INTERNALS__) {
    await tauri.invoke("plugin:clipboard-manager|write_text", {
      label: opts?.label,
      text,
    });
  } else {
    await navigator.clipboard.writeText(text);
  }
}

export async function saveToDisk(fileName: string, text: string) {
  if (window.__TAURI_INTERNALS__) {
    // The backend opens the native save dialog and writes the file.
    await tauri.invoke("save_diff_to_disk", { name: fileName, content: text });
  } else {
    // No native dialog outside Tauri (test/http mode): trigger a download.
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

export { InvokeError };
