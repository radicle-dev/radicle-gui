import type { Canonical } from "@bindings/repo/Canonical";
import type { Remote } from "@bindings/repo/Remote";
import type { Tag } from "@bindings/repo/Tag";

import orderBy from "lodash/orderBy";

export function sortedTags(tags: Record<string, Tag>): [string, Tag][] {
  return Object.entries(tags).sort(([nameA, a], [nameB, b]) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return nameB.localeCompare(nameA);
  });
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
