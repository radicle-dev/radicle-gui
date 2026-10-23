import type { LocalIdentity } from "./identity";
import type {
  Comment,
  Issue,
  IssueState,
  Org,
  Owner,
  Patch,
  Person,
  PersonId,
  ProposalChange,
  Repo,
  Revision,
  World,
} from "./model";

import type { AgentKey, IdentityChange, Repo as RepoT, RyphRun } from "./model";

import { applyIdentityChange, majority, seedIdentity } from "./repoIdentity";

import { DAY, buildWorld, HOUR } from "./world";
import {
  AGENTS,
  checksFor,
  fixChanges,
  kindFor,
  plan,
  researchWriteUp,
  reviewChanges,
  runDuration,
  runState,
} from "./ryph";
import { DEFAULT_COLUMNS } from "./board";
import { oid, ridFor } from "./hash";
import { Network } from "./network.svelte";
import { navigate } from "@app/lib/router.svelte";
import { toast } from "@app/lib/toast.svelte";
import { initialFollowing, initialSeeding, seeds } from "./seeds";

const STORAGE_KEY = "radicle2:v1";

// Every change the user makes is recorded as an op and replayed on top of the
// seeded world at boot, so the prototype remembers what you did.
export type Op = { at: number } & (
  | { type: "createIssue"; rid: string; title: string; body: string; labels: string[] }
  | { type: "issueComment"; rid: string; issue: string; body: string; replyTo?: string }
  | { type: "issueState"; rid: string; issue: string; state: IssueState }
  | { type: "moveCard"; rid: string; kind: "issue" | "patch"; id: string; column: string; position: number }
  | {
      type: "editCob";
      rid: string;
      kind: "issue" | "patch";
      id: string;
      title?: string;
      labels?: string[];
      assignees?: PersonId[];
    }
  | { type: "patchComment"; rid: string; patch: string; body: string; replyTo?: string }
  | { type: "react"; rid: string; comment: string; emoji: string }
  | {
      type: "review";
      rid: string;
      patch: string;
      verdict?: "accept" | "reject";
      summary: string;
      comments: { path: string; line: number; body: string }[];
    }
  | { type: "resolveComment"; rid: string; comment: string; resolved: boolean }
  | { type: "mergePatch"; rid: string; patch: string }
  | { type: "patchState"; rid: string; patch: string; state: "open" | "draft" | "archived" }
  | { type: "seed"; rid: string; on: boolean }
  | { type: "follow"; id: string; on: boolean }
  | { type: "profile"; name: string; bio: string; pronouns?: string; location?: string; website?: string }
  | { type: "createOrg"; handle: string; name: string; description: string; invite: PersonId[]; threshold: number }
  | { type: "propose"; org: string; change: ProposalChange; title: string }
  | { type: "vote"; org: string; proposal: string; approve: boolean }
  | {
      type: "createRepo";
      name: string;
      description: string;
      visibility: "public" | "private";
      owner: Owner;
      readme: string;
    }
  | { type: "readInbox"; ids: string[] }
  | { type: "unreadInbox"; ids: string[] }
  | { type: "ryphConnect"; rid: string; instance: string; agents: AgentKey[] }
  | { type: "ryphDisconnect"; rid: string }
  | { type: "ryphDeliver"; run: string }
  | { type: "idPropose"; rid: string; title: string; description: string; changes: IdentityChange[] }
  | { type: "idVote"; rid: string; revision: string; approve: boolean }
);

export type OpInput = Op extends infer O ? (O extends Op ? Omit<O, "at"> : never) : never;

interface Stored {
  identity: LocalIdentity;
  epoch: number;
  ops: Op[];
}

export interface InboxItem {
  id: string;
  time: number;
  actor: PersonId;
  kind:
    | "issue.opened"
    | "issue.comment"
    | "issue.closed"
    | "patch.opened"
    | "patch.revision"
    | "patch.review"
    | "patch.comment"
    | "patch.merged"
    | "org.proposal"
    | "mention"
    | "ryph"
    | "identity";
  text: string;
  rid?: string;
  org?: string;
  target?: { kind: "issue" | "patch"; id: string; title: string };
  // Why it's in your inbox.
  reason: "author" | "delegate" | "participant" | "mention" | "member" | "review" | "ryph";
  needsYou: boolean;
}

function load(): Stored | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : undefined;
  } catch {
    return undefined;
  }
}

function emptyWorld(): World {
  return {
    epoch: 0,
    people: {},
    orgs: {},
    repos: {},
    ryph: { agents: {}, connections: {}, runs: [] },
  };
}

class BrowserNode {
  identity = $state<LocalIdentity | undefined>(undefined);
  world = $state<World>(emptyWorld());
  now = $state(Date.now());
  seeding = $state<Record<string, boolean>>({});
  following = $state<Record<string, boolean>>({});
  read = $state<Record<string, boolean>>({});
  ops: Op[] = [];
  network = new Network();

  constructor() {
    const stored = load();
    if (stored) this.#boot(stored);
    this.network.configure(
      () => this.seededRepos.map(r => ({ rid: r.rid, name: r.name })),
      p => this.person(p).alias,
    );
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        this.network.tabVisible = document.visibilityState === "visible";
      });
      setInterval(() => this.#tick(), 1000);
    }
  }

  #boot(stored: Stored) {
    this.identity = stored.identity;
    const world = buildWorld(stored.epoch, stored.identity, seeds);
    const seeding: Record<string, boolean> = {};
    for (const repo of Object.values(world.repos)) {
      seeding[repo.rid] = initialSeeding.includes(repo.name);
    }
    const following: Record<string, boolean> = {};
    for (const id of initialFollowing) following[id] = true;

    this.world = world;
    this.seeding = seeding;
    this.following = following;
    this.read = {};
    this.ops = [];
    for (const op of stored.ops) this.#apply(op);
    this.ops = stored.ops;
    this.network.start();
  }

  #persist() {
    if (!this.identity) return;
    const stored: Stored = {
      identity: this.identity,
      epoch: this.world.epoch,
      ops: this.ops,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      console.warn("Could not persist node state", e);
    }
  }

  get ready(): boolean {
    return this.identity !== undefined;
  }

  createIdentity(identity: LocalIdentity) {
    this.#boot({ identity, epoch: Date.now(), ops: [] });
    this.#persist();
  }

  updateIdentity(patch: Partial<LocalIdentity>) {
    if (!this.identity) return;
    this.identity = { ...this.identity, ...patch };
    this.#persist();
  }

  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.network.stop();
    this.identity = undefined;
    this.world = emptyWorld();
  }

  // Runs a user action: applies it and records it.
  do(input: OpInput): string | undefined {
    const op = { ...input, at: Date.now() } as Op;
    const result = this.#apply(op);
    this.ops = [...this.ops, op];
    this.#persist();
    return result;
  }

  // ---- Lookups -------------------------------------------------------------

  person(id: string): Person {
    return (
      this.world.people[id] ?? {
        id,
        nid: id,
        did: `did:key:${id}`,
        alias: id,
        name: id,
        bio: "",
        keys: 1,
      }
    );
  }

  personByAlias(alias: string): Person | undefined {
    return Object.values(this.world.people).find(p => p.alias === alias);
  }

  org(id: string): Org | undefined {
    return this.world.orgs[id];
  }

  orgByHandle(handle: string): Org | undefined {
    return Object.values(this.world.orgs).find(o => o.handle === handle);
  }

  ownerHandle(owner: Owner): string {
    return owner.type === "org"
      ? (this.world.orgs[owner.id]?.handle ?? owner.id)
      : `@${this.person(owner.id).alias}`;
  }

  repoPath(repo: Repo): string {
    const owner =
      repo.owner.type === "org"
        ? (this.world.orgs[repo.owner.id]?.handle ?? repo.owner.id)
        : `@${this.person(repo.owner.id).alias}`;
    return `/${owner}/${repo.name}`;
  }

  repoByPath(owner: string, name: string): Repo | undefined {
    return Object.values(this.world.repos).find(
      r => r.name === name && this.repoPath(r) === `/${owner}/${name}`,
    );
  }

  get repos(): Repo[] {
    return Object.values(this.world.repos);
  }

  get seededRepos(): Repo[] {
    return this.repos.filter(r => this.seeding[r.rid]);
  }

  // Orgs the user is a member of.
  get myOrgs(): Org[] {
    return Object.values(this.world.orgs).filter(o =>
      o.members.some(m => m.person === "self"),
    );
  }

  reposOf(owner: Owner): Repo[] {
    return this.repos.filter(
      r => r.owner.type === owner.type && r.owner.id === owner.id,
    );
  }

  orgsOf(person: PersonId): Org[] {
    return Object.values(this.world.orgs).filter(o =>
      o.members.some(m => m.person === person),
    );
  }

  isDelegate(repo: Repo, person: PersonId = "self"): boolean {
    return repo.delegates.includes(person);
  }

  head(repo: Repo): string {
    return repo.branches[repo.defaultBranch];
  }

  // Commits reachable from `from`, newest first.
  history(repo: Repo, from: string = this.head(repo)): string[] {
    const out: string[] = [];
    let cursor: string | undefined = from;
    while (cursor && repo.commits[cursor]) {
      out.push(cursor);
      cursor = repo.commits[cursor].parents[0];
    }
    return out;
  }

  latestRevision(patch: Patch): Revision {
    return patch.revisions[patch.revisions.length - 1];
  }

  findComment(
    repo: Repo,
    commentId: string,
  ): Comment | undefined {
    for (const issue of repo.issues) {
      const c = issue.comments.find(c => c.id === commentId);
      if (c) return c;
    }
    for (const patch of repo.patches) {
      for (const rev of patch.revisions) {
        const c =
          rev.comments.find(c => c.id === commentId) ??
          rev.reviews.flatMap(r => r.comments).find(c => c.id === commentId);
        if (c) return c;
      }
    }
    return undefined;
  }

  // Everything that happened recently that the user should know about.
  get inbox(): InboxItem[] {
    const items: InboxItem[] = [];
    const since = Date.now() - 30 * DAY;
    const mentions = (body: string) =>
      this.identity ? body.includes(`@${this.identity.alias}`) : false;

    for (const repo of this.repos) {
      const delegate = this.isDelegate(repo);
      for (const issue of repo.issues) {
        const involved =
          delegate ||
          issue.author === "self" ||
          issue.assignees.includes("self") ||
          issue.comments.some(c => c.author === "self");
        const target = { kind: "issue" as const, id: issue.id, title: issue.title };
        const reason =
          issue.author === "self"
            ? "author"
            : issue.assignees.includes("self")
              ? "participant"
              : delegate
                ? "delegate"
                : "participant";
        if (involved && issue.author !== "self" && issue.time > since) {
          items.push({
            id: `${issue.id}:open`,
            time: issue.time,
            actor: issue.author,
            kind: "issue.opened",
            text: "opened an issue",
            rid: repo.rid,
            target,
            reason,
            // A bug needs triage until a delegate replies or someone is assigned.
            needsYou:
              delegate &&
              issue.state === "open" &&
              issue.labels.includes("bug") &&
              issue.assignees.length === 0 &&
              !issue.comments.some(c => repo.delegates.includes(c.author)),
          });
        }
        for (const c of issue.comments) {
          if (c.author === "self" || c.time < since) continue;
          const mentioned = mentions(c.body);
          if (!involved && !mentioned) continue;
          items.push({
            id: c.id,
            time: c.time,
            actor: c.author,
            kind: mentioned ? "mention" : "issue.comment",
            text: mentioned ? "mentioned you" : "commented",
            rid: repo.rid,
            target,
            reason: mentioned ? "mention" : reason,
            needsYou: mentioned,
          });
        }
      }
      for (const patch of repo.patches) {
        const target = { kind: "patch" as const, id: patch.id, title: patch.title };
        const mine = patch.author === "self";
        const reviewed = patch.revisions.some(r =>
          r.reviews.some(v => v.author === "self"),
        );
        const involved = delegate || mine || reviewed;
        if (!involved) continue;
        const reason = mine ? "author" : delegate ? "review" : "participant";
        const latest = this.latestRevision(patch);
        const awaitingMyReview =
          delegate &&
          !mine &&
          patch.state === "open" &&
          !latest.reviews.some(v => v.author === "self");
        patch.revisions.forEach((rev, i) => {
          if (rev.time > since && !mine) {
            items.push({
              id: `${rev.id}:rev`,
              time: rev.time,
              actor: rev.author,
              kind: i === 0 ? "patch.opened" : "patch.revision",
              text:
                i === 0
                  ? "opened a patch"
                  : `pushed revision ${i + 1}`,
              rid: repo.rid,
              target,
              reason,
              needsYou: awaitingMyReview && rev === latest,
            });
          }
          for (const review of rev.reviews) {
            if (review.author === "self" || review.time < since) continue;
            items.push({
              id: review.id,
              time: review.time,
              actor: review.author,
              kind: "patch.review",
              text:
                review.verdict === "accept"
                  ? "approved"
                  : review.verdict === "reject"
                    ? "requested changes"
                    : "reviewed",
              rid: repo.rid,
              target,
              reason,
              needsYou: mine && review.verdict === "reject" && rev === latest,
            });
          }
          for (const c of rev.comments) {
            if (c.author === "self" || c.time < since) continue;
            items.push({
              id: c.id,
              time: c.time,
              actor: c.author,
              kind: mentions(c.body) ? "mention" : "patch.comment",
              text: mentions(c.body) ? "mentioned you" : "commented",
              rid: repo.rid,
              target,
              reason,
              needsYou: mentions(c.body),
            });
          }
        });
        if (patch.state === "merged" && patch.mergedAt && patch.mergedAt > since && mine) {
          items.push({
            id: `${patch.id}:merged`,
            time: patch.mergedAt,
            actor: repo.delegates.find(d => d !== "self") ?? "self",
            kind: "patch.merged",
            text: "merged your patch",
            rid: repo.rid,
            target,
            reason: "author",
            needsYou: false,
          });
        }
      }
    }
    for (const org of this.myOrgs) {
      for (const p of org.proposals) {
        if (p.state !== "open" || p.author === "self") continue;
        items.push({
          id: p.id,
          time: p.time,
          actor: p.author,
          kind: "org.proposal",
          text: `proposed a change to ${org.name}`,
          org: org.id,
          reason: "member",
          needsYou: !p.approvals.includes("self") && !p.rejections.includes("self"),
        });
      }
    }
    for (const repo of this.repos) {
      const current = this.currentIdentity(repo);
      if (!current?.doc.delegates.includes("self")) continue;
      for (const rev of this.pendingIdentity(repo)) {
        if (rev.author === "self") continue;
        items.push({
          id: rev.id,
          time: rev.time,
          actor: rev.author,
          kind: "identity",
          text: "proposed an identity change",
          rid: repo.rid,
          reason: "delegate",
          needsYou: !rev.accepted.includes("self") && !rev.rejected.includes("self"),
        });
      }
    }
    for (const run of this.world.ryph.runs) {
      if (run.requestedBy !== "self" || run.deliveredAt === undefined) continue;
      const repo = this.world.repos[run.rid];
      const patch = run.patch ? repo?.patches.find(p => p.id === run.patch) : undefined;
      items.push({
        id: `ryph:${run.id}`,
        time: run.deliveredAt,
        actor: run.agent,
        kind: "ryph",
        text: run.kind === "fix" ? "opened a patch for you" : run.kind === "review" ? "addressed the review" : "finished",
        rid: run.rid,
        target: patch
          ? { kind: "patch", id: patch.id, title: patch.title }
          : { kind: run.thread.kind, id: run.thread.id, title: run.thread.title },
        reason: "ryph",
        needsYou: !!patch && patch.state === "open" && run.kind === "fix",
      });
    }
    return items.sort((a, b) => b.time - a.time);
  }

  get unreadCount(): number {
    return this.inbox.filter(i => !this.read[i.id]).length;
  }

  // ---- Applying ops ----------------------------------------------------------

  #repo(rid: string): Repo {
    const repo = this.world.repos[rid];
    if (!repo) throw new Error(`Unknown repository ${rid}`);
    return repo;
  }

  #issue(rid: string, id: string): Issue {
    const issue = this.#repo(rid).issues.find(i => i.id === id);
    if (!issue) throw new Error(`Unknown issue ${id}`);
    return issue;
  }

  #patch(rid: string, id: string): Patch {
    const patch = this.#repo(rid).patches.find(p => p.id === id);
    if (!patch) throw new Error(`Unknown patch ${id}`);
    return patch;
  }

  #newComment(op: Op, body: string, replyTo?: string): Comment {
    return {
      id: oid("op", op.at, op.type, body),
      author: "self",
      body,
      time: op.at,
      replyTo,
      reactions: [],
    };
  }

  #apply(op: Op): string | undefined {
    try {
      return this.#applyUnsafe(op);
    } catch (e) {
      console.warn("Skipping op that no longer applies", op, e);
      return undefined;
    }
  }

  #applyUnsafe(op: Op): string | undefined {
    switch (op.type) {
      case "createIssue": {
        const id = oid("op", op.at, "issue", op.title);
        this.#repo(op.rid).issues.unshift({
          id,
          title: op.title,
          author: "self",
          time: op.at,
          body: op.body,
          labels: op.labels,
          assignees: [],
          state: "open",
          comments: [],
          events: op.labels.length
            ? [{ kind: "labels", author: "self", time: op.at, added: op.labels, removed: [] }]
            : [],
        });
        return id;
      }
      case "issueComment": {
        const issue = this.#issue(op.rid, op.issue);
        const comment = this.#newComment(op, op.body, op.replyTo);
        issue.comments.push(comment);
        this.#summon(op, op.rid, { kind: "issue", id: issue.id, title: issue.title }, op.body, comment.id);
        return comment.id;
      }
      case "issueState": {
        const issue = this.#issue(op.rid, op.issue);
        issue.state = op.state;
        issue.closedAt = op.state === "open" ? undefined : op.at;
        issue.events.push({ kind: "state", author: "self", time: op.at, state: op.state });
        return;
      }
      case "moveCard": {
        const repo = this.#repo(op.rid);
        repo.board ??= { columns: DEFAULT_COLUMNS.map(c => ({ ...c })), cards: [] };
        repo.board.cards = repo.board.cards.filter(c => !(c.kind === op.kind && c.id === op.id));
        repo.board.cards.push({
          kind: op.kind,
          id: op.id,
          column: op.column,
          position: op.position,
          movedBy: "self",
          movedAt: op.at,
        });
        return;
      }
      case "editCob": {
        const cob =
          op.kind === "issue" ? this.#issue(op.rid, op.id) : this.#patch(op.rid, op.id);
        if (op.title !== undefined && op.title !== cob.title) {
          cob.title = op.title;
          cob.events.push({ kind: "title", author: "self", time: op.at, title: op.title });
        }
        if (op.labels) {
          const added = op.labels.filter(l => !cob.labels.includes(l));
          const removed = cob.labels.filter(l => !op.labels!.includes(l));
          cob.labels = op.labels;
          if (added.length || removed.length) {
            cob.events.push({ kind: "labels", author: "self", time: op.at, added, removed });
          }
        }
        if (op.assignees && op.kind === "issue") {
          const issue = cob as Issue;
          const added = op.assignees.filter(a => !issue.assignees.includes(a));
          const removed = issue.assignees.filter(a => !op.assignees!.includes(a));
          issue.assignees = op.assignees;
          if (added.length || removed.length) {
            issue.events.push({ kind: "assign", author: "self", time: op.at, added, removed });
          }
        }
        return;
      }
      case "patchComment": {
        const patch = this.#patch(op.rid, op.patch);
        const comment = this.#newComment(op, op.body, op.replyTo);
        this.latestRevision(patch).comments.push(comment);
        this.#summon(op, op.rid, { kind: "patch", id: patch.id, title: patch.title }, op.body, comment.id);
        return comment.id;
      }
      case "react": {
        const comment = this.findComment(this.#repo(op.rid), op.comment);
        if (!comment) return;
        const reaction = comment.reactions.find(r => r.emoji === op.emoji);
        if (!reaction) {
          comment.reactions.push({ emoji: op.emoji, by: ["self"] });
        } else if (reaction.by.includes("self")) {
          reaction.by = reaction.by.filter(p => p !== "self");
          if (reaction.by.length === 0) {
            comment.reactions = comment.reactions.filter(r => r !== reaction);
          }
        } else {
          reaction.by.push("self");
        }
        return;
      }
      case "review": {
        const rev = this.latestRevision(this.#patch(op.rid, op.patch));
        const id = oid("op", op.at, "review");
        rev.reviews = rev.reviews.filter(r => r.author !== "self");
        rev.reviews.push({
          id,
          author: "self",
          time: op.at,
          verdict: op.verdict,
          summary: op.summary,
          comments: op.comments.map((c, i) => ({
            id: oid(id, "code", i),
            author: "self",
            body: c.body,
            time: op.at,
            reactions: [],
            location: { path: c.path, line: c.line },
            resolved: false,
          })),
        });
        return id;
      }
      case "resolveComment": {
        const comment = this.findComment(this.#repo(op.rid), op.comment);
        if (comment) comment.resolved = op.resolved;
        return;
      }
      case "mergePatch": {
        const repo = this.#repo(op.rid);
        const patch = this.#patch(op.rid, op.patch);
        const rev = this.latestRevision(patch);
        const head = this.head(repo);
        if (rev.base === head) {
          repo.branches[repo.defaultBranch] = rev.head;
        } else {
          // Fast-forward isn't possible: record a merge commit whose tree is
          // the patch applied on top of the current head.
          const merged = { ...repo.snapshots[head] };
          const before = repo.snapshots[rev.base];
          const after = repo.snapshots[rev.head];
          for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
            if (before[path] === after[path]) continue;
            if (after[path] === undefined) delete merged[path];
            else merged[path] = after[path];
          }
          const id = oid("op", op.at, "merge", patch.id);
          repo.commits[id] = {
            id,
            parents: [head, rev.head],
            author: "self",
            time: op.at,
            message: `Merge patch "${patch.title}"`,
            summary: `Merge patch "${patch.title}"`,
          };
          repo.snapshots[id] = merged;
          repo.branches[repo.defaultBranch] = id;
        }
        patch.state = "merged";
        patch.mergedAt = op.at;
        patch.mergedBy = "self";
        this.#publish(repo, "self", repo.defaultBranch, repo.branches[repo.defaultBranch]);
        return;
      }
      case "patchState": {
        const patch = this.#patch(op.rid, op.patch);
        patch.state = op.state;
        patch.events.push({ kind: "state", author: "self", time: op.at, state: op.state });
        return;
      }
      case "seed": {
        this.seeding[op.rid] = op.on;
        const repo = this.world.repos[op.rid];
        if (repo) {
          repo.seedCount += op.on ? 1 : -1;
          if (op.on && this.network.status === "online") {
            this.network.log("fetch", `Started seeding ${repo.name}`, repo.rid);
          }
        }
        return;
      }
      case "follow": {
        this.following[op.id] = op.on;
        return;
      }
      case "profile": {
        const self = this.world.people.self;
        self.name = op.name;
        self.bio = op.bio;
        self.pronouns = op.pronouns;
        self.location = op.location;
        self.website = op.website;
        return;
      }
      case "createOrg": {
        const id = `org-${op.handle}`;
        this.world.orgs[id] = {
          id,
          handle: op.handle,
          name: op.name,
          description: op.description,
          rid: ridFor(`org:${op.handle}:${op.at}`),
          members: [{ person: "self", role: "admin", since: op.at }],
          threshold: op.threshold,
          proposals: op.invite.map(person => ({
            id: oid("op", op.at, "invite", person),
            title: `Invite ${this.person(person).alias}`,
            author: "self",
            time: op.at,
            change: { type: "addMember", person, role: "member" },
            approvals: ["self"],
            rejections: [],
            state: "open",
          })),
          created: op.at,
        };
        return id;
      }
      case "propose": {
        const org = this.world.orgs[op.org];
        if (!org) return;
        const id = oid("op", op.at, "proposal");
        org.proposals.unshift({
          id,
          title: op.title,
          author: "self",
          time: op.at,
          change: op.change,
          approvals: ["self"],
          rejections: [],
          state: "open",
        });
        this.#settle(org);
        return id;
      }
      case "vote": {
        const org = this.world.orgs[op.org];
        const proposal = org?.proposals.find(p => p.id === op.proposal);
        if (!org || !proposal || proposal.state !== "open") return;
        proposal.approvals = proposal.approvals.filter(p => p !== "self");
        proposal.rejections = proposal.rejections.filter(p => p !== "self");
        (op.approve ? proposal.approvals : proposal.rejections).push("self");
        this.#settle(org);
        return;
      }
      case "createRepo": {
        const rid = ridFor(`new:${op.name}:${op.at}`);
        const commit = oid(rid, "root");
        this.world.repos[rid] = {
          rid,
          name: op.name,
          owner: op.owner,
          description: op.description,
          defaultBranch: "main",
          visibility: op.visibility,
          delegates: ["self"],
          threshold: 1,
          seedCount: 1,
          commits: {
            [commit]: {
              id: commit,
              parents: [],
              author: "self",
              time: op.at,
              message: "Initial commit",
              summary: "Initial commit",
            },
          },
          snapshots: { [commit]: { "README.md": op.readme } },
          branches: { main: commit },
          remotes: [{ person: "self", branches: { main: commit } }],
          tags: [],
          issues: [],
          patches: [],
          releases: [],
          created: op.at,
          identity: { current: "", revisions: [] },
        };
        this.world.repos[rid].identity = seedIdentity(this.world.repos[rid], "self");
        this.seeding[rid] = true;
        return rid;
      }
      case "ryphConnect": {
        const repo = this.#repo(op.rid);
        this.world.ryph.connections[op.rid] = {
          instance: op.instance,
          connectedBy: "self",
          connectedAt: op.at,
          agents: op.agents,
          checks: checksFor(repo),
          allowlist: [],
        };
        return;
      }
      case "ryphDisconnect": {
        delete this.world.ryph.connections[op.rid];
        return;
      }
      case "ryphDeliver": {
        const run = this.world.ryph.runs.find(r => r.id === op.run);
        if (run && run.deliveredAt === undefined) this.#deliver(run, op.at);
        return;
      }
      case "idPropose": {
        const repo = this.#repo(op.rid);
        const current = this.currentIdentity(repo);
        let doc = current.doc;
        for (const c of op.changes) doc = applyIdentityChange(doc, c);
        const id = oid("op", op.at, "identity", op.title);
        repo.identity.revisions.push({
          id,
          title: op.title,
          description: op.description,
          author: "self",
          time: op.at,
          parent: current.id,
          state: "active",
          accepted: ["self"],
          rejected: [],
          changes: op.changes,
          doc,
        });
        this.#settleIdentity(repo);
        return id;
      }
      case "idVote": {
        const repo = this.#repo(op.rid);
        const rev = repo.identity.revisions.find(r => r.id === op.revision);
        if (!rev || rev.state !== "active") return;
        rev.accepted = rev.accepted.filter(p => p !== "self");
        rev.rejected = rev.rejected.filter(p => p !== "self");
        (op.approve ? rev.accepted : rev.rejected).push("self");
        this.#settleIdentity(repo);
        return;
      }
      case "readInbox": {
        for (const id of op.ids) this.read[id] = true;
        return;
      }
      case "unreadInbox": {
        for (const id of op.ids) delete this.read[id];
        return;
      }
    }
  }

  // Updates a branch in a peer's copy of the repository.
  #publish(repo: RepoT, person: PersonId, branch: string, commit: string) {
    let remote = repo.remotes.find(r => r.person === person);
    if (!remote) {
      remote = { person, branches: {} };
      repo.remotes.push(remote);
    }
    remote.branches[branch] = commit;
  }

  // ---- Identity documents -------------------------------------------------------

  currentIdentity(repo: RepoT) {
    return (
      repo.identity.revisions.find(r => r.id === repo.identity.current) ??
      repo.identity.revisions[repo.identity.revisions.length - 1]
    );
  }

  pendingIdentity(repo: RepoT) {
    return repo.identity.revisions.filter(r => r.state === "active");
  }

  // Adopts an active revision once a majority of the current delegates have
  // signed it, and rejects it once a majority can no longer be reached.
  #settleIdentity(repo: RepoT) {
    const current = this.currentIdentity(repo);
    const needed = majority(current.doc);
    for (const rev of repo.identity.revisions) {
      if (rev.state !== "active" || rev.parent !== current.id) continue;
      const voters = current.doc.delegates;
      const yes = rev.accepted.filter(p => voters.includes(p)).length;
      const no = rev.rejected.filter(p => voters.includes(p)).length;
      if (yes >= needed) {
        rev.state = "accepted";
        repo.identity.current = rev.id;
        const doc = rev.doc;
        if (doc.defaultBranch !== repo.defaultBranch && repo.branches[repo.defaultBranch]) {
          repo.branches[doc.defaultBranch] = repo.branches[repo.defaultBranch];
          delete repo.branches[repo.defaultBranch];
        }
        repo.delegates = [...doc.delegates];
        repo.threshold = doc.threshold;
        repo.visibility = doc.visibility;
        repo.description = doc.description;
        repo.defaultBranch = doc.defaultBranch;
        repo.name = doc.name;
        // Siblings built on the old document can no longer be adopted.
        for (const other of repo.identity.revisions) {
          if (other.state === "active" && other !== rev) other.state = "rejected";
        }
        return;
      }
      if (voters.length - no < needed) rev.state = "rejected";
    }
  }

  // ---- Ryph -----------------------------------------------------------------

  ryphFor(repo: RepoT) {
    return this.world.ryph.connections[repo.rid];
  }

  ryphRuns(repo: RepoT) {
    return this.world.ryph.runs
      .filter(r => r.rid === repo.rid)
      .map(run => ({ run, ...runState(run, this.now) }))
      .sort((a, b) => b.run.startedAt - a.run.startedAt);
  }

  ryphRunsFor(rid: string, kind: "issue" | "patch", id: string) {
    return this.world.ryph.runs
      .filter(r => r.rid === rid && r.thread.kind === kind && r.thread.id === id)
      .map(run => ({ run, ...runState(run, this.now) }));
  }

  // The run that produced a patch, if an agent opened it.
  ryphRunForPatch(rid: string, patchId: string): RyphRun | undefined {
    return this.world.ryph.runs.find(r => r.rid === rid && r.patch === patchId);
  }

  canSummon(repo: RepoT): boolean {
    const conn = this.ryphFor(repo);
    return !!conn && (this.isDelegate(repo) || conn.allowlist.includes("self"));
  }

  #summon(
    op: Op,
    rid: string,
    thread: RyphRun["thread"],
    body: string,
    commentId: string,
  ) {
    const match = /^\/ryph\s+([a-z][\w-]*)\b\s*([\s\S]*)$/i.exec(body.trim());
    if (!match) return;
    const repo = this.world.repos[rid];
    const conn = repo && this.ryphFor(repo);
    if (!repo || !conn || !this.canSummon(repo)) return;
    const agent = AGENTS.find(a => a.handle === match[1].toLowerCase());
    if (!agent || !conn.agents.includes(agent.id)) return;
    const kind = kindFor(agent.id, thread.kind);
    // A follow-up on a thread with a run in progress joins that run.
    const active = this.world.ryph.runs.find(
      r => r.rid === rid && r.thread.id === thread.id && r.deliveredAt === undefined,
    );
    if (active) return;
    const checks = kind === "fix" || kind === "review" ? conn.checks : [];
    this.world.ryph.runs.push({
      id: oid("run", commentId).slice(0, 4),
      rid,
      agent: agent.id,
      requestedBy: "self",
      thread,
      instruction: match[2].trim(),
      kind,
      startedAt: op.at,
      plan: plan(kind, checks),
      checks,
    });
  }

  #tick() {
    this.now = Date.now();
    for (const run of this.world.ryph.runs) {
      if (run.deliveredAt === undefined && this.now - run.startedAt >= runDuration(run) * 1000) {
        this.do({ type: "ryphDeliver", run: run.id });
        this.#announceDelivery(run);
      }
    }
  }

  #announceDelivery(run: RyphRun) {
    const repo = this.world.repos[run.rid];
    if (!repo) return;
    const name = this.world.ryph.agents[run.agent]?.name ?? "Ryph";
    const target = run.patch
      ? `${this.repoPath(repo)}/patches/${run.patch}`
      : `${this.repoPath(repo)}/${run.thread.kind === "issue" ? "issues" : "patches"}/${run.thread.id}`;
    toast(run.patch ? `${name} opened a patch: ${run.thread.title}` : `${name} finished on ${run.thread.title}`, {
      icon: "checkmark",
      action: { label: "View", run: () => navigate(target) },
    });
  }

  #deliver(run: RyphRun, at: number) {
    const repo = this.#repo(run.rid);
    const agent = this.world.ryph.agents[run.agent];
    const say = (body: string) => {
      const comment: Comment = {
        id: oid("ryph", run.id, body),
        author: run.agent,
        body,
        time: at,
        reactions: [],
      };
      if (run.thread.kind === "issue") {
        this.#issue(run.rid, run.thread.id).comments.push(comment);
      } else {
        this.latestRevision(this.#patch(run.rid, run.thread.id)).comments.push(comment);
      }
    };
    const passed = run.checks.map(name => ({
      name,
      status: "passed" as const,
      durationSec: 20 + (name.length * 7) % 60,
    }));
    const checkLine = run.checks.length
      ? `All ${run.checks.length} checks passed (${run.checks.map(c => `\`${c}\``).join(", ")}).`
      : "";

    if (run.kind === "fix") {
      const issue = this.#issue(run.rid, run.thread.id);
      const head = this.head(repo);
      const snapshot = fixChanges(repo.snapshots[head], issue.title, run.id);
      const commitId = oid("ryph-commit", run.id);
      const summary = issue.title;
      repo.commits[commitId] = {
        id: commitId,
        parents: [head],
        author: run.agent,
        time: at,
        message: `${summary}\n\nAdds a regression test and a changelog entry.\n\nRyph-Run: ${run.id}`,
        summary,
      };
      repo.snapshots[commitId] = snapshot;
      const patchId = oid("ryph-patch", run.id);
      repo.patches.unshift({
        id: patchId,
        title: summary,
        author: run.agent,
        time: at,
        labels: [],
        state: "open",
        events: [],
        revisions: [
          {
            id: patchId,
            author: run.agent,
            time: at,
            description: [
              `Fixes the issue “${issue.title}”.`,
              "",
              `Asked by @${this.person(run.requestedBy).alias}${run.instruction ? `: “${run.instruction}”` : ""}.`,
              "",
              "- Adds a regression test that reproduces the report",
              "- Adds a changelog entry",
              "",
              checkLine,
              "",
              `_Opened by ${agent?.name ?? "a Ryph agent"} in run ${run.id} on ${this.ryphFor(repo)?.instance}._`,
            ].join("\n"),
            base: head,
            head: commitId,
            commits: [commitId],
            reviews: [],
            comments: [],
            checks: passed,
          },
        ],
      });
      this.#publish(repo, run.agent, `patches/${patchId.slice(0, 7)}`, commitId);
      run.patch = patchId;
      run.summary = `Opened a patch. ${checkLine}`;
      say(`Opened a patch: [${summary}](${this.repoPath(repo)}/patches/${patchId})\n\n${checkLine}`);
    } else if (run.kind === "review") {
      const patch = this.#patch(run.rid, run.thread.id);
      const latest = this.latestRevision(patch);
      const open = latest.reviews
        .flatMap(r => r.comments)
        .filter(c => c.location && !c.resolved);
      const targets = open.length
        ? open
        : patch.revisions.flatMap(r => r.reviews.flatMap(v => v.comments)).filter(c => c.location && !c.resolved);
      const snapshot = reviewChanges(
        repo.snapshots[latest.head],
        targets.map(c => ({ path: c.location!.path, line: c.location!.line, body: c.body })),
      );
      const commitId = oid("ryph-commit", run.id);
      repo.commits[commitId] = {
        id: commitId,
        parents: [latest.head],
        author: run.agent,
        time: at,
        message: `Address review comments\n\nRyph-Run: ${run.id}`,
        summary: "Address review comments",
      };
      repo.snapshots[commitId] = snapshot;
      for (const c of targets) c.resolved = true;
      const n = patch.revisions.length + 1;
      patch.revisions.push({
        id: oid("ryph-rev", run.id),
        author: run.agent,
        time: at,
        description: `Address review comments\n\nResolves ${targets.length} review comment${targets.length === 1 ? "" : "s"}. ${checkLine}`,
        base: latest.base,
        head: commitId,
        commits: [...latest.commits, commitId],
        reviews: [],
        comments: [],
        checks: passed,
      });
      this.#publish(repo, run.agent, `patches/${patch.id.slice(0, 7)}`, commitId);
      run.patch = patch.id;
      run.summary = `Pushed revision ${n}, resolving ${targets.length} comment${targets.length === 1 ? "" : "s"}.`;
      say(`Pushed revision ${n}, addressing ${targets.length} review comment${targets.length === 1 ? "" : "s"}. ${checkLine}`);
    } else if (run.kind === "research") {
      run.summary = "Posted a write-up.";
      say(researchWriteUp(repo, repo.snapshots[this.head(repo)], run.instruction));
    } else {
      if (run.thread.kind === "issue") {
        const issue = this.#issue(run.rid, run.thread.id);
        if (!issue.labels.includes("triaged")) {
          issue.labels = [...issue.labels, "triaged"];
          issue.events.push({ kind: "labels", author: run.agent, time: at, added: ["triaged"], removed: [] });
        }
      }
      run.summary = "Labelled the thread and checked for duplicates.";
      say("Added the `triaged` label. I didn't find any duplicates of this one.");
    }
    run.deliveredAt = at;
  }

  // Applies or rejects org proposals once enough members have weighed in.
  #settle(org: Org) {
    for (const p of org.proposals) {
      if (p.state !== "open") continue;
      if (p.approvals.length >= org.threshold) {
        p.state = "applied";
        const c = p.change;
        if (c.type === "addMember") {
          org.members.push({ person: c.person, role: c.role, since: Date.now() });
        } else if (c.type === "removeMember") {
          org.members = org.members.filter(m => m.person !== c.person);
        } else if (c.type === "editProfile") {
          org[c.field] = c.value;
        } else if (c.type === "setThreshold") {
          org.threshold = c.threshold;
        }
      } else if (p.rejections.length > org.members.length - org.threshold) {
        p.state = "rejected";
      }
    }
  }
}

export const node = new BrowserNode();
export { DAY, HOUR };
