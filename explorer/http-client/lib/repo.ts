import type { Fetcher, RequestOptions } from "./fetcher.js";

import { ResponseError } from "./fetcher.js";
import type { Commit, Commits } from "./repo/commit.js";
import type { Issue } from "./repo/issue.js";
import type { Patch } from "./repo/patch.js";
import type { Release } from "./repo/release.js";
import type { ZodSchema } from "zod";

import {
  array,
  boolean,
  literal,
  number,
  object,
  optional,
  record,
  string,
  union,
  z,
} from "zod";

import {
  commitHeaderSchema,
  commitSchema,
  commitsSchema,
  diffBlobSchema,
  diffSchema,
} from "./repo/commit.js";
import { issueSchema, issuesSchema } from "./repo/issue.js";
import { patchSchema, patchesSchema } from "./repo/patch.js";
import { releaseSchema, releasesSchema } from "./repo/release.js";
import { authorSchema } from "./shared.js";

export type PeerRefs = {
  id: string;
  alias?: string;
  delegate: boolean;
  refs: Record<string, string>;
};

const tagInfoSchema = object({
  commit: string(),
  tagger: object({
    name: string(),
    email: string(),
    timestamp: number(),
  }).optional(),
  message: string().optional(),
});

export type TagInfo = z.infer<typeof tagInfoSchema>;

const repoSchema = object({
  rid: string(),
  payloads: object({
    "xyz.radicle.project": object({
      data: object({
        name: string(),
        description: string(),
        defaultBranch: string(),
      }),
      meta: object({
        head: string(),
        patches: object({
          open: number(),
          draft: number(),
          archived: number(),
          merged: number(),
        }),
        issues: object({
          open: number(),
          closed: number(),
        }),
        // Optional: absent on older nodes that don't report release counts.
        releases: optional(number()),
      }),
    }),
  }),
  delegates: array(authorSchema),
  threshold: number(),
  visibility: union([
    object({ type: literal("public") }),
    object({ type: literal("private"), allow: optional(array(string())) }),
  ]),
  seeding: number(),
  refs: object({
    tags: record(string(), tagInfoSchema),
    refs: record(string(), string()),
  }).optional(),
  alias: string().optional(),
});
const reposSchema = array(repoSchema);

export type Repo = z.infer<typeof repoSchema>;

const searchResultSchema = object({
  rid: string(),
  payloads: object({
    "xyz.radicle.project": object({
      name: string(),
      description: string(),
      defaultBranch: string(),
    }).optional(),
  }),
  delegates: array(authorSchema),
  seeds: number(),
});
const searchResultsSchema = array(searchResultSchema);

export type SearchResult = z.infer<typeof searchResultSchema>;

const activitySchema = object({
  activity: array(number()),
});

export type Activity = z.infer<typeof activitySchema>;

const blobSchema = object({
  binary: boolean(),
  content: optional(string()),
  name: string(),
  path: string(),
  lastCommit: commitHeaderSchema,
});

export type Blob = z.infer<typeof blobSchema>;

const treeEntrySchema = object({
  path: string(),
  name: string(),
  oid: string(),
  kind: union([literal("blob"), literal("tree"), literal("submodule")]),
});

export type TreeEntry = z.infer<typeof treeEntrySchema>;

const treeStatsSchema = object({
  commits: number(),
  branches: number(),
  contributors: number(),
});

export type TreeStats = z.infer<typeof treeStatsSchema>;

const commitCountSchema = object({ commits: number() });

export type Tree = z.infer<typeof treeSchema>;

const treeSchema = object({
  entries: array(treeEntrySchema),
  lastCommit: commitHeaderSchema,
  name: string(),
  path: string(),
});

const remoteSchema = object({
  id: string(),
  alias: string().optional(),
  delegate: boolean(),
  heads: record(string(), string()),
  refs: record(string(), string()).optional(),
});

export type Remote = z.infer<typeof remoteSchema>;

const remotesSchema = array(remoteSchema);

export type DiffResponse = z.infer<typeof diffResponseSchema>;

const diffResponseSchema = object({
  commits: array(commitHeaderSchema),
  diff: diffSchema,
  files: record(string(), diffBlobSchema),
});

const diffStatsSchema = object({
  filesChanged: number(),
  insertions: number(),
  deletions: number(),
});

export type DiffStats = z.infer<typeof diffStatsSchema>;

const statusSchema = union([
  literal("started"),
  literal("failed"),
  literal("succeeded"),
]);

const runSchema = object({
  runId: string(),
  node: authorSchema,
  status: statusSchema,
  log: string(),
});

const jobSchema = object({
  jobId: string(),
  commit: string(),
  runs: array(runSchema),
});

export type Job = z.infer<typeof jobSchema>;

const jobsSchema = array(jobSchema) satisfies ZodSchema<Job[]>;

export type RepoListQuery = {
  page?: number;
  perPage?: number;
  show?: "pinned" | "all";
  sort?: "rid" | "activity" | "seeding";
};
export class Client {
  #fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    this.#fetcher = fetcher;
  }

  public async getByDelegate(
    delegateId: string,
    query?: RepoListQuery,
    options?: RequestOptions,
  ): Promise<Repo[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `delegates/${delegateId}/repos`,
        query,
        options,
      },
      reposSchema,
    );
  }

  public async getByRid(rid: string, options?: RequestOptions): Promise<Repo> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}`,
        options,
      },
      repoSchema,
    );
  }

  public async getAll(
    query?: RepoListQuery,
    options?: RequestOptions,
  ): Promise<Repo[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: "repos",
        query,
        options,
      },
      reposSchema,
    );
  }

  public async search(
    query: string,
    options?: RequestOptions,
  ): Promise<SearchResult[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: "repos/search",
        query: { q: query },
        options,
      },
      searchResultsSchema,
    );
  }

  public async getActivity(
    rid: string,
    options?: RequestOptions,
  ): Promise<Activity> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/activity`,
        options,
      },
      activitySchema,
    );
  }

  public async getReadme(
    rid: string,
    sha: string,
    options?: RequestOptions,
  ): Promise<Blob> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/readme/${sha}`,
        options,
      },
      blobSchema,
    );
  }

  public async getBlob(
    rid: string,
    sha: string,
    path: string,
    options?: RequestOptions,
  ): Promise<Blob> {
    const blob = await this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/blob/${sha}/${path}`,
        options,
      },
      blobSchema,
    );
    return blob;
  }

  public async getTree(
    rid: string,
    sha: string,
    path?: string,
    options?: RequestOptions,
  ): Promise<Tree> {
    const tree = await this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/tree/${sha}/${path ?? ""}`,
        options,
      },
      treeSchema,
    );
    return tree;
  }

  public async getTreeStatsBySha(
    rid: string,
    sha: string,
    options?: RequestOptions,
  ): Promise<TreeStats> {
    const tree = await this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/stats/tree/${sha}`,
        options,
      },
      treeStatsSchema,
    );
    return tree;
  }

  public async getCommitCountBySha(
    rid: string,
    sha: string,
    options?: RequestOptions,
  ): Promise<number> {
    try {
      const { commits } = await this.#fetcher.fetchOk(
        {
          method: "GET",
          path: `repos/${rid}/stats/commits/${sha}`,
          options,
        },
        commitCountSchema,
      );
      return commits;
    } catch (error) {
      // Older nodes don't serve the dedicated commit-count endpoint, so fall
      // back to the tree stats endpoint, which also returns the commit count.
      // TODO: Drop this fallback once enough nodes serve /stats/commits.
      if (error instanceof ResponseError && error.status === 404) {
        const stats = await this.getTreeStatsBySha(rid, sha, options);
        return stats.commits;
      }
      throw error;
    }
  }

  public async getAllRemotes(
    rid: string,
    options?: RequestOptions,
  ): Promise<Remote[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/remotes`,
        options,
      },
      remotesSchema,
    );
  }

  public async getRemoteByPeer(
    rid: string,
    peer: string,
    options?: RequestOptions,
  ): Promise<Remote> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/remotes/${peer}`,
        options,
      },
      remoteSchema,
    );
  }

  public async getAllCommits(
    rid: string,
    query?: {
      parent?: string;
      since?: number;
      until?: number;
      page?: number;
      perPage?: number;
    },
    options?: RequestOptions,
  ): Promise<Commits> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/commits`,
        query,
        options,
      },
      commitsSchema,
    );
  }

  public async getCommitBySha(
    rid: string,
    sha: string,
    options?: RequestOptions,
  ): Promise<Commit> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/commits/${sha}`,
        options,
      },
      commitSchema,
    );
  }

  public async getDiff(
    rid: string,
    revisionBase: string,
    revisionOid: string,
    options?: RequestOptions,
  ): Promise<DiffResponse> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/diff/${revisionBase}/${revisionOid}`,
        options,
      },
      diffResponseSchema,
    );
  }

  public async getDiffStats(
    rid: string,
    revisionBase: string,
    revisionOid: string,
    options?: RequestOptions,
  ): Promise<DiffStats> {
    try {
      return await this.#fetcher.fetchOk(
        {
          method: "GET",
          path: `repos/${rid}/diff/${revisionBase}/${revisionOid}/stats`,
          options,
        },
        diffStatsSchema,
      );
    } catch (error) {
      // Older nodes don't serve the dedicated diff-stats endpoint, so fall back
      // to the full diff, which also carries the stats.
      // TODO: Drop this fallback once enough nodes serve /diff/:base/:oid/stats.
      if (error instanceof ResponseError && error.status === 404) {
        const { diff } = await this.getDiff(
          rid,
          revisionBase,
          revisionOid,
          options,
        );
        return diff.stats;
      }
      throw error;
    }
  }

  public async getJobsByCommit(
    rid: string,
    commit: string,
    options?: RequestOptions,
  ): Promise<Job[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/jobs/${commit}`,
        options,
      },
      jobsSchema,
    );
  }

  public async getIssueById(
    rid: string,
    issueId: string,
    options?: RequestOptions,
  ): Promise<Issue> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/issues/${issueId}`,
        options,
      },
      issueSchema,
    );
  }

  public async getAllIssues(
    rid: string,
    query?: {
      page?: number;
      perPage?: number;
      status?: string;
    },
    options?: RequestOptions,
  ): Promise<Issue[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/issues`,
        query,
        options,
      },
      issuesSchema,
    );
  }

  public async getPatchById(
    rid: string,
    patchId: string,
    options?: RequestOptions,
  ): Promise<Patch> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/patches/${patchId}`,
        options,
      },
      patchSchema,
    );
  }

  public async getAllPatches(
    rid: string,
    query?: {
      page?: number;
      perPage?: number;
      status?: string;
    },
    options?: RequestOptions,
  ): Promise<Patch[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/patches`,
        query,
        options,
      },
      patchesSchema,
    );
  }

  public async getReleaseById(
    rid: string,
    releaseId: string,
    options?: RequestOptions,
  ): Promise<Release> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/releases/${releaseId}`,
        options,
      },
      releaseSchema,
    );
  }

  public async getAllReleases(
    rid: string,
    query?: {
      page?: number;
      perPage?: number;
      allAuthors?: boolean;
      showRedacted?: boolean;
    },
    options?: RequestOptions,
  ): Promise<Release[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `repos/${rid}/releases`,
        query,
        options,
      },
      releasesSchema,
    );
  }
}
