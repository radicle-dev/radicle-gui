import type { LoadedRepoRoute, RepoRoute } from "@app/views/repo/router";
import type { ActorInfo } from "@bindings/actor/ActorInfo";
import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";
import type { Config } from "@bindings/config/Config";
import type { RepoSummary } from "@bindings/repo/RepoSummary";

import {
  loadBoard,
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

import {
  cachedActor,
  cachedListReposSummary,
  invoke,
  InvokeError,
} from "@app/lib/invoke";
import { labs } from "@app/lib/labs";
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

export type ProfileTab = "profile" | "keys";

interface ProfileRoute {
  resource: "profile";
  tab: ProfileTab;
}

export interface SidebarData {
  config: Config;
  repos: RepoSummary[];
  notificationCount: number;
  seededNotReplicated: string[];
  actor: ActorInfo | null;
  /** Why the actor could not be loaded, with the backend's error code. */
  actorError?: { code: string; message: string };
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

export interface LoadedProfileRoute {
  resource: "profile";
  params: { sidebarData: SidebarData; tab: ProfileTab };
}

export type Route =
  BootingRoute | RepoRoute | InboxRoute | GuideRoute | ProfileRoute;
export type LoadedRoute =
  | BootingRoute
  | LoadedRepoRoute
  | LoadedInboxRoute
  | LoadedGuideRoute
  | LoadedProfileRoute;

export function isLoadedRepoRoute(
  route: LoadedRoute,
): route is LoadedRepoRoute {
  return (
    route.resource === "repo.board" ||
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
  const [config, repos, notificationCount, seededNotReplicated, lookup] =
    await Promise.all([
      invoke<Config>("config"),
      cachedListReposSummary(repoListScope.value),
      invoke<number>("notification_count"),
      invoke<string[]>("seeded_not_replicated"),
      labs.actorRepos ? loadActor() : { actor: null },
    ]);
  return { config, repos, notificationCount, seededNotReplicated, ...lookup };
}

// Whatever goes wrong with the actor is shown on the profile page, never
// allowed to stop a route from loading.
async function loadActor(): Promise<Pick<SidebarData, "actor" | "actorError">> {
  try {
    return { actor: await cachedActor() };
  } catch (error) {
    if (error instanceof InvokeError) {
      return {
        actor: null,
        actorError: { code: error.code, message: error.message },
      };
    }
    throw error;
  }
}

export async function loadGuide(): Promise<LoadedGuideRoute> {
  const sidebarData = await loadSidebarData();
  return { resource: "guide", params: { sidebarData } };
}

export async function loadProfile(
  route: ProfileRoute,
): Promise<LoadedProfileRoute> {
  const sidebarData = await loadSidebarData();
  return { resource: "profile", params: { sidebarData, tab: route.tab } };
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
  } else if (route.resource === "repo.board") {
    return loadBoard(route);
  } else if (route.resource === "profile") {
    return loadProfile(route);
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
