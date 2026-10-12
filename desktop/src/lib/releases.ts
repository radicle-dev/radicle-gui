import type { Author } from "@bindings/cob/Author";
import type { Artifact } from "@bindings/cob/release/Artifact";
import type { Location } from "@bindings/cob/release/Location";
import type { ReleaseCounts } from "@bindings/cob/release/ReleaseCounts";
import type { ReleaseScope } from "@bindings/cob/release/ReleaseScope";
import type { Commit } from "@bindings/repo/Commit";

// With no scope asked for and no delegate releases, open on the untrusted
// scope rather than on an empty list.
export function releaseListScope(
  requested: ReleaseScope | undefined,
  counts: ReleaseCounts,
): ReleaseScope {
  if (requested !== undefined) {
    return requested;
  }
  return counts.delegate === 0 && counts.other > 0 ? "untrusted" : "trusted";
}

export interface ArtifactView {
  scope: ReleaseScope;
  shown: Artifact[];
  redactedCount: number;
  counts: Record<ReleaseScope, number>;
  showFilters: boolean;
}

// Falls back to the other scope when the one asked for is empty.
export function artifactView(
  artifacts: Artifact[],
  delegates: Set<string>,
  wanted: ReleaseScope,
  showRedacted: boolean,
): ArtifactView {
  const byScope: Record<ReleaseScope, Artifact[]> = {
    trusted: artifacts.filter(a => delegates.has(a.author.did)),
    untrusted: artifacts.filter(a => !delegates.has(a.author.did)),
  };
  const visible = (list: Artifact[]) =>
    showRedacted ? list : list.filter(a => !a.redacted);
  const other = wanted === "trusted" ? "untrusted" : "trusted";
  const scope = byScope[wanted].length > 0 ? wanted : other;

  return {
    scope,
    shown: visible(byScope[scope]),
    redactedCount: byScope[scope].filter(a => a.redacted).length,
    counts: {
      trusted: visible(byScope.trusted).length,
      untrusted: visible(byScope.untrusted).length,
    },
    showFilters: byScope.trusted.length > 0 && byScope.untrusted.length > 0,
  };
}

// Delegate takes precedence over author, since the author may also be a
// delegate.
export function redactedByDelegate(
  artifact: Artifact,
  delegates: Set<string>,
): boolean {
  return artifact.redactions.some(r => delegates.has(r.user.did));
}

export function locationsByNode(
  locations: Location[],
): { user: Author; urls: string[] }[] {
  const groups = new Map<string, { user: Author; urls: string[] }>();
  for (const { user, url } of locations) {
    const group = groups.get(user.did) ?? { user, urls: [] };
    group.urls.push(url);
    groups.set(user.did, group);
  }
  return [...groups.values()];
}

// The backend sorts by DID, which means nothing to a reader.
export function delegatesFirst<T>(
  items: T[],
  did: (item: T) => string,
  delegates: Set<string>,
): T[] {
  return [...items].sort(
    (a, b) => Number(delegates.has(did(b))) - Number(delegates.has(did(a))),
  );
}

export function webLocations(
  locations: Location[],
  delegates: Set<string>,
): Location[] {
  return delegatesFirst(
    locations.filter(l => /^https?:\/\//i.test(l.url)),
    l => l.user.did,
    delegates,
  );
}

// The trust signal worth carrying on the collapsed row. Only delegates count:
// anyone can make keys that attest their own artifact.
export function attestedBy(
  attestations: Author[],
  delegates: Set<string>,
): number {
  return attestations.filter(a => delegates.has(a.did)).length;
}

export function canEditMetadata(
  artifact: Artifact,
  ownDid: string,
  delegates: Set<string>,
): boolean {
  return artifact.author.did === ownDid || delegates.has(ownDid);
}

// The author vouches by registering, so the COB ignores their attestation,
// and a redaction bars the same user from attesting.
export function canAttest(artifact: Artifact, ownDid: string): boolean {
  return (
    artifact.author.did !== ownDid &&
    !artifact.redacted &&
    !artifact.attestations.some(a => a.did === ownDid) &&
    !artifact.redactions.some(r => r.user.did === ownDid)
  );
}

// Text that parses as JSON is sent as that value, so numbers round-trip.
export function parseMetadataValue(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function displayMetadataValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function matchCommits(
  commits: Commit[],
  query: string,
  resolved: Commit | undefined,
): Commit[] {
  const q = query.trim().toLowerCase();
  const matches = commits.filter(
    c => c.id.startsWith(q) || c.summary.toLowerCase().includes(q),
  );
  if (resolved && !matches.some(c => c.id === resolved.id)) {
    return [resolved];
  }
  return matches;
}

// A release by a non-delegate is untrusted as a whole. On a delegate's
// release, only the artifacts registered by others are.
export function releaseWarning(
  creatorDid: string,
  delegates: Set<string>,
  artifactScope: ReleaseScope,
): "release" | "artifacts" | undefined {
  if (!delegates.has(creatorDid)) {
    return "release";
  }
  return artifactScope === "untrusted" ? "artifacts" : undefined;
}
