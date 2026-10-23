import type { Activity } from "./activity";
import type { PersonId, Repo } from "@app/node/model";

import { activityOf } from "./activity";
import { everydayActivity } from "./everydayActivity";
import { node } from "@app/node/node.svelte";

// Everything a person did: what the seeded repositories record, plus the
// steady everyday work around it in the repositories they actually work in.
// Newest first.
export function contributionsOf(person: string): Activity[] {
  const recorded = activityOf(person, node.repos, r => node.repoPath(r));
  const weights = new Map<Repo, number>();
  for (const a of recorded) weights.set(a.repo, (weights.get(a.repo) ?? 0) + 1);
  for (const r of node.repos) if (r.delegates.includes(person as PersonId)) weights.set(r, (weights.get(r) ?? 0) + 6);
  const everyday = everydayActivity(
    person,
    [...weights].map(([repo, weight]) => ({ repo, weight })),
    r => node.repoPath(r),
    node.world.epoch,
  );
  return [...recorded, ...everyday].sort((a, b) => b.time - a.time);
}
