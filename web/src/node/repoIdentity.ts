import type {
  IdentityChange,
  IdentityDoc,
  IdentityRevision,
  Person,
  PersonId,
  Repo,
} from "./model";

import { oid } from "./hash";

const HOUR = 60 * 60 * 1000;

// Signatures needed to adopt a new revision: a simple majority of the parent
// document's delegates.
export function majority(doc: IdentityDoc): number {
  return Math.floor(doc.delegates.length / 2) + 1;
}

export function applyIdentityChange(doc: IdentityDoc, change: IdentityChange): IdentityDoc {
  const next: IdentityDoc = {
    ...doc,
    delegates: [...doc.delegates],
    allow: [...doc.allow],
    canonicalRefs: doc.canonicalRefs.map(r => ({ ...r })),
  };
  switch (change.type) {
    case "addDelegate":
      if (!next.delegates.includes(change.person)) next.delegates.push(change.person);
      break;
    case "removeDelegate":
      next.delegates = next.delegates.filter(d => d !== change.person);
      next.threshold = Math.min(next.threshold, Math.max(1, next.delegates.length));
      break;
    case "setThreshold":
      next.threshold = change.threshold;
      break;
    case "setVisibility":
      next.visibility = change.visibility;
      break;
    case "setDescription":
      next.description = change.description;
      break;
    case "setDefaultBranch":
      next.defaultBranch = change.branch;
      break;
    case "init":
      break;
  }
  for (const rule of next.canonicalRefs) {
    if (rule.allow === "delegates") {
      rule.threshold = Math.min(Math.max(rule.threshold, 1), next.delegates.length);
    }
  }
  return next;
}

export function describeChange(
  change: IdentityChange,
  alias: (p: PersonId) => string,
): string {
  switch (change.type) {
    case "addDelegate":
      return `Adds ${alias(change.person)} as a delegate`;
    case "removeDelegate":
      return `Removes ${alias(change.person)} as a delegate`;
    case "setThreshold":
      return `Sets the default-branch threshold to ${change.threshold}`;
    case "setVisibility":
      return `Makes the repository ${change.visibility}`;
    case "setDescription":
      return `Changes the description to “${change.description}”`;
    case "setDefaultBranch":
      return `Changes the default branch to ${change.branch}`;
    case "init":
      return "Creates the identity document";
  }
}

// Seeds a believable history: the repo started with one delegate, the others
// were added one at a time, then the threshold was raised.
export function seedIdentity(repo: Repo, ownerHint: PersonId): Repo["identity"] {
  const final = repo.delegates;
  const founder = final.includes(ownerHint)
    ? ownerHint
    : (final.find(d => d !== "self") ?? final[0]);
  const ordered = [founder, ...final.filter(d => d !== founder)];

  let doc: IdentityDoc = {
    name: repo.name,
    description: repo.description,
    defaultBranch: repo.defaultBranch,
    delegates: [founder],
    threshold: 1,
    visibility: repo.visibility,
    allow: [],
    canonicalRefs: [
      { pattern: `refs/heads/${repo.defaultBranch}`, threshold: 1, allow: "delegates" },
      { pattern: "refs/tags/*", threshold: 1, allow: "delegates" },
    ],
  };
  const revisions: IdentityRevision[] = [];
  let time = repo.created;
  const push = (
    title: string,
    description: string,
    author: PersonId,
    changes: IdentityChange[],
    signers: PersonId[],
  ) => {
    const parent = revisions[revisions.length - 1];
    for (const c of changes) doc = applyIdentityChange(doc, c);
    revisions.push({
      id: oid(repo.rid, "identity", revisions.length, title),
      title,
      description,
      author,
      time,
      parent: parent?.id,
      state: "accepted",
      accepted: signers,
      rejected: [],
      changes,
      doc,
    });
  };

  push("", "", founder, [{ type: "init" }], [founder]);
  for (const person of ordered.slice(1)) {
    time += 9 * 24 * HOUR;
    const signers = revisions[revisions.length - 1].doc.delegates;
    push(
      "",
      "",
      founder,
      [{ type: "addDelegate", person }],
      signers.slice(0, majority(revisions[revisions.length - 1].doc)),
    );
  }
  if (repo.threshold > 1) {
    time += 3 * 24 * HOUR;
    const parentDoc = revisions[revisions.length - 1].doc;
    push(
      "",
      `With ${parentDoc.delegates.length} of us now, one person shouldn't be able to move ${repo.defaultBranch} on their own.`,
      ordered.find(d => d !== founder && d !== "self") ?? founder,
      [{ type: "setThreshold", threshold: repo.threshold }],
      parentDoc.delegates.slice(0, majority(parentDoc)),
    );
    // Tags follow the same rule.
    const last = revisions[revisions.length - 1];
    last.doc.canonicalRefs = last.doc.canonicalRefs.map(r => ({ ...r, threshold: repo.threshold }));
  }
  return { current: revisions[revisions.length - 1].id, revisions };
}

// The document as `rad inspect --identity` prints it.
export function rawIdentity(doc: IdentityDoc, people: Record<string, Person>): string {
  const did = (p: PersonId) => people[p]?.did ?? p;
  const json: Record<string, unknown> = {
    payload: {
      "xyz.radicle.project": {
        defaultBranch: doc.defaultBranch,
        description: doc.description,
        name: doc.name,
      },
      "xyz.radicle.crefs": {
        rules: Object.fromEntries(
          doc.canonicalRefs
            .filter(r => r.pattern !== `refs/heads/${doc.defaultBranch}`)
            .map(r => [
              r.pattern,
              {
                allow: r.allow === "delegates" ? "delegates" : r.allow.map(did),
                threshold: r.threshold,
              },
            ]),
        ),
      },
    },
    delegates: doc.delegates.map(did),
    threshold: doc.threshold,
  };
  if (doc.visibility === "private") {
    json.visibility = { type: "private", allow: doc.allow.map(did) };
  }
  return JSON.stringify(json, null, 2);
}

// A revision's title, falling back to one derived from its changes.
export function revisionTitle(rev: IdentityRevision, alias: (p: PersonId) => string): string {
  if (rev.title) return rev.title;
  const c = rev.changes[0];
  if (!c || c.type === "init") return "Initial identity";
  switch (c.type) {
    case "addDelegate":
      return `Add ${alias(c.person)} as a delegate`;
    case "removeDelegate":
      return `Remove ${alias(c.person)} as a delegate`;
    case "setThreshold":
      return `Require ${c.threshold} delegates to agree`;
    case "setVisibility":
      return `Make the repository ${c.visibility}`;
    case "setDescription":
      return "Update the description";
    case "setDefaultBranch":
      return `Change the default branch to ${c.branch}`;
  }
}
