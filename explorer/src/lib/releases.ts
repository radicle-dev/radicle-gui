import type { Artifact, Author, ReleaseScope } from "@http-client";

export interface ArtifactView {
  shown: Artifact[];
  redactedCount: number;
  counts: Record<ReleaseScope, number>;
  showFilters: boolean;
}

// Whether the artifact was redacted by a trusted party (its author or a
// delegate), mirroring the backend's default-hidden rule.
export function redactedByTrusted(
  artifact: Artifact,
  delegates: Set<string>,
): boolean {
  return artifact.redactions.some(
    r => r.user.id === artifact.author.id || delegates.has(r.user.id),
  );
}

// The artifacts of a release in one author scope. The endpoint returns every
// author, so the split happens here. The scope asked for is shown even when it
// is empty: switching to others by itself would show untrusted content unasked.
export function artifactView(
  artifacts: Artifact[],
  delegates: Set<string>,
  scope: ReleaseScope,
  showRedacted: boolean,
): ArtifactView {
  const byScope: Record<ReleaseScope, Artifact[]> = {
    trusted: artifacts.filter(a => delegates.has(a.author.id)),
    untrusted: artifacts.filter(a => !delegates.has(a.author.id)),
  };
  const visible = (list: Artifact[]) =>
    showRedacted ? list : list.filter(a => !redactedByTrusted(a, delegates));

  return {
    shown: visible(byScope[scope]),
    // The hidden set within the current author scope.
    redactedCount: byScope[scope].filter(a => redactedByTrusted(a, delegates))
      .length,
    // Counts reflect what each scope would show, so an artifact hidden as
    // redacted never counts. The filter itself comes from the unfiltered sets,
    // so toggling redacted artifacts never hides it.
    counts: {
      trusted: visible(byScope.trusted).length,
      untrusted: visible(byScope.untrusted).length,
    },
    // Others is one click away whenever it holds something.
    showFilters: byScope.untrusted.length > 0,
  };
}

// Anyone can attest their own artifact, so only delegates count.
export function attestedBy(
  attestations: Author[],
  delegates: Set<string>,
): number {
  return attestations.filter(a => delegates.has(a.id)).length;
}

// A non-delegate's release is untrusted as a whole, as its creator chose its
// title, tag and commit. A delegate's release is untrusted only while it
// shows artifacts by non-delegates.
export function releaseWarning(
  creator: string,
  delegates: Set<string>,
  artifactScope: ReleaseScope,
): "release" | "artifacts" | undefined {
  if (!delegates.has(creator)) {
    return "release";
  }
  return artifactScope === "untrusted" ? "artifacts" : undefined;
}
