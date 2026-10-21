import type { BaseUrl, Repo, RepoListQuery } from "@http-client";

import { loadRepoActivity, type WeeklyActivity } from "@app/lib/commit";
import { HttpdClient } from "@http-client";

export interface RepoInfo {
  repo: Repo;
  baseUrl: BaseUrl;
  activity: Promise<WeeklyActivity[]>;
}

export async function fetchRepoInfos(
  baseUrl: BaseUrl,
  query?: RepoListQuery,
  delegate?: string,
  activitySignal?: AbortSignal,
): Promise<RepoInfo[]> {
  const api = new HttpdClient(baseUrl);
  let repos: Repo[];

  if (delegate) {
    repos = await api.repo.getByDelegate(delegate, query);
  } else {
    repos = await api.repo.getAll(query);
  }

  return repos
    .filter(r => Boolean(r.payloads["xyz.radicle.project"]))
    .map(repo => ({
      repo,
      baseUrl,
      activity: loadRepoActivity(repo.rid, baseUrl, activitySignal).catch(e => {
        if (import.meta.env.DEV && (e as Error)?.name !== "AbortError") {
          console.warn("loadRepoActivity failed for", repo.rid, e);
        }
        return [];
      }),
    }));
}

export async function sortRepoInfosByActivity(
  repos: RepoInfo[],
): Promise<RepoInfo[]> {
  const withActivity = await Promise.all(
    repos.map(async r => ({ info: r, activity: await r.activity })),
  );
  return withActivity
    .sort((a, b) => {
      if (a.activity.length === 0 && b.activity.length === 0) return 0;
      if (a.activity.length === 0) return 1;
      if (b.activity.length === 0) return -1;
      return b.activity[0].time - a.activity[0].time;
    })
    .map(x => x.info);
}
