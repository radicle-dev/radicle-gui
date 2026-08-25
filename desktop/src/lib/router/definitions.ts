import type { LoadedRepoRoute, RepoRoute } from "@app/views/repo/router";
import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";
import type { Config } from "@bindings/config/Config";
import type { ActivityItem } from "@bindings/contribution/ActivityItem";
import type { ContributionDay } from "@bindings/contribution/ContributionDay";
import type { RepoContribution } from "@bindings/contribution/RepoContribution";
import type { RepoInfo } from "@bindings/repo/RepoInfo";
import type { RepoSummary } from "@bindings/repo/RepoSummary";
import type { User } from "@bindings/user/User";

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
import { publicKeyFromDid } from "@app/lib/utils";

interface BootingRoute {
  resource: "booting";
}

interface InboxRoute {
  resource: "inbox";
}

interface GuideRoute {
  resource: "guide";
}

export interface UserRoute {
  resource: "user";
  /** The user's DID, in full `did:key:z…` form. */
  did: string;
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

/// A repo the user has some relationship to, with what they did there.
export interface UserRepo {
  repo: RepoInfo;
  isDelegate: boolean;
  patchesAuthored: number;
  issuesAuthored: number;
  /** When this person last contributed here; unset if they never have. */
  lastContribution: number | undefined;
}

export interface LoadedUserRoute {
  resource: "user";
  params: {
    sidebarData: SidebarData;
    user: User;
    repos: UserRepo[];
    activity: ActivityItem[];
    calendar: ContributionDay[];
  };
}

export type Route =
  BootingRoute | RepoRoute | InboxRoute | GuideRoute | UserRoute;
export type LoadedRoute =
  | BootingRoute
  | LoadedRepoRoute
  | LoadedInboxRoute
  | LoadedGuideRoute
  | LoadedUserRoute;

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

// A profile's feed is the main thing worth scrolling on the page, so it opens
// with a deep page rather than a teaser and grows from there.
export const USER_ACTIVITY_TAKE = 50;

export async function loadUser(route: UserRoute): Promise<LoadedUserRoute> {
  const [sidebarData, user, repos, contributions, activity, calendar] =
    await Promise.all([
      loadSidebarData(),
      invoke<User>("user", { nid: publicKeyFromDid(route.did) }),
      invoke<RepoInfo[]>("list_repos", { show: "all" }),
      invoke<RepoContribution[]>("user_contributions", { did: route.did }),
      invoke<ActivityItem[]>("user_activity", {
        did: route.did,
        limit: USER_ACTIVITY_TAKE,
      }),
      invoke<ContributionDay[]>("user_calendar", { did: route.did }),
    ]);

  const byRid = new Map(contributions.map(c => [c.rid, c]));

  // A repo belongs on the profile when the user delegates it or has opened
  // something in it. `list_repos` already carries each repo's delegates, so
  // neither half needs its own repo query.
  const userRepos = repos.flatMap(repo => {
    const isDelegate = repo.delegates.some(
      delegate => delegate.did === route.did,
    );
    const contribution = byRid.get(repo.rid);
    if (!isDelegate && !contribution) return [];
    return [
      {
        repo,
        isDelegate,
        patchesAuthored: contribution?.patchesAuthored ?? 0,
        issuesAuthored: contribution?.issuesAuthored ?? 0,
        lastContribution: contribution?.lastContribution,
      },
    ];
  });

  return {
    resource: "user",
    params: { sidebarData, user, repos: userRepos, activity, calendar },
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
  } else if (route.resource === "user") {
    return loadUser(route);
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
