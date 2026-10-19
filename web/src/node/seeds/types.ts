// Declarative content for the simulated browser node. A seed describes a
// repository the way a person would remember it: files, a commit history,
// discussions and patches. The node turns seeds into real git-like state
// (commit graph, file snapshots, diffs) and collaborative objects at boot.
//
// Time is relative: `daysAgo` / `hoursAfter` are resolved against the moment
// the node first boots, so the prototype always looks freshly active.

// People on the simulated network. "self" is whoever created an identity in
// this browser; its alias and DID are only known at runtime.
export type PersonKey =
  | "self"
  | "ada"
  | "mira"
  | "tomas"
  | "yuki"
  | "sol"
  | "kofi"
  | "lena"
  | "oskar";

// A file's new content in a commit:
// - string: the complete new content
// - null: the file is deleted
// - Edit[]: find/replace pairs applied in order to the previous content;
//   each `find` must occur exactly once in the file
export type Edit = [find: string, replace: string];
export type FileChange = string | null | Edit[];

export interface CommitSeed {
  // Optional handle so other parts of the seed (patches, tags, releases) can
  // refer to this commit.
  label?: string;
  // Full commit message: summary line, blank line, body.
  message: string;
  author: PersonKey;
  daysAgo: number;
  changes: Record<string, FileChange>;
}

export interface Reaction {
  emoji: string;
  by: PersonKey[];
}

export interface CommentSeed {
  author: PersonKey;
  body: string;
  // Offset from the parent object's creation.
  hoursAfter: number;
  // Index into the same comments array this one replies to.
  replyTo?: number;
  reactions?: Reaction[];
}

export interface IssueSeed {
  title: string;
  author: PersonKey;
  daysAgo: number;
  body: string;
  labels?: string[];
  assignees?: PersonKey[];
  state?: "open" | "solved" | "closed";
  // Hours after creation when the issue was closed, if closed.
  closedHoursAfter?: number;
  comments?: CommentSeed[];
}

export interface CodeCommentSeed {
  body: string;
  // Path and 1-based line number in the revision's head version of the file.
  path: string;
  line: number;
  // Optional end line for a multi-line range.
  endLine?: number;
  resolved?: boolean;
}

export interface ReviewSeed {
  author: PersonKey;
  hoursAfter: number;
  verdict?: "accept" | "reject";
  summary: string;
  comments?: CodeCommentSeed[];
}

export interface RevisionSeed {
  description: string;
  // Hours after the patch was opened that this revision was pushed. The first
  // revision is always at 0.
  hoursAfter: number;
  // Either new commits stacked on top of `base` (default: the default branch
  // head at the time) or, for a merged patch, labels of commits that already
  // exist in the default-branch history (in order).
  base?: string;
  commits?: CommitSeed[];
  fromHistory?: string[];
  reviews?: ReviewSeed[];
  // Discussion on this revision (top-level patch comments).
  comments?: CommentSeed[];
}

export interface PatchSeed {
  title: string;
  author: PersonKey;
  daysAgo: number;
  labels?: string[];
  state: "open" | "draft" | "archived" | "merged";
  // Each revision builds on the previous one when it has no explicit base.
  revisions: RevisionSeed[];
}

export interface ArtifactSeed {
  name: string;
  sizeBytes: number;
}

export interface ReleaseSeed {
  // Tag name, e.g. "v0.4.0". An annotated tag is created at `at`.
  tag: string;
  // Commit label in the default-branch history.
  at: string;
  title: string;
  notes: string;
  author: PersonKey;
  daysAgo: number;
  artifacts?: ArtifactSeed[];
}

// Organisations are actor repositories with several members. Changes to the
// org (members, profile) need `threshold` member approvals.
export type OrgKey = "lumen-labs" | "tidal-collective" | "fieldwork-studio";

export interface PersonSeed {
  key: PersonKey;
  alias: string;
  name: string;
  bio: string;
  pronouns?: string;
  location?: string;
  timezone?: string;
  website?: string;
  // Rough number of devices/keys this person has enrolled.
  keys: number;
}

export interface OrgSeed {
  key: OrgKey;
  handle: string;
  name: string;
  description: string;
  website?: string;
  location?: string;
  members: { person: PersonKey; role: "admin" | "member" }[];
  threshold: number;
  // Whether "self" is a member; if not, self merely follows the org.
  selfMember: boolean;
}

export interface RepoSeed {
  // Who owns the repository: a person or an org.
  owner: { person: PersonKey } | { org: OrgKey };
  name: string;
  description: string;
  defaultBranch: string;
  visibility: "public" | "private";
  delegates: PersonKey[];
  threshold: number;
  // How many nodes on the network seed it.
  seeding: number;
  // Initial snapshot (root commit content).
  files: Record<string, string>;
  // The root commit, then each later commit on the default branch, oldest
  // first.
  root: Omit<CommitSeed, "changes">;
  history: CommitSeed[];
  // Extra branches people pushed, outside patches.
  branches?: { name: string; owner: PersonKey; from: string; commits: CommitSeed[] }[];
  issues: IssueSeed[];
  patches: PatchSeed[];
  releases?: ReleaseSeed[];
}
