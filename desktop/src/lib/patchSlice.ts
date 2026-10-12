/// Cutting a single-file unified diff down to the few lines a code comment is
/// about, as text.
///
/// Text rather than the structured `Diff` because that is what `@pierre/diffs`
/// renders from: a snippet is just a smaller patch, and a patch with one hunk in
/// it parses exactly like any other. The alternative — slicing the structured
/// diff and asking the renderer to draw a hunk out of context — is what this
/// replaced.

/// `@@ -oldStart,oldCount +newStart,newCount @@`, with the counts optional (git
/// omits them for a single line) and anything after the closing `@@` — the
/// enclosing function git sometimes names — ignored.
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

interface Hunk {
  /// Kept verbatim so an unclamped hunk goes back out exactly as git wrote it,
  /// including the enclosing function name after the closing `@@`.
  header: string;
  oldStart: number;
  newStart: number;
  /// Body lines, each still carrying its ` `, `+` or `-` prefix. A
  /// `\ No newline at end of file` marker counts as part of the line above it.
  lines: string[];
}

/// The lines of a patch before its first hunk (the `diff --git`, `index`, `---`
/// and `+++` headers), and then each hunk.
function parse(patch: string): { preamble: string[]; hunks: Hunk[] } {
  const preamble: string[] = [];
  const hunks: Hunk[] = [];
  let current: Hunk | undefined;
  for (const line of patch.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      current = {
        header: line,
        oldStart: Number(header[1]),
        newStart: Number(header[3]),
        lines: [],
      };
      hunks.push(current);
      continue;
    }
    if (!current) {
      preamble.push(line);
      continue;
    }
    // A trailing empty line from the split, and anything after the last hunk
    // that is not a body line, is not part of it.
    if (line === "") continue;
    current.lines.push(line);
  }
  return { preamble, hunks };
}

/// Which line of which side each body line is, so a slice can be renumbered.
/// `undefined` for the side a line does not appear on.
interface Numbered {
  line: string;
  old?: number;
  new?: number;
}

function number(hunk: Hunk): Numbered[] {
  const numbered: Numbered[] = [];
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  for (const line of hunk.lines) {
    if (line.startsWith("\\")) {
      // "\ No newline at end of file" — belongs to whichever line came before.
      numbered.push({ line });
      continue;
    }
    if (line.startsWith("+")) {
      numbered.push({ line, new: newLine });
      newLine += 1;
    } else if (line.startsWith("-")) {
      numbered.push({ line, old: oldLine });
      oldLine += 1;
    } else {
      numbered.push({ line, old: oldLine, new: newLine });
      oldLine += 1;
      newLine += 1;
    }
  }
  return numbered;
}

function join(preamble: string[], header: string, lines: string[]): string {
  return [...preamble, header, ...lines, ""].join("\n");
}

/// Rebuild a hunk header for a slice of a hunk's lines, since the positions and
/// counts of both sides change with it.
function render(preamble: string[], lines: Numbered[]): string {
  let oldStart: number | undefined;
  let newStart: number | undefined;
  let oldCount = 0;
  let newCount = 0;
  for (const { old, new: next } of lines) {
    if (old !== undefined) {
      oldStart ??= old;
      oldCount += 1;
    }
    if (next !== undefined) {
      newStart ??= next;
      newCount += 1;
    }
  }
  // A hunk with nothing on a side still has to name a position on it, and git
  // writes 0 there.
  const header = `@@ -${oldCount === 0 ? 0 : (oldStart ?? 1)},${oldCount} +${newCount === 0 ? 0 : (newStart ?? 1)},${newCount} @@`;
  return join(
    preamble,
    header,
    lines.map(({ line }) => line),
  );
}

/// Cut `patch` down to `context` lines either side of `[start, end)` on one
/// side, within the hunk that covers it.
///
/// `undefined` when no hunk covers the range, which means the comment is
/// anchored outside the diff — a stale comment on a line a later revision
/// changed, say.
export function sliceForRange(
  patch: string,
  side: "old" | "new",
  start: number,
  end: number,
  context = 3,
): string | undefined {
  const { preamble, hunks } = parse(patch);
  for (const hunk of hunks) {
    const lines = number(hunk);
    const covered: number[] = [];
    lines.forEach(({ old, new: next }, index) => {
      const lineNumber = side === "new" ? next : old;
      if (lineNumber !== undefined && lineNumber >= start && lineNumber < end) {
        covered.push(index);
      }
    });
    if (covered.length === 0) continue;

    const first = Math.max(0, covered[0] - context);
    const last = Math.min(
      lines.length - 1,
      covered[covered.length - 1] + context,
    );
    // The whole hunk, verbatim, when it is already no bigger than the window —
    // which keeps git's own header, including the enclosing function name.
    if (first === 0 && last === lines.length - 1) {
      return join(preamble, hunk.header, hunk.lines);
    }
    return render(preamble, lines.slice(first, last + 1));
  }
  return undefined;
}
