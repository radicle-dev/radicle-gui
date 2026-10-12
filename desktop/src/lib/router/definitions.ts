import type { LoadedRepoRoute, RepoRoute } from "@app/views/repo/router";
import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";
import type { Config } from "@bindings/config/Config";
import type { RepoSummary } from "@bindings/repo/RepoSummary";

import {
  loadIdentity,
  loadIssue,
  loadIssues,
  loadPatch,
  loadPatches,
  loadRelease,
  loadReleases,
  loadRepoCommit,
  loadRepoCommits,
  loadRepoHome,
} from "@app/views/repo/router";

import { cachedListReposSummary, invoke } from "@app/lib/invoke";
import { repoListScope } from "@app/lib/repoListScope";

interface BootingRoute {
  resource: "booting";
}

interface InboxRoute {
  resource: "inbox";
}

interface GuideRoute {
  resource: "guide";
}

export interface SidebarData {
  config: Config;
  repos: RepoSummary[];
  notificationCount: number;
  seededNotReplicated: string[];
}

export interface LoadedInboxRoute {
  resource: "inbox";
  params: {
    sidebarData: SidebarData;
    notificationsByRepo: NotificationsByRepo[];
  };
}

export interface LoadedGuideRoute {
  resource: "guide";
  params: { sidebarData: SidebarData };
}

export type Route = BootingRoute | RepoRoute | InboxRoute | GuideRoute;
export type LoadedRoute =
  BootingRoute | LoadedRepoRoute | LoadedInboxRoute | LoadedGuideRoute;

export function isLoadedRepoRoute(
  route: LoadedRoute,
): route is LoadedRepoRoute {
  return (
    route.resource === "repo.home" ||
    route.resource === "repo.commits" ||
    route.resource === "repo.commit" ||
    route.resource === "repo.identity" ||
    route.resource === "repo.issue" ||
    route.resource === "repo.issues" ||
    route.resource === "repo.patch" ||
    route.resource === "repo.patches" ||
    route.resource === "repo.release" ||
    route.resource === "repo.releases"
  );
}

export async function loadSidebarData(): Promise<SidebarData> {
  const [config, repos, notificationCount, seededNotReplicated] =
    await Promise.all([
      invoke<Config>("config"),
      cachedListReposSummary(repoListScope.value),
      invoke<number>("notification_count"),
      invoke<string[]>("seeded_not_replicated"),
    ]);
  return { config, repos, notificationCount, seededNotReplicated };
}

export async function loadGuide(): Promise<LoadedGuideRoute> {
  const sidebarData = await loadSidebarData();
  return { resource: "guide", params: { sidebarData } };
}

export async function loadInbox(): Promise<LoadedInboxRoute> {
  const [sidebarData, notificationsByRepo] = await Promise.all([
    loadSidebarData(),
    invoke<NotificationsByRepo[]>("list_notifications", {
      params: { take: 100 },
    }),
  ]);
  return {
    resource: "inbox",
    params: { sidebarData, notificationsByRepo },
  };
}

export async function loadRoute(
  route: Route,
  previousLoaded: LoadedRoute,
): Promise<LoadedRoute> {
  if (route.resource === "inbox") {
    return loadInbox();
  } else if (route.resource === "guide") {
    return loadGuide();
  } else if (route.resource === "repo.home") {
    return loadRepoHome(route);
  } else if (route.resource === "repo.commits") {
    return loadRepoCommits(route);
  } else if (route.resource === "repo.commit") {
    return loadRepoCommit(route);
  } else if (route.resource === "repo.identity") {
    return loadIdentity(route);
  } else if (route.resource === "repo.issue") {
    return loadIssue(route);
  } else if (route.resource === "repo.issues") {
    return loadIssues(route);
  } else if (route.resource === "repo.patch") {
    return loadPatch(route, previousLoaded);
  } else if (route.resource === "repo.patches") {
    return loadPatches(route);
  } else if (route.resource === "repo.release") {
    return loadRelease(route);
  } else if (route.resource === "repo.releases") {
    return loadReleases(route);
  }
  return route;
}
