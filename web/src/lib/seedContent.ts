import type { Org, Person, Repo } from "@app/node/model";

import { node } from "@app/node/node.svelte";
import { LOCAL_NODE, SEED_NODES } from "@app/node/seedNodes";

// Repositories as seen through a seed node, or through your own node.
export function reposOn(seed: string): Repo[] {
  if (seed === LOCAL_NODE) return node.seededRepos;
  const s = SEED_NODES.find(n => n.host === seed);
  return s ? node.repos.filter(r => s.hosts(r, node.ownerHandle(r.owner))) : [];
}

// Orgs that own repositories on the seed.
export function orgsOn(seed: string): Org[] {
  const ids = new Set(reposOn(seed).flatMap(r => (r.owner.type === "org" ? [r.owner.id] : [])));
  return Object.values(node.world.orgs).filter(o => ids.has(o.id));
}

// People who maintain or own what the seed hosts.
export function peopleOn(seed: string): Person[] {
  const ids = new Set<string>();
  for (const r of reposOn(seed)) {
    for (const d of r.delegates) ids.add(d);
    if (r.owner.type === "person") ids.add(r.owner.id);
  }
  for (const o of orgsOn(seed)) for (const m of o.members) ids.add(m.person);
  ids.delete("self");
  return [...ids].filter(id => !id.startsWith("agent-")).map(id => node.person(id));
}
