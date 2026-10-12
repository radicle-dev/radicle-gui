import type Icon from "@app/components/Icon.svelte";
import type { RepoRoute } from "@app/views/repo/router";
import type { Config } from "@bindings/config/Config";
import type { ComponentProps } from "svelte";

import type { RadReference } from "@app/lib/radUri";
import {
  cobListType,
  filePath,
  formatReference,
  isNodeId,
  isOid,
  isRepoId,
  isSafeRef,
  issueType,
  parseExplorerUrl,
  parseReference,
  patchType,
  releaseType,
} from "@app/lib/radUri";
import { explorerLink, formatOid, truncateId } from "@app/lib/utils";

export type Entity =
  | { type: "node"; nid: string }
  | { type: "repo"; rid: string }
  | {
      type: "cob";
      kind: "issue" | "patch" | "release";
      rid: string;
      oid: string;
    }
  | { type: "commit"; rid: string; oid: string };

const cobTypes = {
  issue: issueType,
  patch: patchType,
  release: releaseType,
};

export function toEntity(reference: RadReference): Entity | undefined {
  if (reference.type === "did") return { type: "node", nid: reference.node };

  const { repo, resource, namespace, query, fragment } = reference.uri;
  if (namespace || query || fragment !== undefined) return undefined;
  const rid = `rad:${repo}`;
  if (!resource) return { type: "repo", rid };

  if (resource.type === "commit" && isOid(resource.ref)) {
    return { type: "commit", rid, oid: resource.ref };
  }
  if (resource.type === "cob" && resource.oid !== undefined) {
    if (resource.typeName === issueType) {
      return { type: "cob", kind: "issue", rid, oid: resource.oid };
    }
    if (resource.typeName === patchType) {
      return { type: "cob", kind: "patch", rid, oid: resource.oid };
    }
    if (resource.typeName === releaseType) {
      return { type: "cob", kind: "release", rid, oid: resource.oid };
    }
  }

  return undefined;
}

export function toRadReference(target: Entity): RadReference {
  if (target.type === "node") return { type: "did", node: target.nid };

  const repo = target.rid.replace(/^rad:/, "");
  switch (target.type) {
    case "repo":
      return { type: "uri", uri: { repo } };
    case "commit":
      return {
        type: "uri",
        uri: { repo, resource: { type: "commit", ref: target.oid } },
      };
    case "cob":
      return {
        type: "uri",
        uri: {
          repo,
          resource: {
            type: "cob",
            typeName: cobTypes[target.kind],
            oid: target.oid,
          },
        },
      };
  }
}

export function parseEntityHref(href: string): Entity | undefined {
  const trimmed = href.trim();
  const reference = parseReference(trimmed) ?? parseExplorerUrl(trimmed);

  return reference ? toEntity(reference) : undefined;
}

export function parseBareIdentifier(token: string): Entity | undefined {
  if (isNodeId(token)) return { type: "node", nid: token };
  if (isRepoId(token)) return { type: "repo", rid: `rad:${token}` };

  return undefined;
}

const maximumReferenceLength = 512;

const bareReferencePattern =
  /^(?:did:key:|rad:)[A-Za-z0-9._~!$&'()*+,;=:@/?#%-]{1,513}/;

const prosePunctuation = new Set(["'", '"', ",", ";", "!", "?", "(", ")", "*"]);

function isAlphanumeric(character: string): boolean {
  return /[0-9A-Za-z]/.test(character);
}

// Only the start of a valid reference counts: the markdown lexer copies the
// rest of the input at every start it is given, so offering each `rad:` of a
// long hostile run would make rendering quadratic.
export function bareReferenceStart(src: string): number | undefined {
  const candidate = /(^|[^0-9A-Za-z])(?:did:key:z|rad:)/g;
  for (let match = candidate.exec(src); match; match = candidate.exec(src)) {
    const index = match.index + match[1].length;
    if (matchBareReference(src.slice(index, index + maximumReferenceLength))) {
      return index;
    }
    candidate.lastIndex = index + 1;
  }

  return undefined;
}

export function matchBareReference(
  src: string,
): { raw: string; reference: RadReference } | undefined {
  const raw = bareReferencePattern.exec(src)?.[0];
  // Each retry below parses again, so an unbounded run of punctuation in a
  // comment would take quadratic time to render.
  if (!raw || raw.length > maximumReferenceLength) return undefined;

  let end = raw.length;
  for (;;) {
    while (end > 0 && !isAlphanumeric(raw[end - 1])) end--;
    const candidate = raw.slice(0, end);
    const reference = parseReference(candidate);
    if (reference) return { raw: candidate, reference };

    do end--;
    while (end > 0 && !prosePunctuation.has(raw[end]));
    if (end <= 0) return undefined;
  }
}

export function referenceRoute(reference: RadReference): RepoRoute | undefined {
  if (reference.type !== "uri") return undefined;
  const { repo, namespace, resource } = reference.uri;
  if (resource && "ref" in resource && !isSafeRef(resource.ref)) {
    return undefined;
  }
  const rid = `rad:${repo}`;

  const file = filePath(reference);
  if (file) {
    return {
      resource: "repo.home",
      rid,
      peer: namespace,
      revision: shortRevision(file.revision),
      path: file.path || undefined,
    };
  }

  if (!resource) return { resource: "repo.home", rid, peer: namespace };
  if (resource.type === "commit" && isOid(resource.ref)) {
    return { resource: "repo.commit", rid, commit: resource.ref };
  }
  if (resource.type === "cob" && resource.oid !== undefined) {
    if (resource.typeName === issueType) {
      return {
        resource: "repo.issue",
        rid,
        issue: resource.oid,
        status: "all",
      };
    }
    if (resource.typeName === patchType) {
      return {
        resource: "repo.patch",
        rid,
        patch: resource.oid,
        status: undefined,
        reviewId: undefined,
      };
    }
    if (resource.typeName === releaseType) {
      return { resource: "repo.release", rid, release: resource.oid };
    }
  }
  if (resource.type === "commit" || resource.type === "tag") {
    return {
      resource: "repo.home",
      rid,
      peer: namespace,
      revision: shortRevision(resource.ref),
    };
  }

  const typeName = cobListType(reference);
  if (typeName === issueType) {
    return { resource: "repo.issues", rid, status: "all" };
  }
  if (typeName === patchType) {
    return { resource: "repo.patches", rid, status: undefined };
  }
  if (typeName === releaseType) {
    return { resource: "repo.releases", rid };
  }

  return undefined;
}

export interface LinkDescription {
  label: string;
  primary: string;
  secondary: string;
  icon: ComponentProps<typeof Icon>["name"];
}

const cobLists: Record<
  string,
  { label: string; icon: LinkDescription["icon"] }
> = {
  [issueType]: { label: "Issues", icon: "issue" },
  [patchType]: { label: "Patches", icon: "patch" },
  [releaseType]: { label: "Releases", icon: "parcel" },
};

export function describeLink(
  reference: RadReference,
  repoName: string,
  peerName?: string,
): LinkDescription | undefined {
  if (reference.type !== "uri") return undefined;
  const { resource, namespace, fragment } = reference.uri;
  if (resource && "ref" in resource && !isSafeRef(resource.ref)) {
    return undefined;
  }

  const file = filePath(reference);
  if (file) {
    const revision = shortRevision(file.revision);
    const shown = isOid(revision) ? formatOid(revision) : revision;
    if (!file.path) {
      return {
        label: `${repoName}: ${shown}`,
        primary: shown,
        secondary: repoName,
        icon: "folder",
      };
    }
    const line = fragment ? `#${fragment}` : "";
    return {
      label: `${repoName}: ${file.path}${line}`,
      primary: `${file.path}${line}`,
      secondary: shown,
      icon: "document",
    };
  }

  const typeName = cobListType(reference);
  const list = typeName ? cobLists[typeName] : undefined;
  if (list) {
    return {
      label: `${repoName}: ${list.label.toLowerCase()}`,
      primary: list.label,
      secondary: repoName,
      icon: list.icon,
    };
  }

  if (
    resource?.type === "cob" &&
    resource.typeName === releaseType &&
    resource.oid !== undefined
  ) {
    const release = `release ${formatOid(resource.oid)}`;
    return {
      label: `${repoName}: ${release}`,
      primary: `Release ${formatOid(resource.oid)}`,
      secondary: repoName,
      icon: "parcel",
    };
  }

  if (
    (resource?.type === "commit" && !isOid(resource.ref)) ||
    resource?.type === "tag"
  ) {
    const revision = shortRevision(resource.ref);
    return {
      label: `${repoName}: ${revision}`,
      primary: revision,
      secondary: repoName,
      icon: resource.type === "tag" ? "label" : "branch",
    };
  }

  if (!resource && namespace) {
    const peer = peerName ?? truncateId(namespace);
    return {
      label: `${repoName}: ${peer}`,
      primary: peer,
      secondary: repoName,
      icon: "repository",
    };
  }

  return undefined;
}

function shortRevision(ref: string): string {
  return ref.replace(/^refs\/(?:heads|tags)\//, "");
}

export function entityUri(target: Entity): string {
  return formatReference(toRadReference(target));
}

export function entityUrl(target: Entity, config: Config): string | undefined {
  return explorerLink(toRadReference(target), config);
}

export function entityMarkdown(target: Entity, label: string): string {
  return referenceMarkdown(toRadReference(target), label);
}

export function referenceMarkdown(
  reference: RadReference,
  label: string,
): string {
  const escaped = label.replace(/[[\]\\]/g, character => `\\${character}`);

  return `[${escaped}](${formatReference(reference)})`;
}
