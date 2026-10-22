// The httpd support window, and shims that let this client read older httpd
// releases, so the app only ever sees one shape. See docs/adr/0001 and
// docs/api-changes.md.
//
// Each shim has a "Compat:" comment that says what older httpd does and the
// date after which no supported seed does it: "Client: remove after
// YYYY-MM-DD". Fallbacks to an older endpoint stay in the client method
// that calls the endpoint, with the same comment.

import type { Release } from "./repo/release.js";
import type { ReleaseScope } from "./repo.js";
import type { Author } from "./shared.js";
import type { z } from "zod";

import { number, object, record, string } from "zod";

// Explorer supports an httpd release for this many months after its release
// date.
export const supportMonths = 6;

// Whether a release from `releasedAt`, in seconds since the epoch, is past
// the support window.
export function isOutdated(releasedAt: number, now: Date = new Date()) {
  const supportedUntil = new Date(releasedAt * 1000);
  supportedUntil.setUTCMonth(supportedUntil.getUTCMonth() + supportMonths);
  return now > supportedUntil;
}

// The release date as YYYY-MM-DD.
export function releaseDate(releasedAt: number) {
  return new Date(releasedAt * 1000).toISOString().slice(0, 10);
}

// Compat: older httpd reports the issue and patch counts inside the project
// payload, and the release count as a single number. Client: remove after
// 2027-03-14.
export const legacyMetaSchema = object({
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
// resolves `HEAD` itself. A malformed payload counts as missing,
// so that the repo still parses. Client: remove after 2027-03-14.
export const crefsPayloadSchema = object({
  data: object({ symbolic: record(string(), string()).optional() }),
})
  .optional()
  .catch(undefined);

// Compat: older httpd, see `legacyMetaSchema` and `crefsPayloadSchema`. It
// reports the counts and the default branch only in the project payload.
// Client: remove after 2027-03-14.
export function legacyRepoFields(
  project:
    | {
        data: { defaultBranch: string };
        meta?: z.infer<typeof legacyMetaSchema>;
      }
    | undefined,
  crefs: z.infer<typeof crefsPayloadSchema>,
) {
  const meta = project?.meta;
  return {
    cobs: meta
      ? { patches: meta.patches, issues: meta.issues, releases: undefined }
      : undefined,
    releaseCount: meta?.releases,
    defaultBranch: legacyDefaultBranch(project, crefs),
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
// asks for every author. Client: remove after 2027-03-14.
export function legacyReleasesQuery(
  scope: ReleaseScope | undefined,
): Record<string, boolean> {
  return scope === "untrusted" ? { allAuthors: true } : {};
}

// Compat: older httpd answers the untrusted scope with every author, so
// keep only the releases that no delegate created. A no-op on newer nodes.
// Client: remove after 2027-03-14.
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
// fetch counts as having others. Client: remove after 2027-03-14.
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

// Compat: older httpd doesn't report `releasedAt`, so count it as released on
// 2026-09-14, the date of the last release without it. Client: remove after
// 2027-03-14.
export function legacyReleasedAt(releasedAt: number | undefined): number {
  return releasedAt ?? Date.UTC(2026, 8, 14) / 1000;
}
