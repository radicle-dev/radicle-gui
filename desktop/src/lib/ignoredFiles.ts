import type { FileDiff } from "@bindings/diff/FileDiff";

import { fileDiffPath } from "@app/lib/diffText";

// Files that add noise to patch diffs (lockfiles, generated manifests).
// These are hidden from the revision file preview and auto-collapsed in the
// Changes tab. Add new entries here to apply both behaviours.
export const IGNORED_FILENAMES: ReadonlySet<string> = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
  "flake.lock",
]);

export function isIgnoredPath(path: string): boolean {
  return IGNORED_FILENAMES.has(path.slice(path.lastIndexOf("/") + 1));
}

export function isIgnoredFile(file: FileDiff): boolean {
  return isIgnoredPath(fileDiffPath(file));
}
