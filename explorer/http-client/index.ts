import type { BaseUrl } from "./lib/fetcher.js";
import type {
  Blob,
  DiffResponse,
  Job,
  PeerRefs,
  Remote,
  Repo,
  RepoListQuery,
  SearchResult,
  TagInfo,
  Tree,
  TreeStats,
} from "./lib/repo.js";
import type {
  Author,
  Config,
  SeedingPolicy,
  DefaultSeedingPolicy,
} from "./lib/shared.js";
import type { Comment, Embed, Reaction } from "./lib/repo/comment.js";
import type {
  Commit,
  CommitBlob,
  CommitHeader,
  ChangesetWithDiff,
  ChangesetWithoutDiff,
  Diff,
  DiffBlob,
  DiffContent,
  DiffFile,
  HunkLine,
} from "./lib/repo/commit.js";
import type { Issue, IssueState } from "./lib/repo/issue.js";
import type {
  LifecycleState,
  Merge,
  MergeTarget,
  Patch,
  PatchState,
  Review,
  Revision,
  Verdict,
} from "./lib/repo/patch.js";
import type {
  Artifact,
  Location,
  Redaction,
  Release,
} from "./lib/repo/release.js";
import type { RequestOptions } from "./lib/fetcher.js";
import type { ZodSchema } from "zod";

import * as z from "zod";

import * as repo from "./lib/repo.js";
import { Fetcher, ResponseError } from "./lib/fetcher.js";

export { ResponseError };
import {
  nodeConfigSchema,
  scopeSchema,
  seedingPolicySchema,
} from "./lib/shared.js";

export type {
  Artifact,
  Author,
  BaseUrl,
  Blob,
  ChangesetWithDiff,
  ChangesetWithoutDiff,
  Comment,
  Commit,
  CommitBlob,
  CommitHeader,
  Config,
  DefaultSeedingPolicy,
  Diff,
  DiffBlob,
  DiffContent,
  DiffFile,
  DiffResponse,
  Embed,
  HunkLine,
  Issue,
  IssueState,
  Job,
  LifecycleState,
  Location,
  Merge,
  MergeTarget,
  Patch,
  PatchState,
  PeerRefs,
  Reaction,
  Redaction,
  Release,
  Remote,
  Repo,
  RepoListQuery,
  Review,
  Revision,
  SearchResult,
  SeedingPolicy,
  TagInfo,
  Tree,
  TreeStats,
  Verdict,
};

export type Node = z.infer<typeof nodeSchema>;

const nodeSchema = z.object({
  id: z.string(),
  agent: z.string().nullable(),
  config: nodeConfigSchema.nullable(),
  state: z.union([z.literal("running"), z.literal("stopped")]),
  avatarUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  description: z.string().optional(),
});

export type Info = z.infer<typeof infoSchema>;

const infoSchema = z.object({
  node: nodeSchema,
  httpd: z.object({
    searchAvailable: z.boolean(),
  }),
});

export type NodeIdentity = z.infer<typeof nodeIdentitySchema>;

const nodeIdentitySchema = z.object({
  alias: z.string().nullable(),
  did: z.string(),
  ssh: z.object({
    full: z.string(),
    hash: z.string(),
  }),
});

export type NodeInfo = z.infer<typeof nodeInfoSchema>;

const nodeInfoSchema = z.object({
  message: z.string(),
  service: z.string(),
  version: z.string(),
  apiVersion: z.string(),
  nid: z.string(),
  path: z.string(),
  links: z.array(
    z.object({
      href: z.string(),
      rel: z.string(),
      type: z.union([
        z.literal("GET"),
        z.literal("POST"),
        z.literal("PUT"),
        z.literal("DELETE"),
      ]),
    }),
  ),
});

export type NodePolicies = z.infer<typeof nodePoliciesSchema>;

const nodePoliciesSchema = z.object({
  rid: z.string(),
  policy: z.union([
    z.object({ policy: z.literal("block") }),
    z.object({
      policy: z.literal("allow"),
      scope: scopeSchema,
    }),
  ]),
});

export interface NodeStats {
  repos: { total: number };
}

const nodeStatsSchema = z.object({
  repos: z.object({ total: z.number() }),
}) satisfies ZodSchema<NodeStats>;

export class HttpdClient {
  #fetcher: Fetcher;

  public baseUrl: BaseUrl;
  public repo: repo.Client;

  public constructor(baseUrl: BaseUrl) {
    this.baseUrl = baseUrl;
    this.#fetcher = new Fetcher(this.baseUrl);

    this.repo = new repo.Client(this.#fetcher);
  }

  public changePort(port: number): void {
    this.baseUrl.port = port;
  }

  public get url(): string {
    return `${this.baseUrl.scheme}://${this.baseUrl.hostname}:${this.baseUrl.port}`;
  }

  public get hostname(): string {
    return this.baseUrl.hostname;
  }

  public get port(): string {
    return this.baseUrl.port.toString();
  }

  public async getNodeInfo(options?: RequestOptions): Promise<NodeInfo> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        options,
      },
      nodeInfoSchema,
    );
  }

  public async getStats(options?: RequestOptions): Promise<NodeStats> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: "stats",
        options,
      },
      nodeStatsSchema,
    );
  }

  public async getPolicies(options?: RequestOptions): Promise<NodePolicies[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: "node/policies/repos",
        options,
      },
      z.array(nodePoliciesSchema),
    );
  }

  public async getPolicyByRid(
    rid: string,
    options?: RequestOptions,
  ): Promise<SeedingPolicy> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `node/policies/repos/${rid}`,
        options,
      },
      seedingPolicySchema,
    );
  }

  public async getNode(options?: RequestOptions): Promise<Node> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: "node",
        options,
      },
      nodeSchema,
    );
  }

  public async getInfo(options?: RequestOptions): Promise<Info> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: "info",
        options,
      },
      infoSchema,
    );
  }

  public async getNodeIdentity(
    nid: string,
    options?: RequestOptions,
  ): Promise<NodeIdentity> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `nodes/${nid}`,
        options,
      },
      nodeIdentitySchema,
    );
  }

  public async getNodeInventory(
    nid: string,
    options?: RequestOptions,
  ): Promise<string[]> {
    return this.#fetcher.fetchOk(
      {
        method: "GET",
        path: `nodes/${nid}/inventory`,
        options,
      },
      z.array(z.string()),
    );
  }
}
