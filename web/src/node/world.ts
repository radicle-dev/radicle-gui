import type { Snapshot } from "./diff";
import { seedBoard } from "./board";
import type {
  CobEvent,
  Comment,
  Commit,
  Issue,
  Org,
  Patch,
  Person,
  PersonId,
  Release,
  Repo,
  Review,
  Revision,
  World,
} from "./model";
import type {
  CommentSeed,
  CommitSeed,
  FileChange,
  OrgSeed,
  PersonSeed,
  RepoSeed,
} from "./seeds/types";

import { base58, nidFor, oid, ridFor } from "./hash";
import { AGENTS, agentPeople, seedChecks, seedConnections, seedRuns } from "./ryph";
import { applyIdentityChange, seedIdentity } from "./repoIdentity";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export interface SelfInfo {
  alias: string;
  name: string;
  nid: string;
}

export function applyChange(
  previous: string | undefined,
  change: FileChange,
  where: string,
): string | undefined {
  if (change === null) return undefined;
  if (typeof change === "string") return change;
  let content = previous ?? "";
  for (const [find, replace] of change) {
    const at = content.indexOf(find);
    if (at === -1) {
      console.warn(`[seed] ${where}: edit target not found`, find);
      continue;
    }
    content = content.slice(0, at) + replace + content.slice(at + find.length);
  }
  return content;
}

function applyChanges(
  snapshot: Snapshot,
  changes: Record<string, FileChange>,
  where: string,
): Snapshot {
  const next = { ...snapshot };
  for (const [path, change] of Object.entries(changes)) {
    const content = applyChange(next[path], change, `${where} ${path}`);
    if (content === undefined) delete next[path];
    else next[path] = content;
  }
  return next;
}

function summaryOf(message: string): string {
  return message.split("\n")[0].trim();
}

function buildComments(
  seeds: CommentSeed[] | undefined,
  start: number,
  scope: string,
): Comment[] {
  const comments: Comment[] = [];
  (seeds ?? []).forEach((seed, index) => {
    comments.push({
      id: oid(scope, "comment", index),
      author: seed.author,
      body: seed.body,
      time: start + seed.hoursAfter * HOUR,
      replyTo:
        seed.replyTo !== undefined
          ? oid(scope, "comment", seed.replyTo)
          : undefined,
      reactions: (seed.reactions ?? []).map(r => ({
        emoji: r.emoji,
        by: [...r.by],
      })),
    });
  });
  return comments;
}

function buildRepo(seed: RepoSeed, epoch: number): Repo {
  const rid = ridFor(seed.name);
  const commits: Record<string, Commit> = {};
  const snapshots: Record<string, Snapshot> = {};
  const labels: Record<string, string> = {};
  const at = (daysAgo: number) => epoch - daysAgo * DAY;

  function addCommit(
    parent: string | undefined,
    spec: Omit<CommitSeed, "changes">,
    snapshot: Snapshot,
  ): string {
    const id = oid(rid, parent, spec.message, spec.daysAgo, spec.author);
    commits[id] = {
      id,
      parents: parent ? [parent] : [],
      author: spec.author,
      time: at(spec.daysAgo),
      message: spec.message,
      summary: summaryOf(spec.message),
    };
    snapshots[id] = snapshot;
    if (spec.label) labels[spec.label] = id;
    return id;
  }

  let head = addCommit(undefined, seed.root, { ...seed.files });
  const mainline: string[] = [head];
  for (const spec of seed.history) {
    const snapshot = applyChanges(
      snapshots[head],
      spec.changes,
      `${seed.name}@${spec.label ?? spec.message}`,
    );
    head = addCommit(head, spec, snapshot);
    mainline.push(head);
  }
  const branches: Record<string, string> = { [seed.defaultBranch]: head };

  const headAt = (time: number) => {
    let found = mainline[0];
    for (const id of mainline) if (commits[id].time <= time) found = id;
    return found;
  };
  const resolve = (label: string | undefined, fallbackTime: number) =>
    (label && labels[label]) || headAt(fallbackTime);

  const stack = (base: string, specs: CommitSeed[], where: string) => {
    let tip = base;
    const ids: string[] = [];
    for (const spec of specs) {
      const snapshot = applyChanges(snapshots[tip], spec.changes, where);
      tip = addCommit(tip, spec, snapshot);
      ids.push(tip);
    }
    return { tip, ids };
  };

  for (const branch of seed.branches ?? []) {
    const base = resolve(branch.from, epoch);
    branches[branch.name] = stack(
      base,
      branch.commits,
      `${seed.name} branch ${branch.name}`,
    ).tip;
  }

  const issues: Issue[] = seed.issues.map((s, index) => {
    const id = oid(rid, "issue", index, s.title);
    const time = at(s.daysAgo);
    const state = s.state ?? "open";
    const closer =
      seed.delegates.find(d => d !== s.author && d !== "self") ??
      seed.delegates.find(d => d !== s.author) ??
      s.author;
    const events: CobEvent[] = [];
    if (s.labels?.length) {
      events.push({ kind: "labels", author: closer, time: time + 0.5 * HOUR, added: s.labels, removed: [] });
    }
    if (s.assignees?.length) {
      events.push({ kind: "assign", author: closer, time: time + 3 * HOUR, added: s.assignees, removed: [] });
    }
    if (state !== "open") {
      events.push({ kind: "state", author: closer, time: time + (s.closedHoursAfter ?? 48) * HOUR, state });
    }
    return {
      id,
      title: s.title,
      author: s.author,
      time,
      body: s.body,
      labels: s.labels ?? [],
      assignees: s.assignees ?? [],
      state,
      closedAt:
        state === "open"
          ? undefined
          : time + (s.closedHoursAfter ?? 48) * HOUR,
      comments: buildComments(s.comments, time, id),
      events,
    };
  });

  const patches: Patch[] = seed.patches.map((s, index) => {
    const id = oid(rid, "patch", index, s.title);
    const time = at(s.daysAgo);
    const revisions: Revision[] = [];
    s.revisions.forEach((r, rIndex) => {
      const rTime = time + (rIndex === 0 ? 0 : r.hoursAfter) * HOUR;
      const revId = rIndex === 0 ? id : oid(id, "revision", rIndex);
      let base: string;
      let headId: string;
      let commitIds: string[];
      if (r.fromHistory && r.fromHistory.length > 0) {
        commitIds = r.fromHistory
          .map(label => labels[label])
          .filter((c): c is string => c !== undefined);
        const first = commits[commitIds[0]];
        base = first?.parents[0] ?? mainline[0];
        headId = commitIds[commitIds.length - 1] ?? base;
      } else {
        // A later revision without its own base stacks its commits on the
        // previous revision, and keeps that revision's merge base.
        const prev = revisions[revisions.length - 1];
        const explicit = r.base ? labels[r.base] : undefined;
        base = explicit ?? prev?.base ?? headAt(rTime);
        const from = explicit ?? prev?.head ?? base;
        const stacked = stack(
          from,
          (r.commits ?? []).map(c => ({ ...c })),
          `${seed.name} patch "${s.title}" r${rIndex + 1}`,
        );
        headId = stacked.tip;
        commitIds = stacked.ids;
      }
      const reviews: Review[] = (r.reviews ?? []).map((rv, vIndex) => {
        const reviewId = oid(revId, "review", vIndex);
        const reviewTime = rTime + rv.hoursAfter * HOUR;
        return {
          id: reviewId,
          author: rv.author,
          time: reviewTime,
          verdict: rv.verdict,
          summary: rv.summary,
          comments: (rv.comments ?? []).map((c, cIndex) => ({
            id: oid(reviewId, "code", cIndex),
            author: rv.author,
            body: c.body,
            time: reviewTime,
            reactions: [],
            location: { path: c.path, line: c.line, endLine: c.endLine },
            resolved: c.resolved ?? false,
          })),
        };
      });
      revisions.push({
        id: revId,
        author: s.author,
        time: rTime,
        description: r.description,
        base,
        head: headId,
        commits: commitIds,
        reviews,
        comments: buildComments(r.comments, rTime, revId),
      });
    });
    const last = revisions[revisions.length - 1];
    const maintainer =
      seed.delegates.find(d => d !== s.author && d !== "self") ??
      seed.delegates.find(d => d !== s.author) ??
      seed.delegates[0];
    const events: CobEvent[] = [];
    if (s.labels?.length) {
      events.push({ kind: "labels", author: s.author, time: time + 0.2 * HOUR, added: s.labels, removed: [] });
    }
    if (s.state === "draft") {
      events.push({ kind: "state", author: s.author, time: time + 0.1 * HOUR, state: "draft" });
    } else if (s.state === "archived") {
      events.push({ kind: "state", author: s.author, time: last.time + 30 * HOUR, state: "archived" });
    }
    return {
      id,
      title: s.title,
      author: s.author,
      time,
      labels: s.labels ?? [],
      state: s.state,
      mergedAt:
        s.state === "merged" ? Math.max(commits[last.head]?.time ?? time, last.time + HOUR) : undefined,
      mergedBy: s.state === "merged" ? maintainer : undefined,
      revisions,
      events,
    };
  });

  const releases: Release[] = (seed.releases ?? []).map(s => ({
    id: oid(rid, "release", s.tag),
    tag: s.tag,
    commit: labels[s.at] ?? head,
    title: s.title,
    notes: s.notes,
    author: s.author,
    time: at(s.daysAgo),
    artifacts: (s.artifacts ?? []).map(a => ({
      ...a,
      cid: `bafy${base58(`${rid}${s.tag}${a.name}`, 52).toLowerCase()}`,
    })),
  }));

  const repo: Repo = {
    rid,
    name: seed.name,
    owner:
      "org" in seed.owner
        ? { type: "org", id: seed.owner.org }
        : { type: "person", id: seed.owner.person },
    description: seed.description,
    defaultBranch: seed.defaultBranch,
    visibility: seed.visibility,
    delegates: [...seed.delegates],
    threshold: seed.threshold,
    seedCount: seed.seeding,
    commits,
    snapshots,
    branches,
    tags: releases.map(r => ({
      name: r.tag,
      commit: r.commit,
      time: r.time,
    })),
    issues,
    patches,
    releases,
    created: commits[mainline[0]].time,
    identity: { current: "", revisions: [] },
    remotes: [],
  };

  // Every delegate publishes the default branch; the last delegate is a
  // commit behind, as someone always is. Patch authors publish their patch
  // branches, and branch owners their branches.
  const remotes = new Map<string, Record<string, string>>();
  const remote = (person: string) => {
    if (!remotes.has(person)) remotes.set(person, {});
    return remotes.get(person)!;
  };
  seed.delegates.forEach((d, i) => {
    const behind = i === seed.delegates.length - 1 && seed.delegates.length > 1 && mainline.length > 1;
    remote(d)[seed.defaultBranch] = behind ? mainline[mainline.length - 2] : head;
  });
  for (const patch of patches) {
    if (patch.state === "merged") continue;
    remote(patch.author)[`patches/${patch.id.slice(0, 7)}`] = patch.revisions[patch.revisions.length - 1].head;
  }
  for (const branch of seed.branches ?? []) {
    remote(branch.owner)[branch.name] = branches[branch.name];
  }
  repo.remotes = [...remotes.entries()].map(([person, b]) => ({
    person: person as PersonId,
    branches: b,
  }));
  repo.identity = seedIdentity(
    repo,
    "person" in seed.owner ? seed.owner.person : (seed.delegates.find(d => d !== "self") ?? seed.delegates[0]),
  );
  return repo;
}

function buildPerson(seed: PersonSeed): Person {
  const nid = nidFor(seed.key);
  return {
    id: seed.key,
    nid,
    did: `did:key:${nid}`,
    alias: seed.alias,
    name: seed.name,
    bio: seed.bio,
    pronouns: seed.pronouns,
    location: seed.location,
    timezone: seed.timezone,
    website: seed.website,
    keys: seed.keys,
  };
}

function buildOrg(seed: OrgSeed, epoch: number, people: PersonId[]): Org {
  const created = epoch - 320 * DAY;
  const members = seed.members.map((m, i) => ({
    person: m.person,
    role: m.role,
    since: created + i * 9 * DAY,
  }));
  const org: Org = {
    id: seed.key,
    handle: seed.handle,
    name: seed.name,
    description: seed.description,
    website: seed.website,
    location: seed.location,
    rid: ridFor(`org:${seed.key}`),
    members,
    threshold: seed.threshold,
    proposals: [],
    created,
  };

  // Orgs the user belongs to start with a change waiting on their approval,
  // so the multi-member approval flow is there to try.
  if (seed.selfMember) {
    const proposer = members.find(m => m.person !== "self" && m.role === "admin")
      ?? members.find(m => m.person !== "self");
    const candidate = people.find(
      p => p !== "self" && !members.some(m => m.person === p),
    );
    if (proposer && candidate) {
      org.proposals.push({
        id: oid(org.rid, "proposal", candidate),
        title: `Add ${candidate} as a member`,
        author: proposer.person,
        time: epoch - 20 * HOUR,
        change: { type: "addMember", person: candidate, role: "member" },
        approvals: [proposer.person],
        rejections: [],
        state: "open",
      });
    }
  }
  return org;
}

export function buildWorld(
  epoch: number,
  self: SelfInfo,
  seeds: {
    people: PersonSeed[];
    orgs: OrgSeed[];
    repos: RepoSeed[];
  },
): World {
  const people: Record<string, Person> = {};
  for (const p of seeds.people) people[p.key] = buildPerson(p);
  people.self = {
    id: "self",
    nid: self.nid,
    did: `did:key:${self.nid}`,
    alias: self.alias,
    name: self.name,
    bio: "",
    keys: 1,
  };

  const orgs: Record<string, Org> = {};
  for (const o of seeds.orgs) {
    orgs[o.key] = buildOrg(o, epoch, Object.keys(people) as PersonId[]);
  }

  const repos: Record<string, Repo> = {};
  for (const r of seeds.repos) {
    const repo = buildRepo(r, epoch);
    repo.board = seedBoard(repo);
    repos[repo.rid] = repo;
  }

  Object.assign(people, agentPeople());

  const world: World = {
    epoch,
    people,
    orgs,
    repos,
    ryph: {
      agents: Object.fromEntries(AGENTS.map(a => [a.id, a])),
      connections: {},
      runs: [],
    },
  };
  // A proposal waiting on the user's signature, so signing is there to try.
  const beacon = Object.values(repos).find(r => r.name === "beacon");
  if (beacon) {
    const current = beacon.identity.revisions[beacon.identity.revisions.length - 1];
    const change = { type: "addDelegate" as const, person: "yuki" as const };
    beacon.identity.revisions.push({
      id: oid(beacon.rid, "identity", "propose-yuki"),
      title: "Add yuki as a delegate",
      description:
        "yuki has been reviewing most gossip patches for months and runs the long-uptime seed. Making it official spreads the review load, and with four delegates we'd still need two to move main.",
      author: "ada",
      time: epoch - 30 * HOUR,
      parent: current.id,
      state: "active",
      accepted: ["ada"],
      rejected: [],
      changes: [change],
      doc: applyIdentityChange(current.doc, change),
    });
  }

  world.ryph.connections = seedConnections(world, epoch);
  world.ryph.runs = seedRuns(world, epoch);
  seedChecks(world, world.ryph.connections);
  return world;
}
