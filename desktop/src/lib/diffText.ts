import type {
  FileNote,
  FileStatus,
} from "@app/components/diffFileHeaderState.svelte";
import type { FileDiff } from "@bindings/diff/FileDiff";
import type { Blob } from "@bindings/source/Blob";
import type { GitStatusEntry } from "@pierre/trees";

import { isIgnoredPath } from "@app/lib/ignoredFiles";
import { invoke } from "@app/lib/invoke";

// The repo-relative path identifying a file diff (the new side for renames
// and copies).
export function fileDiffPath(file: FileDiff): string {
  return file.status === "moved" || file.status === "copied"
    ? file.newPath
    : file.path;
}

/// How a file changed, worded for a chip beside its name. A plain modification
/// needs no chip — it is what a diff is by default.
export function fileStatusLabel(status: FileStatus): string | undefined {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "moved":
      return "Moved";
    case "copied":
      return "Copied";
    case "modified":
      return undefined;
  }
}

/// The changed files in the shape `PierreTree` marks its rows with. A copy reads
/// as an addition, which is what it is on the new side; there is no "copied" for
/// the tree to show.
export function gitStatusEntries(files: FileDiff[]): GitStatusEntry[] {
  return files.map((file): GitStatusEntry => {
    const path = fileDiffPath(file);
    switch (file.status) {
      case "added":
        return { path, status: "added" };
      case "deleted":
        return { path, status: "deleted" };
      case "modified":
        return { path, status: "modified" };
      case "moved":
        return { path, status: "renamed" };
      case "copied":
        return { path, status: "added" };
    }
  });
}

export interface FileMeta {
  // Files with no renderable text diff. Pierre has no binary concept and would
  // render them as an empty body with a dead expand caret, so the header shows a
  // note and drops the caret instead.
  notes: Map<string, FileNote>;
  statuses: Map<string, FileStatus>;
  // Lockfiles and generated manifests, which are noise in a review.
  ignored: Set<string>;
}

/// The per-file information a `PierreDiff` header needs, keyed by the path that
/// identifies each file. Taken from the structured diff, which is still what
/// says whether a file is binary and how it changed — the patch text Pierre
/// renders from does not.
export function fileMetaOf(files: FileDiff[]): FileMeta {
  const notes = new Map<string, FileNote>();
  const statuses = new Map<string, FileStatus>();
  const ignored = new Set<string>();
  for (const file of files) {
    const path = fileDiffPath(file);
    statuses.set(path, file.status);
    if (file.diff.type === "binary") {
      notes.set(path, "binary");
    } else if (file.diff.type === "empty") {
      notes.set(path, "empty");
    }
    if (isIgnoredPath(path)) {
      ignored.add(path);
    }
  }
  return { notes, statuses, ignored };
}

async function fetchBlob(
  rid: string,
  path: string,
  sha: string,
): Promise<string> {
  const blob = await invoke<Blob>("repo_blob", { rid, path, sha });
  return blob.binary ? "" : blob.content;
}

/// Fetch a file's full old and new contents on demand, so Pierre's
/// context-expand markers can hydrate a file that was parsed from a patch and
/// therefore only holds the lines around each change.
///
/// `base` is optional because a root commit has no parent to read the old side
/// from; added and deleted files only ever have one side either way.
export function fullFileLoader(
  rid: string,
  base: string | undefined,
  head: string,
  files: () => FileDiff[],
): (path: string) => Promise<{ oldContents: string; newContents: string }> {
  return async (path: string) => {
    const file = files().find(entry => fileDiffPath(entry) === path);
    let oldContents = "";
    let newContents = "";
    if (!file) {
      return { oldContents, newContents };
    }
    const oldPath =
      file.status === "moved" || file.status === "copied"
        ? file.oldPath
        : file.path;
    const newPath = fileDiffPath(file);
    const wantsOld = file.status !== "added" && base !== undefined;
    const wantsNew = file.status !== "deleted";
    [oldContents, newContents] = await Promise.all([
      wantsOld && base ? fetchBlob(rid, oldPath, base) : "",
      wantsNew ? fetchBlob(rid, newPath, head) : "",
    ]);
    return { oldContents, newContents };
  };
}

/// How many of the diff's files a reviewer has checked off. Checks left over
/// from files the diff no longer has don't count.
export function checkedFileProgress(
  files: FileDiff[],
  checkedFiles: string[],
): { filesChecked: number; filesTotal: number } {
  const paths = new Set(files.map(fileDiffPath));
  return {
    filesChecked: checkedFiles.filter(path => paths.has(path)).length,
    filesTotal: files.length,
  };
}

export function checkedPaths(
  files: FileDiff[],
  isChecked: (path: string) => boolean,
): Set<string> {
  return new Set(files.map(fileDiffPath).filter(isChecked));
}
