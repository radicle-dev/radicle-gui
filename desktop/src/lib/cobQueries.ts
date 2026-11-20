import type { Action as IssueAction } from "@bindings/cob/issue/Action";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Operation } from "@bindings/cob/Operation";
import type { Action as PatchAction } from "@bindings/cob/patch/Action";
import type { Patch } from "@bindings/cob/patch/Patch";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { ReleaseCounts } from "@bindings/cob/release/ReleaseCounts";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { Identity } from "@bindings/identity/Identity";
import type { RepoInfo } from "@bindings/repo/RepoInfo";
import type { RepoSummary } from "@bindings/repo/RepoSummary";
import type { Key } from "@radicle-gui/core/keys";
import type { QueryOptions } from "@radicle-gui/ui/lib/query.svelte";

import { isJobsKey, keys } from "@radicle-gui/core/keys";
import { get } from "svelte/store";

import { nodeEvents } from "@app/lib/events";
import { invoke } from "@app/lib/invoke";
import { queryClient } from "@app/lib/query";

export interface RepoList {
  repos: RepoSummary[];
  seededNotReplicated: string[];
}

export function repoList(scope: string): QueryOptions<RepoList> {
  return {
    queryKey: keys.repoList(scope),
    queryFn: async () => {
      const [repos, seededNotReplicated] = await Promise.all([
        invoke<RepoSummary[]>("list_repos_summary", { show: scope }),
        invoke<string[]>("seeded_not_replicated"),
      ]);
      return { repos, seededNotReplicated };
    },
  };
}

export function releaseCounts(rid: string): QueryOptions<ReleaseCounts> {
  return {
    queryKey: keys.releaseCount(rid),
    queryFn: () => invoke<ReleaseCounts>("release_counts", { rid }),
  };
}

export function repoInfo(rid: string): QueryOptions<RepoInfo> {
  return {
    queryKey: keys.repoInfo(rid),
    queryFn: () => invoke<RepoInfo>("repo_by_id", { rid }),
  };
}

export function identity(rid: string): QueryOptions<Identity> {
  return {
    queryKey: keys.identity(rid),
    queryFn: () => invoke<Identity>("identity_by_repo", { rid }),
  };
}

// `issue` is undefined once the issue is deleted.
export interface IssueDetail {
  issue: Issue | undefined;
  activity: Operation<IssueAction>[];
  threads: Thread[];
}

export function issueDetail(
  rid: string,
  id: string,
): QueryOptions<IssueDetail> {
  return {
    queryKey: keys.issue(rid, id),
    queryFn: async () => {
      const issue =
        (await invoke<Issue | null>("issue_by_id", { rid, id })) ?? undefined;
      // A deleted issue has no operations left to read.
      if (!issue) return { issue, activity: [], threads: [] };
      const [activity, threads] = await Promise.all([
        invoke<Operation<IssueAction>[]>("activity_by_issue", { rid, id }),
        invoke<Thread[] | null>("comment_threads_by_issue_id", { rid, id }),
      ]);
      return { issue, activity, threads: threads ?? [] };
    },
  };
}

// `patch` is undefined once the patch is deleted.
export interface PatchDetail {
  patch: Patch | undefined;
  revisions: Revision[];
  activity: Operation<PatchAction>[];
}

export function patchDetail(
  rid: string,
  id: string,
): QueryOptions<PatchDetail> {
  return {
    queryKey: keys.patch(rid, id),
    queryFn: async () => {
      const patch =
        (await invoke<Patch | null>("patch_by_id", { rid, id })) ?? undefined;
      // A deleted patch has no operations left to read.
      if (!patch) return { patch, revisions: [], activity: [] };
      const [revisions, activity] = await Promise.all([
        invoke<Revision[] | null>("revisions_by_patch", { rid, id }),
        invoke<Operation<PatchAction>[]>("activity_by_patch", { rid, id }),
      ]);
      return { patch, revisions: revisions ?? [], activity };
    },
  };
}

// Route loaders load through the cache, so that the view they load starts from
// the cache's data and shares it. While the node runs, its events keep the
// cache current, so a cached entry is reused unless it was invalidated.
// Without its events, loaders always refetch.
export function load<T>(options: QueryOptions<T>): Promise<T> {
  return queryClient.fetchQuery({
    ...options,
    staleTime: get(nodeEvents) ? Infinity : 0,
  });
}

let currentRid: string | undefined;

// Entering a repository refetches its data, so that leaving it and coming back
// recovers from any event the cache missed. Job lists are left out: they only
// change through the node's events, and listing them is slow.
export function enterRepo(rid: string | undefined): void {
  if (rid === currentRid) return;
  currentRid = rid;
  if (rid !== undefined) {
    void queryClient.invalidateQueries({
      queryKey: keys.repo(rid),
      predicate: query => !isJobsKey(query.queryKey as Key),
      refetchType: "none",
    });
  }
}
