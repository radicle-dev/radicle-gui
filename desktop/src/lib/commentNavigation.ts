import type { FileStatus } from "@app/components/diffFileHeaderState.svelte";
import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
import type { Thread } from "@bindings/cob/thread/Thread";

import type { CommentAnchor } from "@app/lib/pierreComments";
import { anchorOf, isCommentableStatus } from "@app/lib/pierreComments";

export interface OrderedComment {
  id: string;
  anchor: CommentAnchor;
}

/// Every comment on a diff in the order it is rendered: by file, in the order
/// the files appear, then down the lines of each. A deletion renders above an
/// addition on the same line, and two comments on one line oldest first.
///
/// Comments are left out for the same reasons the diff leaves them out: the file
/// isn't in this diff, or its content moved and an anchor in it is ambiguous.
export function orderComments(
  threads: Thread<CodeLocation>[],
  filePaths: string[],
  statusOf: (path: string) => FileStatus | undefined,
): OrderedComment[] {
  const fileOrder = new Map(filePaths.map((path, index) => [path, index]));
  return threads
    .flatMap(thread => {
      const anchor = anchorOf(thread.root.location);
      if (!anchor) return [];
      const order = fileOrder.get(anchor.path);
      if (order === undefined) return [];
      if (!isCommentableStatus(statusOf(anchor.path))) return [];
      return [
        {
          id: thread.root.id,
          anchor,
          order,
          side: anchor.side === "deletions" ? 0 : 1,
          timestamp: thread.root.edits[0].timestamp,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.anchor.line - b.anchor.line ||
        a.side - b.side ||
        a.timestamp - b.timestamp,
    )
    .map(({ id, anchor }) => ({ id, anchor }));
}

/// The index a step of `delta` (`1` or `-1`) lands on in a list of `total`.
/// From nothing (`current` is `-1`), a step down starts at the first item and a
/// step up at the last. From somewhere, both wrap, so a walk never dead-ends.
export function stepIndex(
  current: number,
  total: number,
  delta: number,
): number | undefined {
  if (total === 0) return undefined;
  const from = current >= 0 ? current : delta > 0 ? -1 : 0;
  return (from + delta + total) % total;
}

/// The commit a step of `delta` selects, clamped to the list. From no
/// selection, stepping back selects the last commit and forward the first.
export function stepCommitIndex(
  current: number,
  total: number,
  delta: number,
): number {
  const next = current === -1 ? (delta > 0 ? 0 : total - 1) : current + delta;
  return Math.max(0, Math.min(next, total - 1));
}

/// File groups in diff order, each file's threads in line order. Groups for
/// files that aren't in the diff are dropped.
export function orderFileGroups(
  groups: { path: string; threads: Thread<CodeLocation>[] }[],
  filePaths: string[],
): { path: string; threads: Thread<CodeLocation>[] }[] {
  const order = new Map(filePaths.map((path, index) => [path, index]));
  return groups
    .filter(group => order.has(group.path))
    .sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0))
    .map(group => ({
      path: group.path,
      threads: [...group.threads].sort(
        (a, b) =>
          (anchorOf(a.root.location)?.line ?? 0) -
          (anchorOf(b.root.location)?.line ?? 0),
      ),
    }));
}
