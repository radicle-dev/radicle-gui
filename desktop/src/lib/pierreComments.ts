import type { FileStatus } from "@app/components/diffFileHeaderState.svelte";
import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
import type { CodeRange } from "@bindings/cob/thread/CodeRange";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs";

/// Where a code comment sits in a rendered diff: a side of a line in a file.
///
/// `line` is an absolute blob line number — the old file's for `deletions`, the
/// new file's for `additions` — which is also how Pierre numbers the two sides
/// of a diff. Pierre renders the backend's exact diff rather than re-diffing, so
/// the two numbering schemes agree and this mapping needs no fuzzy matching.
export interface CommentAnchor {
  path: string;
  side: AnnotationSide;
  line: number;
}

/// An open new-comment composer. The reader can drag the gutter marker across
/// several lines, so it covers a range; it renders on the last line, which is
/// where the published comment will read back from (see `lineOf`).
export interface ComposerTarget {
  path: string;
  side: AnnotationSide;
  firstLine: number;
  lastLine: number;
}

/// What a rendered annotation slot has to show: everything anchored to one side
/// of one line, since Pierre derives the slot name from the side and line alone
/// and so gives each of them a single slot.
export interface LineAnnotation {
  path: string;
  side: AnnotationSide;
  line: number;
  threads: Thread<CodeLocation>[];
  composer?: ComposerTarget;
}

/// The line a `CodeRange` points at.
///
/// A `lines` range's `start` is a line number and its `end` is exclusive, so the
/// line it points at is `end - 1`. That is also what the diff renderer this
/// replaced matched on, which keeps every comment already on the network landing
/// exactly where it does today; a multi-line range therefore renders under its
/// last line.
///
/// This app never writes a `chars` range. One from another client is placed on
/// its line, on the assumption that `line` counts the same way `lines.start`
/// does.
function lineOf(range: CodeRange): number {
  return range.type === "lines" ? range.range.end - 1 : range.line;
}

/// Which side of which line a comment is anchored to, or `undefined` for a
/// comment with no code location (a plain review or revision comment).
///
/// A location carries an old range, a new range, or both. Both is not something
/// this app writes; the new side wins, matching what the reader sees on an
/// unchanged line in a unified diff.
export function anchorOf(
  location: CodeLocation | null | undefined,
): CommentAnchor | undefined {
  if (!location) return undefined;
  if (location.new) {
    return {
      path: location.path,
      side: "additions",
      line: lineOf(location.new),
    };
  }
  if (location.old) {
    return {
      path: location.path,
      side: "deletions",
      line: lineOf(location.old),
    };
  }
  return undefined;
}

/// The `CodeLocation` for a comment written against a composer's line range, in
/// the same numbering `anchorOf` reads back.
export function locationOf(
  commit: string,
  target: ComposerTarget,
): CodeLocation {
  const range: CodeRange = {
    type: "lines",
    range: {
      start: Math.min(target.firstLine, target.lastLine),
      end: Math.max(target.firstLine, target.lastLine) + 1,
    },
  };
  return {
    commit,
    path: target.path,
    old: target.side === "deletions" ? range : null,
    new: target.side === "additions" ? range : null,
  };
}

/// The lines a comment covers, as text: `R12` for one line on the new side,
/// `L3-L9` for a range on the old one.
export function formatAnchorLines(location: CodeLocation): string | undefined {
  const range = lineRangeOf(location);
  if (!range) return undefined;
  const marker = range.side === "new" ? "R" : "L";
  const end = range.end - 1;
  return range.start >= end
    ? `${marker}${end}`
    : `${marker}${range.start}-${marker}${end}`;
}

/// A comment's anchor with the file it is in, e.g. `foo.ts:R12` or
/// `foo.ts:L3-L9`. For contexts that do not already say which file it is.
export function formatAnchor(location: CodeLocation): string {
  const lines = formatAnchorLines(location);
  return lines ? `${location.path}:${lines}` : location.path;
}

/// Comments cannot be anchored in a file whose content moved: a `CodeLocation`
/// names one path, and which side of the rename it means is ambiguous.
export function isCommentableStatus(status: FileStatus | undefined): boolean {
  return status !== "moved" && status !== "copied";
}

function keyOf(side: AnnotationSide, line: number): string {
  return `${side}:${line}`;
}

/// Group everything that has to be rendered inside a file's diff into one
/// annotation per (side, line), in the shape Pierre takes on a `CodeViewItem`.
///
/// `threads` is the whole set on the diff, filtered by the caller to the sources
/// the reader chose to see; only the ones anchored in this file are used.
export function fileAnnotations(
  path: string,
  threads: Thread<CodeLocation>[],
  composer: ComposerTarget | undefined,
): DiffLineAnnotation<LineAnnotation>[] {
  const byLine = new Map<string, LineAnnotation>();

  function entryFor(side: AnnotationSide, line: number): LineAnnotation {
    const key = keyOf(side, line);
    const existing = byLine.get(key);
    if (existing) return existing;
    const created: LineAnnotation = { path, side, line, threads: [] };
    byLine.set(key, created);
    return created;
  }

  for (const thread of threads) {
    const anchor = anchorOf(thread.root.location);
    if (!anchor || anchor.path !== path) continue;
    entryFor(anchor.side, anchor.line).threads.push(thread);
  }

  if (composer && composer.path === path) {
    entryFor(composer.side, composer.lastLine).composer = composer;
  }

  const annotations: DiffLineAnnotation<LineAnnotation>[] = [];
  for (const entry of byLine.values()) {
    // A line can carry more than one thread: two reviewers can comment on the
    // same line, and a comment can arrive over the network onto a line we just
    // commented on ourselves. Oldest first, so none is shadowed by another.
    entry.threads.sort(
      (a, b) => a.root.edits[0].timestamp - b.root.edits[0].timestamp,
    );
    annotations.push({
      side: entry.side,
      lineNumber: entry.line,
      metadata: entry,
    });
  }
  return annotations;
}

/// Resolved and unresolved thread counts per file, for the file headers.
///
/// Only threads that can be resolved are counted: draft and standalone revision
/// comments carry a `resolved` flag that no action can ever set, so counting
/// them would leave a file permanently showing unresolved work.
export function commentCountsByPath(
  threads: Thread<CodeLocation>[],
  canResolve: (commentId: string) => boolean,
): Map<string, { resolved: number; unresolved: number }> {
  const counts = new Map<string, { resolved: number; unresolved: number }>();
  for (const thread of threads) {
    const anchor = anchorOf(thread.root.location);
    if (!anchor) continue;
    if (!canResolve(thread.root.id)) continue;
    const entry = counts.get(anchor.path) ?? { resolved: 0, unresolved: 0 };
    if (thread.root.resolved === true) {
      entry.resolved += 1;
    } else if (thread.root.resolved === false) {
      entry.unresolved += 1;
    }
    counts.set(anchor.path, entry);
  }
  return counts;
}

// Which lines of which side a comment is about, end exclusive.
export function lineRangeOf(
  location: CodeLocation,
): { side: "old" | "new"; start: number; end: number } | undefined {
  const range = location.new ?? location.old;
  if (!range) return undefined;
  const side = location.new ? "new" : "old";
  if (range.type === "chars") {
    return { side, start: range.line, end: range.line + 1 };
  }
  return { side, start: range.range.start, end: range.range.end };
}

export function commentedLines(location: CodeLocation): number[] {
  const range = lineRangeOf(location);
  if (!range) return [];
  const lines: number[] = [];
  for (let line = range.start; line < range.end; line++) {
    lines.push(line);
  }
  return lines;
}

// Which slots a file's annotations occupy, and only that. Replacing a file's
// annotation array makes Pierre drop every measured annotation height in that
// file and lay it out as if the comments had no height at all, which yanks the
// scroll position; so it is only told when the set of slots really changes.
// What goes *in* a slot is pushed straight into the mounted component instead
// (see `syncAnnotationSlots` in PierreDiff), which is all a reply, an edit or a
// resolve touches.
export function annotationSignature(
  annotations: DiffLineAnnotation<LineAnnotation>[] | undefined,
): string {
  return (annotations ?? [])
    .map(({ side, lineNumber }) => `${side}:${lineNumber}`)
    .sort()
    .join("|");
}

// The lines a gutter drag covers. A drag in a split diff can end on the other
// side, where the end line counts a different file. There is no range that
// means both, so keep the line it started from.
export function composerLines(range: {
  start: number;
  end: number;
  side?: AnnotationSide;
  endSide?: AnnotationSide;
}): { side: AnnotationSide; firstLine: number; lastLine: number } {
  const side = range.side ?? "additions";
  const crossSide = range.endSide !== undefined && range.endSide !== side;
  const end = crossSide ? range.start : range.end;
  return {
    side,
    firstLine: Math.min(range.start, end),
    lastLine: Math.max(range.start, end),
  };
}

// How a diff entry changed. `fileStatuses` is keyed by path, so the two entries
// of a type change would both read as whichever half the structured diff
// recorded last; Pierre parsed each entry on its own and knows which this is.
export function entryStatus(
  status: FileStatus | undefined,
  entryType: string,
): FileStatus | undefined {
  if (status === "added" && entryType === "deleted") return "deleted";
  if (status === "deleted" && entryType === "new") return "added";
  return status;
}

// An id per file, in order. A type change is one path arriving as two entries,
// and CodeView throws on a duplicate id, so the repeats are numbered. The
// first keeps the bare path, which is what scroll targets and collapsed paths
// resolve by. NUL is the separator because a path cannot contain one.
export function itemIds(names: string[]): string[] {
  const occurrences = new Map<string, number>();
  return names.map(name => {
    const seen = occurrences.get(name) ?? 0;
    occurrences.set(name, seen + 1);
    return seen === 0 ? name : `${name}\u0000${seen + 1}`;
  });
}
