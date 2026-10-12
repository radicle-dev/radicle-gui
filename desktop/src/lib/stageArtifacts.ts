import type { Artifact } from "@bindings/cob/release/Artifact";
import type { ArtifactDigest } from "@bindings/cob/release/ArtifactDigest";

import { formatBytes } from "@app/lib/utils";

export interface Picked {
  path: string;
  name: string;
  digest: ArtifactDigest;
}

// Identity is the content hash, so picking bytes the release already holds
// lands on the existing entry.
export interface StagedArtifact extends Picked {
  register: boolean;
  seed: boolean;
  duplicateOf?: string;
  existing?: {
    name: string;
    keepsName: boolean;
    redaction?: string;
  };
}

export function stageArtifacts(
  picked: Picked[],
  artifacts: Artifact[],
  options: {
    ownDid: string;
    delegates: Set<string>;
    nodeRunning: boolean;
    seeded: Set<string>;
  },
): StagedArtifact[] {
  const byCid = new Map(artifacts.map(a => [a.cid, a]));
  const firstPick = new Map<string, string>();
  return picked.map(item => {
    const duplicateOf = firstPick.get(item.digest.cid);
    if (duplicateOf !== undefined) {
      return { ...item, register: false, seed: false, duplicateOf };
    }
    firstPick.set(item.digest.cid, item.name);
    const match = byCid.get(item.digest.cid);
    const seed = options.nodeRunning && !options.seeded.has(item.digest.cid);
    if (!match) {
      return { ...item, register: true, seed };
    }
    const own = match.author.did === options.ownDid;
    const renamed = match.name !== item.name;
    const redaction = match.redacted
      ? (match.redactions.find(
          r =>
            r.user.did === match.author.did ||
            options.delegates.has(r.user.did),
        )?.reason ?? "")
      : undefined;
    return {
      ...item,
      register: own && renamed,
      seed,
      existing: {
        name: match.name,
        keepsName: renamed && !own,
        redaction,
      },
    };
  });
}

// A redacted match is left alone unless you confirm registering it again.
export function effective(
  item: StagedArtifact,
  includeRedacted: boolean,
): { register: boolean; seed: boolean } {
  if (item.existing?.redaction !== undefined && !includeRedacted) {
    return { register: false, seed: false };
  }
  return { register: item.register, seed: item.seed };
}

export interface PlannedArtifact {
  item: StagedArtifact;
  register: boolean;
  seed: boolean;
}

export interface RegisterPlan {
  items: PlannedArtifact[];
  acting: PlannedArtifact[];
  registering: PlannedArtifact[];
  newCount: number;
  renamedCount: number;
  seededCount: number;
  skippedCount: number;
}

export function registerPlan(
  staged: StagedArtifact[],
  includeRedacted: boolean,
): RegisterPlan {
  const items = staged.map(item => ({
    item,
    ...effective(item, includeRedacted),
  }));
  const acting = items.filter(p => p.register || p.seed);
  const registering = items.filter(p => p.register);
  const newCount = registering.filter(p => !p.item.existing).length;
  return {
    items,
    acting,
    registering,
    newCount,
    renamedCount: registering.length - newCount,
    seededCount: acting.length - registering.length,
    skippedCount: items.length - acting.length,
  };
}

export function planTitle(plan: RegisterPlan): string {
  const count = plan.acting.length;
  if (count === 0) {
    return "Already registered";
  }
  const verb = plan.newCount > 0 ? "Register" : "Update";
  return `${verb} ${count} ${count === 1 ? "artifact" : "artifacts"}`;
}

export function planSummary(plan: RegisterPlan): string {
  return (
    [
      [plan.newCount, "registered"],
      [plan.renamedCount, "renamed"],
      [plan.seededCount, "seeded"],
      [plan.skippedCount, "skipped"],
    ] as const
  )
    .filter(([count]) => count !== 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(", ");
}

export function planDetail(
  { item, register, seed }: PlannedArtifact,
  includeRedacted: boolean,
): string {
  const existing = item.existing;
  if (item.duplicateOf !== undefined) {
    return `same as “${item.duplicateOf}” · skipped`;
  }
  if (!existing) {
    const size = formatBytes(item.digest.sizeBytes);
    const files = item.digest.fileCount;
    return item.digest.directory
      ? `${files} ${files === 1 ? "file" : "files"} · ${size}`
      : size;
  }
  if (existing.redaction !== undefined && !includeRedacted) {
    return "redacted · skipped";
  }
  const name = register
    ? `renames “${existing.name}”`
    : existing.keepsName
      ? `stays “${existing.name}”`
      : "already registered";
  if (seed) {
    return `${name} · will seed`;
  }
  return register ? name : `${name} · skipped`;
}

export function duplicatePicks(
  picks: { path: string; name: string; digest?: { cid: string } }[],
): Map<string, string> {
  const first = new Map<string, string>();
  const duplicates = new Map<string, string>();
  for (const pick of picks) {
    if (!pick.digest) {
      continue;
    }
    const earlier = first.get(pick.digest.cid);
    if (earlier === undefined) {
      first.set(pick.digest.cid, pick.name);
    } else {
      duplicates.set(pick.path, earlier);
    }
  }
  return duplicates;
}
