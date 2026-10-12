import type { Action as IssueAction } from "@bindings/cob/issue/Action";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Operation } from "@bindings/cob/Operation";
import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
import type { Action as PatchAction } from "@bindings/cob/patch/Action";
import type { Patch } from "@bindings/cob/patch/Patch";
import type { Review } from "@bindings/cob/patch/Review";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { Release } from "@bindings/cob/release/Release";
import type { ReleaseCounts } from "@bindings/cob/release/ReleaseCounts";
import type { ReleaseFilter } from "@bindings/cob/release/ReleaseFilter";
import type { ReleaseScope } from "@bindings/cob/release/ReleaseScope";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { Config } from "@bindings/config/Config";
import type { Diff } from "@bindings/diff/Diff";
import type { Identity } from "@bindings/identity/Identity";
import type { Commit } from "@bindings/repo/Commit";
import type { Readme } from "@bindings/repo/Readme";
import type { RepoInfo } from "@bindings/repo/RepoInfo";
import type { Tree } from "@bindings/source/Tree";

import {
  cachedGetCommitDiff,
  cachedGetDiffText,
  invoke,
} from "@app/lib/invoke";
import { releaseListScope } from "@app/lib/releases";
import type { LoadedRoute, SidebarData } from "@app/lib/router/definitions";
import { loadSidebarData } from "@app/lib/router/definitions";
import { unreachable } from "@app/lib/utils";

export type IssueStatus = "all" | Issue["state"]["status"];

export const DEFAULT_TAKE = 20;
export const COMMITS_PAGE_SIZE = 300;
export const RELEASES_PER_PAGE = 30;

export interface RepoHomeRoute {
  resource: "repo.home";
  rid: string;
  peer?: string;
  revision?: string;
  // The file shown in the source view. Trailing URL segments are already
  // consumed by `revision`, so this travels as a query parameter.
  path?: string;
}

export interface RepoCommitsRoute {
  resource: "repo.commits";
  rid: string;
  peer?: string;
  revision?: string;
}

export type SourceBaseRoute = RepoHomeRoute | RepoCommitsRoute;

export interface RepoCommitRoute {
  resource: "repo.commit";
  rid: string;
  commit: string;
}

export interface RepoIdentityRoute {
  resource: "repo.identity";
  rid: string;
}

export interface LoadedRepoIdentityRoute {
  resource: "repo.identity";
  params: {
    repo: RepoInfo;
    identity: Identity;
    sidebarData: SidebarData;
  };
}

export interface RepoIssueRoute {
  resource: "repo.issue";
  rid: string;
  issue: string;
  status: IssueStatus;
}

export interface LoadedRepoHomeRoute {
  resource: "repo.home";
  params: {
    repo: RepoInfo;
    peer?: string;
    revision?: string;
    oid: string;
    commit: Commit;
    tree: Tree;
    readme: Readme | null;
    path?: string;
    sidebarData: SidebarData;
  };
}

export interface LoadedRepoCommitsRoute {
  resource: "repo.commits";
  params: {
    repo: RepoInfo;
    peer?: string;
    revision?: string;
    oid: string;
    commit: Commit;
    commits: PaginatedQuery<Commit[]>;
    sidebarData: SidebarData;
  };
}

export interface LoadedRepoCommitRoute {
  resource: "repo.commit";
  params: {
    repo: RepoInfo;
    commit: Commit;
    diff: Diff;
    patch: string;
    sidebarData: SidebarData;
  };
}

export interface LoadedRepoIssueRoute {
  resource: "repo.issue";
  params: {
    repo: RepoInfo;
    config: Config;
    issue: Issue;
    activity: Operation<IssueAction>[];
    threads: Thread[];
    sidebarData: SidebarData;
  };
}

export interface RepoIssuesRoute {
  resource: "repo.issues";
  rid: string;
  status: IssueStatus;
}

export interface LoadedRepoIssuesRoute {
  resource: "repo.issues";
  params: {
    repo: RepoInfo;
    issues: PaginatedQuery<Issue[]>;
    status: IssueStatus;
    sidebarData: SidebarData;
  };
}

export type PatchStatus = Patch["state"]["status"];

export type PatchView = "activity" | "changes";

export interface RepoPatchRoute {
  resource: "repo.patch";
  rid: string;
  patch: string;
  status: PatchStatus | undefined;
  reviewId: string | undefined;
  view?: PatchView;
}

export interface LoadedRepoPatchRoute {
  resource: "repo.patch";
  params: {
    repo: RepoInfo;
    config: Config;
    patch: Patch;
    patches: PaginatedQuery<Patch[]>;
    status: PatchStatus | undefined;
    view?: PatchView;
    review: Review | undefined;
    revisions: Revision[];
    activity: Operation<PatchAction>[];
    sidebarData: SidebarData;
  };
}

export interface RepoPatchesRoute {
  resource: "repo.patches";
  rid: string;
  status: PatchStatus | undefined;
}

export interface LoadedRepoPatchesRoute {
  resource: "repo.patches";
  params: {
    repo: RepoInfo;
    patches: PaginatedQuery<Patch[]>;
    status: PatchStatus | undefined;
    sidebarData: SidebarData;
  };
}

export interface RepoReleasesRoute {
  resource: "repo.releases";
  rid: string;
  scope?: ReleaseScope;
}

export interface LoadedRepoReleasesRoute {
  resource: "repo.releases";
  params: {
    repo: RepoInfo;
    releases: PaginatedQuery<Release[]>;
    releaseCounts: ReleaseCounts;
    scope: ReleaseScope;
    showFilters: boolean;
    sidebarData: SidebarData;
  };
}

export interface RepoReleaseRoute {
  resource: "repo.release";
  rid: string;
  release: string;
  // The release list the user came from, shown in the breadcrumb.
  scope?: ReleaseScope;
  artifactScope?: ReleaseScope;
}

export interface LoadedRepoReleaseRoute {
  resource: "repo.release";
  params: {
    repo: RepoInfo;
    config: Config;
    release: Release;
    scope?: ReleaseScope;
    artifactScope?: ReleaseScope;
    sidebarData: SidebarData;
  };
}

export type RepoRoute =
  | RepoHomeRoute
  | RepoCommitsRoute
  | RepoCommitRoute
  | RepoIdentityRoute
  | RepoIssueRoute
  | RepoIssuesRoute
  | RepoPatchRoute
  | RepoPatchesRoute
  | RepoReleaseRoute
  | RepoReleasesRoute;
export type LoadedRepoRoute =
  | LoadedRepoHomeRoute
  | LoadedRepoCommitsRoute
  | LoadedRepoCommitRoute
  | LoadedRepoIdentityRoute
  | LoadedRepoIssueRoute
  | LoadedRepoIssuesRoute
  | LoadedRepoPatchRoute
  | LoadedRepoPatchesRoute
  | LoadedRepoReleaseRoute
  | LoadedRepoReleasesRoute;

export async function loadPatch(
  route: RepoPatchRoute,
  previousLoaded?: LoadedRoute,
): Promise<LoadedRepoPatchRoute | LoadedRepoPatchesRoute> {
  // Switching tab (view) or review on the same patch shouldn't refetch the
  // repo-wide data, so the sidebar and patch list are reused when we stay on
  // the same patch. The patch itself, its revisions and its activity are
  // always refetched: they change on every comment, review and edit, and a
  // reused copy resurrects pre-mutation state when the tab changes.
  const reuse =
    previousLoaded?.resource === "repo.patch" &&
    previousLoaded.params.repo.rid === route.rid &&
    previousLoaded.params.patch.id === route.patch &&
    previousLoaded.params.status === route.status
      ? previousLoaded.params
      : undefined;

  const [[sidebarData, repo, patches], [patch, revisions, activity]] =
    await Promise.all([
      reuse
        ? ([reuse.sidebarData, reuse.repo, reuse.patches] as const)
        : Promise.all([
            loadSidebarData(),
            invoke<RepoInfo>("repo_by_id", {
              rid: route.rid,
            }),
            invoke<PaginatedQuery<Patch[]>>("list_patches", {
              rid: route.rid,
              status: route.status,
              take: DEFAULT_TAKE,
            }),
          ] as const),
      Promise.all([
        invoke<Patch | null>("patch_by_id", {
          rid: route.rid,
          id: route.patch,
        }),
        invoke<Revision[]>("revisions_by_patch", {
          rid: route.rid,
          id: route.patch,
        }),
        invoke<Operation<PatchAction>[]>("activity_by_patch", {
          rid: route.rid,
          id: route.patch,
        }),
      ] as const),
    ]);

  // The patch may have been deleted (removed here, on another device, or a
  // stale link); fall back to the patch list instead of crashing.
  if (!patch) {
    return loadPatches({
      resource: "repo.patches",
      rid: route.rid,
      status: route.status,
    });
  }

  const config = sidebarData.config;

  const review = revisions
    .flatMap(r => r.reviews || [])
    .find(review => review.id === route.reviewId);

  return {
    resource: "repo.patch",
    params: {
      repo,
      config,
      patch,
      patches,
      revisions,
      status: route.status,
      view: route.view,
      review,
      activity,
      sidebarData,
    },
  };
}

export async function loadPatches(
  route: RepoPatchesRoute,
): Promise<LoadedRepoPatchesRoute> {
  const [sidebarData, repo, patches] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    invoke<PaginatedQuery<Patch[]>>("list_patches", {
      rid: route.rid,
      status: route.status,
      take: DEFAULT_TAKE,
    }),
  ]);

  return {
    resource: "repo.patches",
    params: { sidebarData, repo, patches, status: route.status },
  };
}

interface SourceContext {
  sidebarData: SidebarData;
  repo: RepoInfo;
  peer?: string;
  revision?: string;
  oid: string;
  commit: Commit;
}

// Revision resolution happens in the backend: content commands accept
// (peer, revision) directly, so everything loads in parallel. The resolved
// OID is read off the commit response. Repo refs for the peer selector are
// expensive to enumerate and are fetched lazily by the SourceHeader after
// render instead of blocking navigation here.
async function loadSourceContext(route: {
  rid: string;
  peer?: string;
  revision?: string;
}): Promise<SourceContext> {
  const [sidebarData, repo, commit] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    invoke<Commit>("repo_commit", {
      rid: route.rid,
      peer: route.peer,
      revision: route.revision,
    }),
  ]);

  return {
    sidebarData,
    repo,
    peer: route.peer,
    revision: route.revision,
    oid: commit.id,
    commit,
  };
}

export async function loadRepoHome(
  route: RepoHomeRoute,
): Promise<LoadedRepoHomeRoute> {
  const [context, readme, tree] = await Promise.all([
    loadSourceContext(route),
    invoke<Readme | null>("repo_readme", {
      rid: route.rid,
      peer: route.peer,
      revision: route.revision,
    }),
    invoke<Tree>("repo_tree", {
      rid: route.rid,
      path: "",
      peer: route.peer,
      revision: route.revision,
    }),
  ]);

  return {
    resource: "repo.home",
    params: {
      ...context,
      readme,
      tree,
      path: route.path,
    },
  };
}

export async function loadRepoCommits(
  route: RepoCommitsRoute,
): Promise<LoadedRepoCommitsRoute> {
  const [context, commits] = await Promise.all([
    loadSourceContext(route),
    invoke<PaginatedQuery<Commit[]>>("list_repo_commits", {
      rid: route.rid,
      peer: route.peer,
      revision: route.revision,
      skip: 0,
      take: COMMITS_PAGE_SIZE,
    }),
  ]);

  return {
    resource: "repo.commits",
    params: {
      ...context,
      commits,
    },
  };
}

export async function loadRepoCommit(
  route: RepoCommitRoute,
): Promise<LoadedRepoCommitRoute> {
  const [sidebarData, repo, commit, diff, patch] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    invoke<Commit>("repo_commit", {
      rid: route.rid,
      sha: route.commit,
    }),
    // The diff manifest drives the file tree, per-file binary/empty notes and
    // status labels, and the stats badge; the diff itself is rendered from the
    // patch text below.
    cachedGetCommitDiff(route.rid, route.commit),
    // Patch text that feeds the rendered diff; fetched in parallel so it isn't a
    // serial round-trip, and cached since a commit's patch is immutable.
    cachedGetDiffText(route.rid, undefined, route.commit, 3),
  ]);

  return {
    resource: "repo.commit",
    params: { sidebarData, repo, commit, diff, patch },
  };
}

export async function loadIdentity(
  route: RepoIdentityRoute,
): Promise<LoadedRepoIdentityRoute> {
  const [sidebarData, repo, identity] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    invoke<Identity>("identity_by_repo", {
      rid: route.rid,
    }),
  ]);

  return {
    resource: "repo.identity",
    params: { sidebarData, repo, identity },
  };
}

export async function loadIssue(
  route: RepoIssueRoute,
): Promise<LoadedRepoIssueRoute> {
  const [sidebarData, repo, issue, activity, threads] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    invoke<Issue>("issue_by_id", {
      rid: route.rid,
      id: route.issue,
    }),
    invoke<Operation<IssueAction>[]>("activity_by_issue", {
      rid: route.rid,
      id: route.issue,
    }),
    invoke<Thread[]>("comment_threads_by_issue_id", {
      rid: route.rid,
      id: route.issue,
    }),
  ]);

  return {
    resource: "repo.issue",
    params: {
      sidebarData,
      repo,
      config: sidebarData.config,
      issue,
      activity,
      threads,
    },
  };
}

export async function loadIssues(
  route: RepoIssuesRoute,
): Promise<LoadedRepoIssuesRoute> {
  const [sidebarData, repo, issues] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    invoke<PaginatedQuery<Issue[]>>("list_issues", {
      rid: route.rid,
      status: route.status,
      take: DEFAULT_TAKE,
    }),
  ]);

  return {
    resource: "repo.issues",
    params: { sidebarData, repo, issues, status: route.status },
  };
}

export function listReleases(
  rid: string,
  scope: ReleaseScope,
  skip: number,
  // Undefined lists every release.
  take: number | undefined,
) {
  return invoke<PaginatedQuery<Release[]>>("list_releases", {
    rid,
    filter: { scope, showRedacted: false } satisfies ReleaseFilter,
    skip,
    take,
  });
}

export async function loadReleases(
  route: RepoReleasesRoute,
): Promise<LoadedRepoReleasesRoute> {
  let scope = route.scope ?? "trusted";
  const [sidebarData, repo, firstPage, releaseCounts] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    listReleases(route.rid, scope, 0, RELEASES_PER_PAGE),
    invoke<ReleaseCounts>("release_counts", {
      rid: route.rid,
    }),
  ]);
  let releases = firstPage;

  const fallback = releaseListScope(route.scope, releaseCounts);
  if (fallback !== scope) {
    scope = fallback;
    releases = await listReleases(route.rid, scope, 0, RELEASES_PER_PAGE);
  }

  const showFilters = releaseCounts.delegate > 0 && releaseCounts.other > 0;

  return {
    resource: "repo.releases",
    params: {
      sidebarData,
      repo,
      releases,
      releaseCounts,
      scope,
      showFilters,
    },
  };
}

export async function loadRelease(
  route: RepoReleaseRoute,
): Promise<LoadedRepoReleaseRoute | LoadedRepoReleasesRoute> {
  const [sidebarData, repo, release] = await Promise.all([
    loadSidebarData(),
    invoke<RepoInfo>("repo_by_id", {
      rid: route.rid,
    }),
    invoke<Release | null>("release_by_id", {
      rid: route.rid,
      id: route.release,
    }),
  ]);

  // A redacted or stale release falls back to the list.
  if (!release) {
    return loadReleases({
      resource: "repo.releases",
      rid: route.rid,
      scope: route.scope,
    });
  }

  return {
    resource: "repo.release",
    params: {
      sidebarData,
      repo,
      config: sidebarData.config,
      release,
      scope: route.scope,
      artifactScope: route.artifactScope,
    },
  };
}

export function repoRouteToPath(route: RepoRoute): string {
  const pathSegments = ["/repos", route.rid];
  const searchParams = new URLSearchParams();

  if (route.resource === "repo.home") {
    const segments = [...pathSegments, "home"];
    if (route.peer !== undefined) {
      segments.push("remotes", route.peer);
    }
    if (route.revision !== undefined) {
      segments.push(route.revision);
    }
    if (route.path) {
      searchParams.set("path", route.path);
      return `${segments.join("/")}?${searchParams}`;
    }
    return segments.join("/");
  } else if (route.resource === "repo.commits") {
    const segments = [...pathSegments, "commits"];
    if (route.peer !== undefined) {
      segments.push("remotes", route.peer);
    }
    if (route.revision !== undefined) {
      segments.push(route.revision);
    }
    return segments.join("/");
  } else if (route.resource === "repo.commit") {
    return [...pathSegments, "commits", route.commit].join("/");
  } else if (route.resource === "repo.identity") {
    return [...pathSegments, "identity"].join("/");
  } else if (route.resource === "repo.issue") {
    let url = [...pathSegments, "issues", route.issue].join("/");
    searchParams.set("status", route.status);
    url += `?${searchParams}`;
    return url;
  } else if (route.resource === "repo.issues") {
    let url = [...pathSegments, "issues"].join("/");
    searchParams.set("status", route.status);
    url += `?${searchParams}`;
    return url;
  } else if (route.resource === "repo.patch") {
    let url = [...pathSegments, "patches", route.patch].join("/");
    if (route.status) {
      searchParams.set("status", route.status);
    }
    if (route.reviewId) {
      searchParams.set("review", route.reviewId);
    }
    if (route.view) {
      searchParams.set("view", route.view);
    }
    if (searchParams.size > 0) {
      url += `?${searchParams}`;
    }
    return url;
  } else if (route.resource === "repo.patches") {
    let url = [...pathSegments, "patches"].join("/");
    if (route.status) {
      searchParams.set("status", route.status);
      url += `?${searchParams}`;
    }
    return url;
  } else if (route.resource === "repo.release") {
    let url = [...pathSegments, "releases", route.release].join("/");
    if (route.scope) {
      searchParams.set("scope", route.scope);
    }
    if (route.artifactScope === "untrusted") {
      searchParams.set("artifacts", "untrusted");
    }
    if (searchParams.size > 0) {
      url += `?${searchParams}`;
    }
    return url;
  } else if (route.resource === "repo.releases") {
    let url = [...pathSegments, "releases"].join("/");
    if (route.scope) {
      searchParams.set("scope", route.scope);
      url += `?${searchParams}`;
    }
    return url;
  } else {
    return unreachable(route);
  }
}

function parseReleaseScope(value: string | null): ReleaseScope | undefined {
  return value === "trusted" || value === "untrusted" ? value : undefined;
}

export function repoUrlToRoute(
  segments: string[],
  searchParams: URLSearchParams,
): RepoRoute | null {
  const rid = segments.shift();
  const resource = segments.shift();

  if (rid) {
    if (resource === "home") {
      let peer: string | undefined;
      if (segments[0] === "remotes") {
        segments.shift();
        peer = segments.shift();
      }
      const revision = segments.length > 0 ? segments.join("/") : undefined;
      const path = searchParams.get("path") ?? undefined;
      return { resource: "repo.home", rid, peer, revision, path };
    } else if (resource === "commits") {
      let peer: string | undefined;
      if (segments[0] === "remotes") {
        segments.shift();
        peer = segments.shift();
      }
      if (segments.length === 0) {
        return { resource: "repo.commits", rid, peer };
      }
      if (
        peer === undefined &&
        segments.length === 1 &&
        /^[0-9a-f]{40}$/.test(segments[0])
      ) {
        return { resource: "repo.commit", rid, commit: segments[0] };
      }
      return {
        resource: "repo.commits",
        rid,
        peer,
        revision: segments.join("/"),
      };
    } else if (resource === "identity") {
      return { resource: "repo.identity", rid };
    } else if (resource === "issues") {
      const idOrAction = segments.shift();
      if (idOrAction) {
        const status = (searchParams.get("status") ?? "all") as IssueStatus;
        if (idOrAction !== "create") {
          return {
            resource: "repo.issue",
            rid,
            issue: idOrAction,
            status,
          };
        }
        return null;
      } else {
        const status = searchParams.get("status");
        if (status === "open" || status === "closed") {
          return { resource: "repo.issues", rid, status };
        } else {
          return { resource: "repo.issues", rid, status: "all" };
        }
      }
    } else if (resource === "patches") {
      const id = segments.shift();
      const status = (searchParams.get("status") ?? undefined) as
        PatchStatus | undefined;
      const reviewId = searchParams.get("review") ?? undefined;
      const viewParam = searchParams.get("view");
      const view: PatchView | undefined =
        viewParam === "activity" || viewParam === "changes"
          ? viewParam
          : undefined;
      if (id) {
        return {
          resource: "repo.patch",
          rid,
          patch: id,
          status,
          reviewId,
          view,
        };
      } else {
        return { resource: "repo.patches", rid, status };
      }
    } else if (resource === "releases") {
      const id = segments.shift();
      const scope = parseReleaseScope(searchParams.get("scope"));
      if (id) {
        const artifactScope =
          searchParams.get("artifacts") === "untrusted"
            ? "untrusted"
            : undefined;
        return {
          resource: "repo.release",
          rid,
          release: id,
          scope,
          artifactScope,
        };
      } else {
        return { resource: "repo.releases", rid, scope };
      }
    } else {
      return null;
    }
  } else {
    return null;
  }
}
