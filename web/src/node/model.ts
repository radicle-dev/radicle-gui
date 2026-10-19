import type { Snapshot } from "./diff";
import type { OrgKey, PersonKey } from "./seeds/types";

export type { OrgKey, PersonKey };

// Ryph agents act on Radicle through their instance's node, so they show up
// as people too.
export type AgentKey = "agent-mender" | "agent-scout" | "agent-sweeper";

// Person keys are open-ended at runtime: seeded people, agents and "self".
export type PersonId = PersonKey | AgentKey;

export interface Person {
  id: PersonId;
  nid: string;
  did: string;
  alias: string;
  name: string;
  bio: string;
  pronouns?: string;
  location?: string;
  timezone?: string;
  website?: string;
  keys: number;
}

export interface OrgMember {
  person: PersonId;
  role: "admin" | "member";
  since: number;
}

export type ProposalChange =
  | { type: "addMember"; person: PersonId; role: "admin" | "member" }
  | { type: "removeMember"; person: PersonId }
  | { type: "editProfile"; field: "name" | "description" | "website"; value: string }
  | { type: "setThreshold"; threshold: number };

export interface Proposal {
  id: string;
  title: string;
  author: PersonId;
  time: number;
  change: ProposalChange;
  approvals: PersonId[];
  rejections: PersonId[];
  state: "open" | "applied" | "rejected";
}

export interface Org {
  id: OrgKey | string;
  handle: string;
  name: string;
  description: string;
  website?: string;
  location?: string;
  rid: string;
  members: OrgMember[];
  threshold: number;
  proposals: Proposal[];
  created: number;
}

export type Owner = { type: "person"; id: PersonId } | { type: "org"; id: string };

export interface Commit {
  id: string;
  parents: string[];
  author: PersonId;
  time: number;
  message: string;
  summary: string;
}

export interface Reaction {
  emoji: string;
  by: PersonId[];
}

export interface CodeLocation {
  path: string;
  line: number;
  endLine?: number;
}

export interface Comment {
  id: string;
  author: PersonId;
  body: string;
  time: number;
  replyTo?: string;
  reactions: Reaction[];
  location?: CodeLocation;
  resolved?: boolean;
  edited?: boolean;
}

export type IssueState = "open" | "solved" | "closed";

// Changes to an issue or patch other than comments, shown in the timeline.
export type CobEvent = { author: PersonId; time: number } & (
  | { kind: "labels"; added: string[]; removed: string[] }
  | { kind: "assign"; added: PersonId[]; removed: PersonId[] }
  | { kind: "state"; state: IssueState | PatchState }
  | { kind: "title"; title: string }
);

export interface Issue {
  id: string;
  title: string;
  author: PersonId;
  time: number;
  body: string;
  labels: string[];
  assignees: PersonId[];
  state: IssueState;
  closedAt?: number;
  comments: Comment[];
  events: CobEvent[];
}

export interface Review {
  id: string;
  author: PersonId;
  time: number;
  verdict?: "accept" | "reject";
  summary: string;
  comments: Comment[];
}

export interface Check {
  name: string;
  status: "queued" | "running" | "passed" | "failed";
  durationSec?: number;
}

export interface Revision {
  id: string;
  author: PersonId;
  time: number;
  description: string;
  base: string;
  head: string;
  commits: string[];
  reviews: Review[];
  comments: Comment[];
  // Agentic CI results from Ryph, when the repo is connected.
  checks?: Check[];
}

export type PatchState = "open" | "draft" | "archived" | "merged";

export interface Patch {
  id: string;
  title: string;
  author: PersonId;
  time: number;
  labels: string[];
  state: PatchState;
  mergedAt?: number;
  mergedBy?: PersonId;
  revisions: Revision[];
  events: CobEvent[];
}

export interface Artifact {
  name: string;
  sizeBytes: number;
  cid: string;
}

export interface Release {
  id: string;
  tag: string;
  commit: string;
  title: string;
  notes: string;
  author: PersonId;
  time: number;
  artifacts: Artifact[];
}

export interface Tag {
  name: string;
  commit: string;
  time: number;
}

export interface CanonicalRefRule {
  pattern: string;
  threshold: number;
  // "delegates", or the specific people whose refs count.
  allow: "delegates" | PersonId[];
}

// The repository identity document: who the delegates are and the rules
// everyone's node uses to decide what is canonical.
export interface IdentityDoc {
  name: string;
  description: string;
  defaultBranch: string;
  delegates: PersonId[];
  threshold: number;
  visibility: "public" | "private";
  allow: PersonId[];
  canonicalRefs: CanonicalRefRule[];
}

export type IdentityChange =
  | { type: "addDelegate"; person: PersonId }
  | { type: "removeDelegate"; person: PersonId }
  | { type: "setThreshold"; threshold: number }
  | { type: "setVisibility"; visibility: "public" | "private" }
  | { type: "setDescription"; description: string }
  | { type: "setDefaultBranch"; branch: string }
  | { type: "init" };

export interface IdentityRevision {
  id: string;
  title: string;
  description: string;
  author: PersonId;
  time: number;
  parent?: string;
  state: "active" | "accepted" | "rejected";
  accepted: PersonId[];
  rejected: PersonId[];
  changes: IdentityChange[];
  // The document as it stands if this revision is adopted.
  doc: IdentityDoc;
}

// One peer's copy of the repository: the branches they've published.
export interface Remote {
  person: PersonId;
  branches: Record<string, string>;
}

export interface Repo {
  rid: string;
  name: string;
  owner: Owner;
  description: string;
  defaultBranch: string;
  visibility: "public" | "private";
  delegates: PersonId[];
  threshold: number;
  seedCount: number;
  commits: Record<string, Commit>;
  snapshots: Record<string, Snapshot>;
  // Canonical branches, as the delegates agree on them.
  branches: Record<string, string>;
  remotes: Remote[];
  tags: Tag[];
  issues: Issue[];
  patches: Patch[];
  releases: Release[];
  created: number;
  identity: { current: string; revisions: IdentityRevision[] };
}

export interface RyphAgent {
  id: AgentKey;
  handle: string;
  name: string;
  does: string;
  model: string;
}

export interface RyphConnection {
  instance: string;
  connectedBy: PersonId;
  connectedAt: number;
  agents: AgentKey[];
  checks: string[];
  // Besides delegates, who may summon agents.
  allowlist: PersonId[];
}

export type RyphRunKind = "fix" | "review" | "research" | "triage";

export interface RyphRun {
  id: string;
  rid: string;
  agent: AgentKey;
  requestedBy: PersonId;
  thread: { kind: "issue" | "patch"; id: string; title: string };
  instruction: string;
  kind: RyphRunKind;
  startedAt: number;
  // Seconds after start each step completes; the run is done after the last.
  plan: { label: string; at: number }[];
  checks: string[];
  // Set once the run has delivered.
  deliveredAt?: number;
  patch?: string;
  summary?: string;
}

export interface World {
  epoch: number;
  people: Record<string, Person>;
  orgs: Record<string, Org>;
  repos: Record<string, Repo>;
  ryph: {
    agents: Record<string, RyphAgent>;
    connections: Record<string, RyphConnection>;
    runs: RyphRun[];
  };
}
