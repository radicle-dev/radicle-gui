import type {
  ErrorRoute,
  LoadedRoute,
  NotFoundRoute,
} from "@app/lib/router/definitions";
import type {
  BaseUrl,
  Blob,
  Commit,
  CommitBlob,
  CommitHeader,
  Diff,
  DiffBlob,
  Issue,
  IssueState,
  Node,
  Patch,
  PatchState,
  PeerRefs,
  Release,
  Remote,
  Repo,
  Revision,
  SeedingPolicy,
  Tree,
} from "@http-client";

import isEqual from "lodash/isEqual";

import * as Syntax from "@app/lib/syntax";
import config from "@app/lib/config";
import { HttpdClient } from "@http-client";
import { ResponseError, ResponseParseError } from "@http-client/lib/fetcher";
import { cached } from "@app/lib/cache";
import { handleError, unreachableError } from "@app/views/repos/error";
import {
  REFS_HEADS,
  getBranchesFromRefs,
  getTagsFromRefs,
  unreachable,
} from "@app/lib/utils";
import { nodePath } from "@app/views/nodes/router";

export const PATCHES_PER_PAGE = 10;
export const ISSUES_PER_PAGE = 10;
export const RELEASES_PER_PAGE = 30;

export function peerHasBranches(peer: PeerRefs): boolean {
  return Object.keys(peer.refs).some(name => name.startsWith(REFS_HEADS));
}

function canonicalOids(
  refs: Repo["refs"] | undefined,
): Array<[string, string]> {
  return [
    ...Object.entries(refs?.refs ?? {}),
    ...Object.entries(refs?.tags ?? {}).map(
      ([name, info]): [string, string] => [name, info.commit],
    ),
  ];
}

export function remoteToPeerRefs(remote: Remote): PeerRefs {
  if (remote.refs) {
    return {
      id: remote.id,
      alias: remote.alias,
      delegate: remote.delegate,
      refs: remote.refs,
    };
  }

  const refs: Record<string, string> = {};

  for (const [name, oid] of Object.entries(remote.heads)) {
    refs[`${REFS_HEADS}${name}`] = oid;
  }

  return {
    id: remote.id,
    alias: remote.alias,
    delegate: remote.delegate,
    refs,
  };
}

export type RepoRoute =
  | RepoTreeRoute
  | RepoHistoryRoute
  | {
      resource: "repo.commit";
      node: BaseUrl;
      repo: string;
      commit: string;
    }
  | RepoIssuesRoute
  | RepoIssueRoute
  | RepoPatchesRoute
  | RepoPatchRoute
  | RepoReleasesRoute
  | RepoReleaseRoute;

interface RepoIssuesRoute {
  resource: "repo.issues";
  node: BaseUrl;
  repo: string;
  status?: "open" | "closed";
}

interface RepoReleasesRoute {
  resource: "repo.releases";
  node: BaseUrl;
  repo: string;
  allAuthors?: boolean;
}

interface RepoReleaseRoute {
  resource: "repo.release";
  node: BaseUrl;
  repo: string;
  release: string;
  allAuthors?: boolean;
}

interface RepoIssueRoute {
  resource: "repo.issue";
  node: BaseUrl;
  repo: string;
  issue: string;
}

interface RepoTreeRoute {
  resource: "repo.source";
  node: BaseUrl;
  repo: string;
  path?: string;
  peer?: string;
  revision?: string;
  route?: string;
}

interface RepoHistoryRoute {
  resource: "repo.history";
  node: BaseUrl;
  repo: string;
  peer?: string;
  revision?: string;
}

interface RepoPatchRoute {
  resource: "repo.patch";
  node: BaseUrl;
  repo: string;
  patch: string;
  view?:
    | {
        name: "activity";
      }
    | {
        name: "changes";
        revision?: string;
      }
    | {
        name: "diff";
        fromCommit: string;
        toCommit: string;
      };
}

interface RepoPatchesRoute {
  resource: "repo.patches";
  node: BaseUrl;
  repo: string;
  search?: string;
}

// `repoId` on each loaded route is the repo path segment the user navigated in
// with: an alias when one was used, otherwise the canonical RID. It carries a
// dual meaning. In-repo links are built from it so the alias/RID form is
// preserved across navigation, and it is also handed to child components as the
// repo identifier for their API calls. The httpd resolves either form, so both
// uses are safe (`repo.rid` remains available on the `Repo` object when the
// canonical id is specifically needed, e.g. for stable cache keys).
export type RepoLoadedRoute =
  | {
      resource: "repo.source";
      params: {
        baseUrl: BaseUrl;
        seedingPolicy: SeedingPolicy;
        commit: string;
        repo: Repo;
        repoId: string;
        peer: string | undefined;
        revision: string | undefined;
        tree: Tree;
        path: string;
        rawPath: (commit?: string) => string;
        blobResult: BlobResult;
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.history";
      params: {
        baseUrl: BaseUrl;
        seedingPolicy: SeedingPolicy;
        commit: string;
        repo: Repo;
        repoId: string;
        peer: string | undefined;
        revision: string | undefined;
        tree: Tree;
        commitHeaders: CommitHeader[];
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.commit";
      params: {
        baseUrl: BaseUrl;
        repo: Repo;
        repoId: string;
        commit: Commit;
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.issue";
      params: {
        baseUrl: BaseUrl;
        repo: Repo;
        repoId: string;
        rawPath: (commit?: string) => string;
        issue: Issue;
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.issues";
      params: {
        baseUrl: BaseUrl;
        repo: Repo;
        repoId: string;
        issues: Issue[];
        status: IssueState["status"];
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.patches";
      params: {
        baseUrl: BaseUrl;
        repo: Repo;
        repoId: string;
        patches: Patch[];
        status: PatchState["status"];
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.patch";
      params: {
        baseUrl: BaseUrl;
        repo: Repo;
        repoId: string;
        rawPath: (commit?: string) => string;
        patch: Patch;
        stats: Diff["stats"];
        view: PatchView;
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.releases";
      params: {
        baseUrl: BaseUrl;
        repo: Repo;
        repoId: string;
        releases: Release[];
        allAuthors: boolean;
        showFilters: boolean;
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    }
  | {
      resource: "repo.release";
      params: {
        baseUrl: BaseUrl;
        repo: Repo;
        repoId: string;
        release: Release;
        allAuthors: boolean;
        nodeId: string;
        nodeAvatarUrl: string | undefined;
      };
    };

export type BlobResult =
  | { ok: true; blob: Blob; highlighted: Syntax.Root | undefined }
  | { ok: false; error: { status?: number; message: string; path: string } };

export type PatchView =
  | {
      name: "activity";
      revision: string;
    }
  | {
      name: "changes";
      revision: string;
      oid: string;
      diff: Diff;
      commits: CommitHeader[];
      files: Record<string, CommitBlob>;
    }
  | {
      name: "diff";
      diff: Diff;
      files: Record<string, DiffBlob>;
      fromCommit: string;
      toCommit: string;
    };

// Check whether the input is a SHA1 commit.
function isOid(input: string): boolean {
  return /^[a-fA-F0-9]{40}$/.test(input);
}

export const cachedGetDiff = cached(
  async (baseUrl: BaseUrl, rid: string, base: string, oid: string) => {
    const api = new HttpdClient(baseUrl);
    return await api.repo.getDiff(rid, base, oid);
  },
  (...args) => JSON.stringify(args),
  { max: 200 },
);

export const cachedGetDiffStats = cached(
  async (baseUrl: BaseUrl, rid: string, base: string, oid: string) => {
    const api = new HttpdClient(baseUrl);
    return await api.repo.getDiffStats(rid, base, oid);
  },
  (...args) => JSON.stringify(args),
  { max: 200 },
);

function parseRevisionToOid(
  revision: string | undefined,
  defaultBranch: string,
  branches: Record<string, string>,
): string {
  if (revision) {
    if (isOid(revision)) {
      return revision;
    } else {
      const oid = branches[revision];
      if (oid) {
        return oid;
      } else {
        throw new Error(`Revision ${revision} not found`);
      }
    }
  } else {
    return branches[defaultBranch];
  }
}

export async function loadRepoRoute(
  route: RepoRoute,
  previousLoaded: LoadedRoute,
): Promise<RepoLoadedRoute | ErrorRoute | NotFoundRoute> {
  const api = new HttpdClient(route.node);

  try {
    if (route.resource === "repo.source") {
      return await loadTreeView(route, previousLoaded);
    } else if (route.resource === "repo.history") {
      return await loadHistoryView(route, previousLoaded);
    } else if (route.resource === "repo.commit") {
      const [repo, commit, node] = await Promise.all([
        api.repo.getByRid(route.repo),
        api.repo.getCommitBySha(route.repo, route.commit),
        api.getNode(),
      ]);

      return {
        resource: "repo.commit",
        params: {
          baseUrl: route.node,
          repoId: route.repo,
          repo,
          commit,
          nodeId: node.id,
          nodeAvatarUrl: node.avatarUrl,
        },
      };
    } else if (route.resource === "repo.issue") {
      return await loadIssueView(route);
    } else if (route.resource === "repo.patch") {
      return await loadPatchView(route, previousLoaded);
    } else if (route.resource === "repo.issues") {
      return await loadIssuesView(route);
    } else if (route.resource === "repo.patches") {
      return await loadPatchesView(route);
    } else if (route.resource === "repo.releases") {
      return await loadReleasesView(route);
    } else if (route.resource === "repo.release") {
      return await loadReleaseView(route);
    } else {
      return unreachable(route);
    }
  } catch (error) {
    if (
      error instanceof Error ||
      error instanceof ResponseError ||
      error instanceof ResponseParseError
    ) {
      return handleError(error, route);
    } else {
      return unreachableError();
    }
  }
}

async function loadPatchesView(
  route: RepoPatchesRoute,
): Promise<RepoLoadedRoute> {
  const api = new HttpdClient(route.node);
  const searchParams = new URLSearchParams(route.search || "");
  const status = (searchParams.get("status") as PatchState["status"]) || "open";

  const [repo, patches, node] = await Promise.all([
    api.repo.getByRid(route.repo),
    api.repo.getAllPatches(route.repo, {
      status,
      page: 0,
      perPage: PATCHES_PER_PAGE,
    }),
    api.getNode(),
  ]);

  return {
    resource: "repo.patches",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      patches,
      status,
      repo,
      nodeId: node.id,
      nodeAvatarUrl: node.avatarUrl,
    },
  };
}

async function loadIssuesView(
  route: RepoIssuesRoute,
): Promise<RepoLoadedRoute> {
  const api = new HttpdClient(route.node);
  const status = route.status || "open";

  const [repo, issues, node] = await Promise.all([
    api.repo.getByRid(route.repo),
    api.repo.getAllIssues(route.repo, {
      status,
      page: 0,
      perPage: ISSUES_PER_PAGE,
    }),
    api.getNode(),
  ]);

  return {
    resource: "repo.issues",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      issues,
      status,
      repo,
      nodeId: node.id,
      nodeAvatarUrl: node.avatarUrl,
    },
  };
}

// Older nodes don't report a release count and lack the release API. Show a
// friendly page pointing to another node instead of a raw 404.
function releasesNotSupported(node: BaseUrl): NotFoundRoute {
  return {
    resource: "notFound",
    params: {
      title: "Releases are not available on this node",
      description:
        "This node is running an older version that doesn't support browsing releases yet.\nSelect a different node to continue.",
      baseUrl: node,
    },
  };
}

async function loadReleasesView(
  route: RepoReleasesRoute,
): Promise<RepoLoadedRoute | NotFoundRoute> {
  const api = new HttpdClient(route.node);
  const allAuthors = route.allAuthors || false;

  // Fetch releases alongside the repo so the common path stays parallel; the
  // repo's `meta.releases` then tells us whether a failure is an unsupported
  // node or a genuine error. The delegate scope is a subset of every author,
  // so the all-authors view sizes both scopes from its own page, while the
  // delegate view has to ask for the other scope to size it.
  const [repo, releasesResult, everyAuthorPage, node] = await Promise.all([
    api.repo.getByRid(route.repo),
    api.repo
      .getAllReleases(route.repo, {
        allAuthors,
        page: 0,
        perPage: RELEASES_PER_PAGE,
      })
      .then(
        releases => ({ releases }),
        (error: unknown) => ({ error }),
      ),
    allAuthors
      ? undefined
      : api.repo
          .getAllReleases(route.repo, {
            allAuthors: true,
            page: 0,
            perPage: RELEASES_PER_PAGE,
          })
          // Only the filter rides on this, so a failure here shouldn't take
          // the page down with it.
          .catch(() => undefined),
    api.getNode(),
  ]);

  const releaseCount = repo.payloads["xyz.radicle.project"].meta.releases;
  if (releaseCount === undefined) {
    return releasesNotSupported(route.node);
  }
  if ("error" in releasesResult) {
    throw releasesResult.error;
  }

  const releases = releasesResult.releases;

  // Offer the author filter only where the two scopes hold different releases,
  // so a repo whose releases are all by delegates carries no filter with an
  // identical list behind it, and one with none of its own still leaves a way
  // through to the others. Both sizes come from a list the endpoint returned:
  // `meta.releases` counts every release COB, including ones the endpoint
  // hides such as fully redacted releases, so it would overcount either scope.
  // A full page means the list may go on, so keep the filter rather than have
  // it appear or vanish as the user pages, and keep it too if the other scope
  // failed to load. Decided here so it stays fixed for the life of the route.
  const delegateIds = new Set(repo.delegates.map(d => d.id));
  const delegateReleaseCount = allAuthors
    ? releases.filter(r => delegateIds.has(r.creator.id)).length
    : releases.length;
  const everyAuthorCount = allAuthors
    ? releases.length
    : everyAuthorPage?.length;
  const showFilters =
    everyAuthorCount === undefined ||
    everyAuthorCount === RELEASES_PER_PAGE ||
    delegateReleaseCount !== everyAuthorCount;

  return {
    resource: "repo.releases",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      releases,
      allAuthors,
      showFilters,
      repo,
      nodeId: node.id,
      nodeAvatarUrl: node.avatarUrl,
    },
  };
}

async function loadReleaseView(
  route: RepoReleaseRoute,
): Promise<RepoLoadedRoute | NotFoundRoute> {
  const api = new HttpdClient(route.node);
  const allAuthors = route.allAuthors || false;

  const [repo, releaseResult, node] = await Promise.all([
    api.repo.getByRid(route.repo),
    api.repo.getReleaseById(route.repo, route.release).then(
      release => ({ release }),
      (error: unknown) => ({ error }),
    ),
    api.getNode(),
  ]);

  if (repo.payloads["xyz.radicle.project"].meta.releases === undefined) {
    return releasesNotSupported(route.node);
  }
  if ("error" in releaseResult) {
    throw releaseResult.error;
  }

  return {
    resource: "repo.release",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      repo,
      release: releaseResult.release,
      allAuthors,
      nodeId: node.id,
      nodeAvatarUrl: node.avatarUrl,
    },
  };
}

async function loadTreeView(
  route: RepoTreeRoute,
  previousLoaded: LoadedRoute,
): Promise<RepoLoadedRoute | NotFoundRoute> {
  const api = new HttpdClient(route.node);
  const rawPath = (commit?: string) =>
    `${route.node.scheme}://${route.node.hostname}:${route.node.port}/raw/${
      route.repo
    }${commit ? `/${commit}` : ""}`;

  let repoPromise: Promise<Repo>;
  let seedingPolicyPromise: Promise<SeedingPolicy>;
  let nodePromise: Promise<Pick<Node, "id" | "avatarUrl">>;
  if (
    (previousLoaded.resource === "repo.source" ||
      previousLoaded.resource === "repo.history") &&
    isEqual(previousLoaded.params.baseUrl, route.node) &&
    [previousLoaded.params.repo.rid, previousLoaded.params.repo.alias].includes(
      route.repo,
    ) &&
    previousLoaded.params.peer === route.peer
  ) {
    repoPromise = Promise.resolve(previousLoaded.params.repo);
    seedingPolicyPromise = Promise.resolve(previousLoaded.params.seedingPolicy);
    nodePromise = Promise.resolve({
      id: previousLoaded.params.nodeId,
      avatarUrl: previousLoaded.params.nodeAvatarUrl,
    });
  } else {
    repoPromise = api.repo.getByRid(route.repo);
    seedingPolicyPromise = api.getPolicyByRid(route.repo);
    nodePromise = api.getNode();
  }

  const [repo, seedingPolicy, node] = await Promise.all([
    repoPromise,
    seedingPolicyPromise,
    nodePromise,
  ]);

  if (!repo["payloads"]["xyz.radicle.project"]) {
    throw new Error(
      `Repository ${repo.rid} does not have a xyz.radicle.project payload.`,
    );
  }

  const project = repo["payloads"]["xyz.radicle.project"];
  let branchMap = canonicalBranchMap(repo);

  if (route.peer) {
    try {
      branchMap = await getPeerBranchMap(api, route.repo, route.peer);
    } catch (e) {
      if (e instanceof ResponseError) {
        return {
          resource: "notFound",
          params: { title: `Peer ${route.peer} could not be found` },
        };
      }
      throw e;
    }
  }

  if (route.route) {
    const { revision, path } = detectRevision(route.route, branchMap);
    route.revision = revision;
    route.path = path;
  }

  const commit = parseRevisionToOid(
    route.revision,
    project.data.defaultBranch,
    branchMap,
  );
  const path = route.path || "/";
  const [tree, blobResult] = await Promise.all([
    api.repo.getTree(route.repo, commit),
    loadBlob(api, repo.rid, commit, path),
  ]);
  return {
    resource: "repo.source",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      seedingPolicy,
      commit,
      repo,
      peer: route.peer,
      rawPath,
      revision: route.revision,
      tree,
      path,
      blobResult,
      nodeId: node.id,
      nodeAvatarUrl: node.avatarUrl,
    },
  };
}

async function loadBlob(
  api: HttpdClient,
  repo: string,
  commit: string,
  path: string,
): Promise<BlobResult> {
  try {
    let blob: Blob;
    if (path === "" || path === "/") {
      blob = await api.repo.getReadme(repo, commit);
    } else {
      blob = await api.repo.getBlob(repo, commit, path);
    }
    return {
      ok: true,
      blob,
      highlighted: blob.content
        ? await Syntax.highlight(blob.content, blob.path.split(".").pop() ?? "")
        : undefined,
    };
  } catch (e: unknown) {
    if (e instanceof ResponseError) {
      return {
        ok: false,
        error: {
          status: e.status,
          message: "Not able to load file",
          path,
        },
      };
    } else if (path === "/") {
      return {
        ok: false,
        error: {
          message: "The README could not be loaded",
          path,
        },
      };
    } else {
      return {
        ok: false,
        error: {
          message: "Not able to load file",
          path,
        },
      };
    }
  }
}
async function loadHistoryView(
  route: RepoHistoryRoute,
  previousLoaded: LoadedRoute,
): Promise<RepoLoadedRoute> {
  const api = new HttpdClient(route.node);

  let repoPromise: Promise<Repo>;
  let seedingPolicyPromise: Promise<SeedingPolicy>;
  let nodePromise: Promise<Pick<Node, "id" | "avatarUrl">>;
  if (
    (previousLoaded.resource === "repo.source" ||
      previousLoaded.resource === "repo.history") &&
    isEqual(previousLoaded.params.baseUrl, route.node) &&
    [previousLoaded.params.repo.rid, previousLoaded.params.repo.alias].includes(
      route.repo,
    ) &&
    previousLoaded.params.peer === route.peer
  ) {
    repoPromise = Promise.resolve(previousLoaded.params.repo);
    seedingPolicyPromise = Promise.resolve(previousLoaded.params.seedingPolicy);
    nodePromise = Promise.resolve({
      id: previousLoaded.params.nodeId,
      avatarUrl: previousLoaded.params.nodeAvatarUrl,
    });
  } else {
    repoPromise = api.repo.getByRid(route.repo);
    seedingPolicyPromise = api.getPolicyByRid(route.repo);
    nodePromise = api.getNode();
  }

  const [repo, seedingPolicy, node] = await Promise.all([
    repoPromise,
    seedingPolicyPromise,
    nodePromise,
  ]);

  const branchMap = route.peer
    ? await getPeerBranchMap(api, route.repo, route.peer)
    : canonicalBranchMap(repo);

  if (!repo["payloads"]["xyz.radicle.project"]) {
    throw new Error(
      `Repository ${repo.rid} does not have a xyz.radicle.project payload.`,
    );
  }

  const project = repo["payloads"]["xyz.radicle.project"];
  const commitId =
    route.revision && isOid(route.revision)
      ? route.revision
      : branchMap[route.revision || project.data.defaultBranch];

  if (!commitId) {
    throw new Error(
      `Revision ${route.revision} not found for repo ${repo.rid}`,
    );
  }

  let treePromise: Promise<Tree>;

  if (
    (previousLoaded.resource === "repo.source" ||
      previousLoaded.resource === "repo.history") &&
    [previousLoaded.params.repo.rid, previousLoaded.params.repo.alias].includes(
      route.repo,
    ) &&
    previousLoaded.params.commit === commitId
  ) {
    treePromise = Promise.resolve(previousLoaded.params.tree);
  } else {
    treePromise = api.repo.getTree(route.repo, commitId);
  }

  const [tree, commitHeaders] = await Promise.all([
    treePromise,
    api.repo.getAllCommits(repo.rid, {
      parent: commitId,
      page: 0,
      perPage: config.source.commitsPerPage,
    }),
  ]);

  return {
    resource: "repo.history",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      seedingPolicy,
      commit: commitId,
      repo,
      peer: route.peer,
      revision: route.revision,
      tree,
      commitHeaders,
      nodeId: node.id,
      nodeAvatarUrl: node.avatarUrl,
    },
  };
}

async function loadIssueView(route: RepoIssueRoute): Promise<RepoLoadedRoute> {
  const api = new HttpdClient(route.node);
  const rawPath = (commit?: string) =>
    `${route.node.scheme}://${route.node.hostname}:${route.node.port}/raw/${
      route.repo
    }${commit ? `/${commit}` : ""}`;

  const [repo, issue, node] = await Promise.all([
    api.repo.getByRid(route.repo),
    api.repo.getIssueById(route.repo, route.issue),
    api.getNode(),
  ]);
  return {
    resource: "repo.issue",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      repo,
      rawPath,
      issue,
      nodeId: node.id,
      nodeAvatarUrl: node.avatarUrl,
    },
  };
}

async function loadPatchView(
  route: RepoPatchRoute,
  previousLoaded: LoadedRoute,
): Promise<RepoLoadedRoute> {
  const api = new HttpdClient(route.node);
  const rawPath = (commit?: string) =>
    `${route.node.scheme}://${route.node.hostname}:${route.node.port}/raw/${
      route.repo
    }${commit ? `/${commit}` : ""}`;

  let repoPromise: Promise<Repo>;
  let patchPromise: Promise<Patch>;
  let nodePromise: Promise<Pick<Node, "id" | "avatarUrl">>;

  if (
    previousLoaded.resource === "repo.patch" &&
    isEqual(previousLoaded.params.baseUrl, route.node) &&
    [previousLoaded.params.repo.rid, previousLoaded.params.repo.alias].includes(
      route.repo,
    ) &&
    previousLoaded.params.patch.id === route.patch
  ) {
    repoPromise = Promise.resolve(previousLoaded.params.repo);
    patchPromise = Promise.resolve(previousLoaded.params.patch);
    nodePromise = Promise.resolve({
      id: previousLoaded.params.nodeId,
      avatarUrl: previousLoaded.params.nodeAvatarUrl,
    });
  } else {
    repoPromise = api.repo.getByRid(route.repo);
    patchPromise = api.repo.getPatchById(route.repo, route.patch);
    nodePromise = api.getNode();
  }
  const [repo, patch, { id: nodeId, avatarUrl }] = await Promise.all([
    repoPromise,
    patchPromise,
    nodePromise,
  ]);

  const latestRevision = patch.revisions.at(-1) as Revision;
  // Take the header badge's stats from the latest revision's full diff (the
  // same source the changeset view uses) so the two badges on the patch page
  // never disagree. The patch list still uses the fast /stats endpoint.
  const {
    diff: { stats },
  } = await cachedGetDiff(
    api.baseUrl,
    route.repo,
    latestRevision.base,
    latestRevision.oid,
  );

  let view: PatchView;
  switch (route.view?.name) {
    case "activity":
    case undefined: {
      view = { name: "activity", revision: latestRevision.id };
      break;
    }
    case "changes": {
      const revisionId = route.view.revision;
      const revision =
        patch.revisions.find(r => r.id === revisionId) || latestRevision;
      if (!revision) {
        throw new Error(
          `revision ${revisionId} of patch ${route.patch} not found`,
        );
      }
      const { diff, commits, files } = await cachedGetDiff(
        api.baseUrl,
        route.repo,
        revision.base,
        revision.oid,
      );
      view = {
        name: route.view?.name,
        revision: revision.id,
        oid: revision.oid,
        diff,
        commits,
        files,
      };
      break;
    }
    case "diff": {
      const { fromCommit, toCommit } = route.view;
      const { diff, files } = await cachedGetDiff(
        api.baseUrl,
        route.repo,
        fromCommit,
        toCommit,
      );

      view = { name: "diff", fromCommit, toCommit, files, diff };
      break;
    }
  }
  return {
    resource: "repo.patch",
    params: {
      baseUrl: route.node,
      repoId: route.repo,
      repo,
      rawPath,
      patch,
      stats,
      view,
      nodeId,
      nodeAvatarUrl: avatarUrl,
    },
  };
}

// Revision names resolvable without consulting any remote: the default branch
// plus the delegate-approved canonical refs, both already carried on the `Repo`
// object.
function canonicalBranchMap(repo: Repo): Record<string, string> {
  const branchMap: Record<string, string> = {};

  const project = repo.payloads["xyz.radicle.project"];
  if (project) {
    branchMap[project.data.defaultBranch] = project.meta.head;
    branchMap[encodeURIComponent(project.data.defaultBranch)] =
      project.meta.head;
  }

  for (const [refName, oid] of canonicalOids(repo.refs)) {
    const shortName = refName.startsWith(REFS_HEADS)
      ? refName.slice(REFS_HEADS.length)
      : refName.startsWith("refs/tags/")
        ? refName.slice("refs/tags/".length)
        : refName;
    branchMap[shortName] = oid;
    branchMap[encodeURIComponent(shortName)] = oid;
  }

  return branchMap;
}

// Revision names published by a single remote. Fetching just that remote keeps
// the full remote listing, which is expensive on repositories with many peers,
// off the navigation path.
async function getPeerBranchMap(
  api: HttpdClient,
  repoId: string,
  peer: string,
): Promise<Record<string, string>> {
  const remote = await api.repo.getRemoteByPeer(repoId, peer);
  const refs = remoteToPeerRefs(remote).refs;
  const map: Record<string, string> = { ...getBranchesFromRefs(refs) };
  for (const [tagName, oid] of Object.entries(getTagsFromRefs(refs))) {
    map[tagName] = oid;
    map[encodeURIComponent(tagName)] = oid;
  }
  return map;
}

// Detects branch names and commit IDs at the start of `input` and extract it.
function detectRevision(
  input: string,
  branches: Record<string, string>,
): { path: string; revision?: string } {
  const commitPath = [input.slice(0, 40), input.slice(41)];
  const branch = Object.entries(branches).find(([branchName]) =>
    input.startsWith(branchName),
  );

  if (branch) {
    const [revision, path] = [
      input.slice(0, branch[0].length),
      input.slice(branch[0].length + 1),
    ];
    return {
      revision,
      path: path || "/",
    };
  } else if (isOid(commitPath[0])) {
    return {
      revision: commitPath[0],
      path: commitPath[1] || "/",
    };
  } else {
    return { path: input };
  }
}

function sanitizeQueryString(queryString: string): string {
  return queryString.startsWith("?") ? queryString.substring(1) : queryString;
}

export function resolveRepoRoute(
  node: BaseUrl,
  repo: string,
  segments: string[],
  urlSearch: string,
): RepoRoute | null {
  let content = segments.shift();
  let peer;
  if (content === "remotes") {
    peer = segments.shift();
    content = segments.shift();
  }

  if (!content || content === "tree") {
    return {
      resource: "repo.source",
      node,
      repo,
      peer,
      path: undefined,
      revision: undefined,
      route: segments.join("/"),
    };
  } else if (content === "history") {
    return {
      resource: "repo.history",
      node,
      repo,
      peer,
      revision: segments.join("/"),
    };
  } else if (content === "commits") {
    return {
      resource: "repo.commit",
      node,
      repo,
      commit: segments[0],
    };
  } else if (content === "issues") {
    const issueOrAction = segments.shift();
    if (issueOrAction) {
      return {
        resource: "repo.issue",
        node,
        repo,
        issue: issueOrAction,
      };
    } else {
      const rawStatus = new URLSearchParams(sanitizeQueryString(urlSearch)).get(
        "status",
      );
      let status: "open" | "closed" | undefined;
      if (rawStatus === "open" || rawStatus === "closed") {
        status = rawStatus;
      }
      return {
        resource: "repo.issues",
        node,
        repo,
        status,
      };
    }
  } else if (content === "patches") {
    return resolvePatchesRoute(node, repo, segments, urlSearch);
  } else if (content === "releases") {
    const release = segments.shift();
    const allAuthors =
      new URLSearchParams(sanitizeQueryString(urlSearch)).get("allAuthors") ===
      "true";
    if (release) {
      return {
        resource: "repo.release",
        node,
        repo,
        release,
        allAuthors,
      };
    } else {
      return {
        resource: "repo.releases",
        node,
        repo,
        allAuthors,
      };
    }
  } else {
    return null;
  }
}

function resolvePatchesRoute(
  node: BaseUrl,
  repo: string,
  segments: string[],
  urlSearch: string,
): RepoPatchRoute | RepoPatchesRoute {
  const patch = segments.shift();
  const revision = segments.shift();
  if (patch) {
    const searchParams = new URLSearchParams(sanitizeQueryString(urlSearch));
    const tab = searchParams.get("tab");
    const base = {
      resource: "repo.patch",
      node,
      repo,
      patch,
    } as const;
    const diff = searchParams.get("diff");
    if (diff) {
      const [fromCommit, toCommit] = diff.split("..");
      if (isOid(fromCommit) && isOid(toCommit)) {
        return {
          ...base,
          view: { name: "diff", fromCommit, toCommit },
        };
      }
    }

    if (tab === "changes") {
      return {
        ...base,
        view: { name: tab, revision },
      };
    } else if (tab === "activity") {
      return {
        ...base,
        view: { name: tab },
      };
    } else {
      return base;
    }
  } else {
    return {
      resource: "repo.patches",
      node,
      repo,
      search: sanitizeQueryString(urlSearch),
    };
  }
}

export function repoRouteToPath(route: RepoRoute): string {
  const node = nodePath(route.node);

  const pathSegments = [node, route.repo];

  if (route.resource === "repo.source") {
    if (route.peer) {
      pathSegments.push("remotes", route.peer);
    }

    pathSegments.push("tree");
    let omitTree = true;

    if (route.route && route.route !== "/") {
      pathSegments.push(route.route);
      omitTree = false;
    } else {
      if (route.revision) {
        pathSegments.push(route.revision);
        omitTree = false;
      }

      if (route.path && route.path !== "/") {
        pathSegments.push(route.path);
        omitTree = false;
      }
    }
    if (omitTree) {
      pathSegments.pop();
    }

    return pathSegments.join("/");
  } else if (route.resource === "repo.history") {
    if (route.peer) {
      pathSegments.push("remotes", route.peer);
    }

    pathSegments.push("history");

    if (route.revision) {
      pathSegments.push(route.revision);
    }
    return pathSegments.join("/");
  } else if (route.resource === "repo.commit") {
    return [...pathSegments, "commits", route.commit].join("/");
  } else if (route.resource === "repo.issues") {
    let url = [...pathSegments, "issues"].join("/");
    const searchParams = new URLSearchParams();
    if (route.status) {
      searchParams.set("status", route.status);
    }
    if (searchParams.size > 0) {
      url += `?${searchParams}`;
    }
    return url;
  } else if (route.resource === "repo.issue") {
    return [...pathSegments, "issues", route.issue].join("/");
  } else if (route.resource === "repo.patches") {
    let url = [...pathSegments, "patches"].join("/");
    if (route.search) {
      url += `?${route.search}`;
    }
    return url;
  } else if (route.resource === "repo.patch") {
    return patchRouteToPath(route);
  } else if (route.resource === "repo.releases") {
    let url = [...pathSegments, "releases"].join("/");
    if (route.allAuthors) {
      url += "?allAuthors=true";
    }
    return url;
  } else if (route.resource === "repo.release") {
    let url = [...pathSegments, "releases", route.release].join("/");
    if (route.allAuthors) {
      url += "?allAuthors=true";
    }
    return url;
  } else {
    return unreachable(route);
  }
}

function patchRouteToPath(route: RepoPatchRoute): string {
  const node = nodePath(route.node);

  const pathSegments = [node, route.repo];

  pathSegments.push("patches", route.patch);
  if (route.view?.name === "changes") {
    if (route.view.revision) {
      pathSegments.push(route.view.revision);
    }
  }

  let url = pathSegments.join("/");
  if (!route.view) {
    return url;
  } else {
    const searchParams = new URLSearchParams();

    if (route.view.name === "diff") {
      searchParams.set(
        "diff",
        `${route.view.fromCommit}..${route.view.toCommit}`,
      );
    } else {
      searchParams.set("tab", route.view.name);
    }
    url += `?${searchParams.toString()}`;
    return url;
  }
}

export function repoTitle(loadedRoute: RepoLoadedRoute) {
  const title: string[] = [];

  if (!loadedRoute.params.repo["payloads"]["xyz.radicle.project"]) {
    throw new Error(
      `Repository ${loadedRoute.params.repo.rid} does not have a xyz.radicle.project payload.`,
    );
  }
  const project = loadedRoute.params.repo["payloads"]["xyz.radicle.project"];

  if (loadedRoute.resource === "repo.source") {
    title.push(project.data.name);
    if (project.data.description.length > 0) {
      title.push(project.data.description);
    }
  } else if (loadedRoute.resource === "repo.commit") {
    title.push(loadedRoute.params.commit.commit.summary);
    title.push("commit");
  } else if (loadedRoute.resource === "repo.history") {
    title.push(project.data.name);
    title.push("Commits");
  } else if (loadedRoute.resource === "repo.issue") {
    title.push(loadedRoute.params.issue.title);
    title.push("issue");
  } else if (loadedRoute.resource === "repo.issues") {
    title.push(project.data.name);
    title.push("issues");
  } else if (loadedRoute.resource === "repo.patch") {
    title.push(loadedRoute.params.patch.title);
    title.push("patch");
  } else if (loadedRoute.resource === "repo.patches") {
    title.push(project.data.name);
    title.push("patches");
  } else if (loadedRoute.resource === "repo.release") {
    title.push(
      loadedRoute.params.release.title ||
        loadedRoute.params.release.tagName ||
        loadedRoute.params.release.id,
    );
    title.push("release");
  } else if (loadedRoute.resource === "repo.releases") {
    title.push(project.data.name);
    title.push("releases");
  } else {
    return unreachable(loadedRoute);
  }

  return title;
}

export const testExports = { isOid };
