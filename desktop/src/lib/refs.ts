import type { Canonical } from "@bindings/repo/Canonical";
import type { Remote } from "@bindings/repo/Remote";
import type { Tag } from "@bindings/repo/Tag";

import orderBy from "lodash/orderBy";

export function compareTagNames(a: string, b: string): number {
  if (b.startsWith(`${a}-`)) return -1;
  if (a.startsWith(`${b}-`)) return 1;
  return b.localeCompare(a, undefined, { numeric: true });
}

export function sortedTags(tags: Record<string, Tag>): [string, Tag][] {
  const groups = new Map<string, { tags: [string, Tag][]; newest: number }>();
  for (const entry of Object.entries(tags)) {
    const slash = entry[0].lastIndexOf("/");
    const namespace = slash === -1 ? "" : entry[0].slice(0, slash);
    const group = groups.get(namespace) ?? { tags: [], newest: 0 };
    group.tags.push(entry);
    group.newest = Math.max(group.newest, entry[1].timestamp);
    groups.set(namespace, group);
  }

  return [...groups.entries()]
    .sort(([nsA, a], [nsB, b]) => b.newest - a.newest || nsA.localeCompare(nsB))
    .flatMap(([, group]) =>
      group.tags.sort(([a], [b]) => compareTagNames(a, b)),
    );
}

// Delegates first; within each (delegate / non-delegate) group, peers with
// an alias come before those without, alphabetically. No-alias peers fall
// to the bottom and sort by NID.
export function sortRemotes<
  T extends { id: string; alias?: string; delegate: boolean },
>(list: T[]): T[] {
  return orderBy(list, [
    r => !r.delegate,
    r => r.alias === undefined,
    r => (r.alias ?? "").toLowerCase(),
    r => r.id,
  ]);
}

export function selectedRefType(
  revision: string | undefined,
  selectedPeer: Remote | undefined,
  canonical: Canonical | undefined,
  defaultBranch: string,
): "branch" | "tag" | undefined {
  if (revision === undefined) return "branch";
  if (selectedPeer) {
    if (revision in selectedPeer.branches) return "branch";
    if (revision in selectedPeer.tags) return "tag";
  } else {
    if (revision in (canonical?.branches ?? {})) return "branch";
    if (revision in (canonical?.tags ?? {})) return "tag";
    if (revision === defaultBranch) return "branch";
  }
  return undefined;
}
