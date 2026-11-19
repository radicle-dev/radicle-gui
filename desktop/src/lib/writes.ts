import type { Key } from "@radicle-gui/core/keys";

import { keys } from "@radicle-gui/core/keys";
import { affectedKeys, cobTypes } from "@radicle-gui/core/refUpdates";

const { issue: ISSUE, patch: PATCH } = cobTypes;

interface WriteArgs {
  rid?: unknown;
  cobId?: unknown;
  new?: { id?: unknown };
  args?: { rid?: unknown };
}

// Write commands whose effect on the cache is mapped below. Other writes change
// data the cache doesn't hold.
export const mappedWrites = [
  "create_issue",
  "edit_issue",
  "delete_issue",
  "create_issue_comment",
  "edit_patch",
  "delete_patch",
  "create_patch_comment",
  "create_patch_review",
  "rebuild_issue_cache",
  "rebuild_patch_cache",
  "seed",
  "unseed",
  "clean",
  "clear_notifications",
];

// The keys a command's write affects, so that the user's own changes show
// whether or not the node announces them: it doesn't with announcing off or
// while it is stopped. Views that apply pinned state still wait
// for their own refetch.
export function writtenKeys(
  cmd: string,
  args: unknown,
  result: unknown,
): Key[] {
  const { rid, cobId, new: created, args: nested } = (args ?? {}) as WriteArgs;
  const cob = (type: string, id: unknown) =>
    typeof rid === "string" && typeof id === "string"
      ? affectedKeys({ rid, refs: [`refs/cobs/${type}/${id}`] })
      : [];

  switch (cmd) {
    case "create_issue":
      return cob(ISSUE, (result as { id?: unknown } | undefined)?.id);
    case "edit_issue":
    case "delete_issue":
      return cob(ISSUE, cobId);
    case "create_issue_comment":
      return cob(ISSUE, created?.id);
    case "edit_patch":
    case "delete_patch":
      return cob(PATCH, cobId);
    case "create_patch_comment":
      return cob(PATCH, created?.id);
    // A review names its revision, not its patch, so every patch of the
    // repository is refetched while shown.
    case "create_patch_review":
      return typeof nested?.rid === "string"
        ? [keys.patchDetails(nested.rid), keys.patches(nested.rid)]
        : [];
    case "rebuild_issue_cache":
      return typeof rid === "string"
        ? [keys.issues(rid), keys.repoInfo(rid)]
        : [];
    case "rebuild_patch_cache":
      return typeof rid === "string"
        ? [keys.patches(rid), keys.repoInfo(rid)]
        : [];
    // The repository info says whether it is seeded, and the repository list
    // shows the seeded ones.
    case "seed":
    case "unseed":
      return typeof rid === "string" ? [keys.repoInfo(rid), keys.repos()] : [];
    // Cleaning removes other peers' refs, which can change anything shown.
    case "clean":
      return typeof rid === "string" ? [keys.repo(rid), keys.repos()] : [];
    case "clear_notifications":
      return [keys.notifications()];
    default:
      return [];
  }
}
