// Keys of the data that shared code reads, by domain identity. Every key of a
// repository starts with `["repo", rid]`, so that prefix covers all of it.
// Data that spans repositories, such as notifications, has its own root.
export type Key = readonly string[];

export const keys = {
  repo: (rid: string) => ["repo", rid] as const,
  repoInfo: (rid: string) => ["repo", rid, "info"] as const,
  // The identity document's revisions and proposals.
  identity: (rid: string) => ["repo", rid, "identity"] as const,
  code: (rid: string) => ["repo", rid, "code"] as const,
  // The commit a revision resolves to; no revision means the default branch.
  head: (rid: string, peer: string | undefined, revision: string | undefined) =>
    ["repo", rid, "code", "head", peer ?? "", revision ?? ""] as const,
  issues: (rid: string) => ["repo", rid, "issues"] as const,
  // One status's list; `status` is the filter as the view names it.
  issueList: (rid: string, status: string) =>
    ["repo", rid, "issues", status] as const,
  issue: (rid: string, id: string) => ["repo", rid, "issue", id] as const,
  patches: (rid: string) => ["repo", rid, "patches"] as const,
  patchList: (rid: string, status: string) =>
    ["repo", rid, "patches", status] as const,
  patch: (rid: string, id: string) => ["repo", rid, "patch", id] as const,
  patchDetails: (rid: string) => ["repo", rid, "patch"] as const,
  releases: (rid: string) => ["repo", rid, "releases"] as const,
  releaseList: (rid: string, scope: string) =>
    ["repo", rid, "releases", "list", scope] as const,
  release: (rid: string, id: string) =>
    ["repo", rid, "releases", "release", id] as const,
  releaseCount: (rid: string) => ["repo", rid, "releases", "count"] as const,
  boards: (rid: string) => ["repo", rid, "boards"] as const,
  jobs: (rid: string) => ["repo", rid, "jobs"] as const,
  repos: () => ["repos"] as const,
  // The repository list for one scope, with the seeded repositories that
  // haven't arrived yet.
  repoList: (scope: string) => ["repos", scope] as const,
  // The local actor, which is found by scanning every repository's identity.
  actor: () => ["actor"] as const,
  notifications: () => ["notifications"] as const,
  notificationCount: () => ["notifications", "count"] as const,
  notificationList: () => ["notifications", "list"] as const,
};

// Lists of CI jobs, which scanning every job COB of a repository builds.
export function isJobsKey(key: Key): boolean {
  return key[0] === "repo" && key[2] === "jobs";
}

export function isRepoInfoKey(key: Key): boolean {
  return key[0] === "repo" && key[2] === "info";
}

// Data the node's COB cache holds: issues, patches and the counts in the
// repository info.
export function isCobCacheKey(key: Key): boolean {
  return (
    key[0] === "repo" &&
    ["info", "issues", "issue", "patches", "patch"].includes(key[2])
  );
}
