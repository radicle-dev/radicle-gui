// The minimum supported httpd version, and shims that let this client read
// older httpd releases, so the app only ever sees one shape. See docs/adr/0001
// and docs/api-changes.md.
//
// Each shim has a "Compat:" comment that says what older httpd does and the
// last httpd release that needs it: "Client: remove when explorer drops httpd
// 0.30". Fallbacks to an older endpoint stay in the client method that calls
// the endpoint, with the same comment.

import type { Release } from "./repo/release.js";
import type { ReleaseScope } from "./repo.js";
import type { Author } from "./shared.js";
import type { z } from "zod";

import { number, object, record, string } from "zod";

// The minimum httpd version that explorer supports. Explorer compares only
// the major, and before 1.0, `0.y` counts as the major. See docs/adr/0001.
export const minimumSupportedVersion = "0.28.0";

// The release number of an httpd `version`, such as `0.31.0` for
// `0.31.0-<commit>`. Undefined for builds without one, such as
// `pre-release-<commit>` or `nix-<commit>`.
export function releaseNumber(version: string): string | undefined {
  return version.match(/^\d+\.\d+\.\d+/)?.[0];
}

// Whether the major of an httpd `version` is older than the major of
// `minimum`. False for builds without a release number.
export function isOutdated(
  version: string,
  minimum: string = minimumSupportedVersion,
): boolean {
  const release = releaseNumber(version);
  if (release === undefined) {
    return false;
  }
  const [major, minor] = release.split(".").map(Number);
  const [minimumMajor, minimumMinor] = minimum.split(".").map(Number);
  if (major !== minimumMajor) {
    return major < minimumMajor;
  }
  return major === 0 && minor < minimumMinor;
}

// Compat: older httpd reports the issue and patch counts and the default
// branch tip inside the project payload, and the release count as a single
// number. Client: remove when explorer drops httpd 0.30.
export const legacyMetaSchema = object({
  head: string(),
  patches: object({
    open: number(),
    draft: number(),
    archived: number(),
    merged: number(),
  }),
  issues: object({
    open: number(),
    closed: number(),
  }),
  releases: number().optional(),
});

// Compat: older httpd names the default branch only in the project payload,
// so a repo without one has none, even when the symbolic `HEAD` of its
// `xyz.radicle.crefs` payload names it. It sends that payload, so the client
// resolves `HEAD` itself. A malformed payload counts as missing, so that the
// repo still parses. Client: remove when explorer drops httpd 0.30.
export const crefsPayloadSchema = object({
  data: object({ symbolic: record(string(), string()).optional() }),
})
  .optional()
  .catch(undefined);

type LegacyProject =
  | {
      data: { defaultBranch: string };
      meta?: z.infer<typeof legacyMetaSchema>;
    }
  | undefined;

type LegacyRefs<T> =
  { tags: Record<string, T>; refs: Record<string, string> } | undefined;

// Compat: older httpd, see `legacyMetaSchema` and `crefsPayloadSchema`. It
// reports the counts and the default branch only in the project payload.
// Client: remove when explorer drops httpd 0.30.
export function legacyRepoFields<T>(
  project: LegacyProject,
  crefs: z.infer<typeof crefsPayloadSchema>,
  refs: LegacyRefs<T>,
) {
  const meta = project?.meta;
  const defaultBranch = legacyDefaultBranch(project, crefs);
  return {
    cobs: meta
      ? { patches: meta.patches, issues: meta.issues, releases: undefined }
      : undefined,
    releaseCount: meta?.releases,
    defaultBranch,
    refs: legacyRefs(project, defaultBranch, refs),
  };
}

// httpd before 0.25.0 sends no canonical refs, and 0.25.0 leaves the default
// branch out of them unless the repo has a crefs payload. Both report the tip
// as `meta.head`, so add it to the canonical refs.
function legacyRefs<T>(
  project: LegacyProject,
  defaultBranch: string | undefined,
  refs: LegacyRefs<T>,
) {
  const head = project?.meta?.head;
  if (
    head === undefined ||
    defaultBranch === undefined ||
    refs?.refs[defaultBranch] !== undefined ||
    // `meta.head` is the tip of the project's default branch, which a crefs
    // HEAD may name differently.
    defaultBranch !== `refs/heads/${project?.data.defaultBranch}`
  ) {
    return refs;
  }
  return {
    tags: refs?.tags ?? {},
    refs: { ...refs?.refs, [defaultBranch]: head },
  };
}

// Like heartwood's `Doc::default_branch`: the crefs `HEAD`, which may point
// at another symbolic ref, else the project payload. Only a branch counts.
function legacyDefaultBranch(
  project: { data: { defaultBranch: string } } | undefined,
  crefs: z.infer<typeof crefsPayloadSchema>,
): string | undefined {
  const symbolic = crefs?.data.symbolic;
  if (symbolic?.HEAD !== undefined) {
    const seen = new Set<string>();
    let target: string | undefined = symbolic.HEAD;
    while (target !== undefined && !seen.has(target)) {
      if (target.startsWith("refs/")) {
        return target.startsWith("refs/heads/") ? target : undefined;
      }
      seen.add(target);
      target = symbolic[target];
    }
    return undefined;
  }
  return project ? `refs/heads/${project.data.defaultBranch}` : undefined;
}

// Compat: older httpd ignores `scope` and only knows `allAuthors`, which
// asks for every author. Client: remove when explorer drops httpd 0.30.
export function legacyReleasesQuery(
  scope: ReleaseScope | undefined,
): Record<string, boolean> {
  return scope === "untrusted" ? { allAuthors: true } : {};
}

// Whether a node serves releases. Compat: older httpd has no `releases` flag
// in `/info`. It sends a release count unless it was built without release
// support, so a count means support. Client: remove when explorer drops httpd
// 0.30.
export function releasesSupported(
  flag: boolean | undefined,
  repo: { releaseCount?: number },
): boolean {
  return flag ?? repo.releaseCount !== undefined;
}

// Compat: older httpd answers the untrusted scope with every author, so
// keep only the releases that no delegate created. A no-op on newer nodes.
// Client: remove when explorer drops httpd 0.30.
export function legacyScopeReleases(
  releases: Release[],
  delegates: Author[],
  scope: ReleaseScope,
): Release[] {
  if (scope === "trusted") {
    return releases;
  }
  const delegateIds = new Set(delegates.map(d => d.id));
  return releases.filter(r => !delegateIds.has(r.creator.id));
}

// Compat: older httpd reports no release buckets, so look for others'
// releases in the first page of every author. A full page means others may
// come later, and only the filter depends on this, so a full page or a failed
// fetch counts as having others. Client: remove when explorer drops httpd
// 0.30.
export async function legacyHasOtherReleases(
  getPage: () => Promise<Release[]>,
  delegates: Author[],
  perPage: number,
): Promise<boolean> {
  const everyAuthor = await getPage().catch(() => undefined);
  if (everyAuthor === undefined || everyAuthor.length === perPage) {
    return true;
  }
  return legacyScopeReleases(everyAuthor, delegates, "untrusted").length > 0;
}
