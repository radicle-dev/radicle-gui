// Keys of the data that shared code reads, by domain identity. Every key of a
// repository starts with `["repo", rid]`, so that prefix covers all of it.
export type Key = readonly string[];

export const keys = {
  repo: (rid: string) => ["repo", rid] as const,
  repoInfo: (rid: string) => ["repo", rid, "info"] as const,
  code: (rid: string) => ["repo", rid, "code"] as const,
  issues: (rid: string) => ["repo", rid, "issues"] as const,
  issue: (rid: string, id: string) => ["repo", rid, "issue", id] as const,
  patches: (rid: string) => ["repo", rid, "patches"] as const,
  patch: (rid: string, id: string) => ["repo", rid, "patch", id] as const,
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
