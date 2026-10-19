export type Snapshot = Record<string, string>;

export type DiffLine =
  | { type: "context"; old: number; new: number; text: string }
  | { type: "add"; new: number; text: string }
  | { type: "del"; old: number; text: string };

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  status: "added" | "deleted" | "modified";
  additions: number;
  deletions: number;
  hunks: Hunk[];
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Classic LCS line diff. Fixture files are small, so the quadratic table is
// fine and the output is stable and easy to read.
function lineOps(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const table: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) table.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "context", old: i + 1, new: j + 1, text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: "del", old: i + 1, text: a[i] });
      i++;
    } else {
      out.push({ type: "add", new: j + 1, text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", old: i + 1, text: a[i++] });
  while (j < m) out.push({ type: "add", new: j + 1, text: b[j++] });
  return out;
}

function toHunks(ops: DiffLine[], context: number): Hunk[] {
  const hunks: Hunk[] = [];
  const changed = ops
    .map((op, idx) => (op.type === "context" ? -1 : idx))
    .filter(idx => idx >= 0);
  if (changed.length === 0) return hunks;

  let start = Math.max(0, changed[0] - context);
  let end = Math.min(ops.length - 1, changed[0] + context);
  const ranges: [number, number][] = [];
  for (const idx of changed.slice(1)) {
    if (idx - context <= end + 1) {
      end = Math.min(ops.length - 1, idx + context);
    } else {
      ranges.push([start, end]);
      start = Math.max(0, idx - context);
      end = Math.min(ops.length - 1, idx + context);
    }
  }
  ranges.push([start, end]);

  for (const [s, e] of ranges) {
    const lines = ops.slice(s, e + 1);
    let oldStart = 0;
    let newStart = 0;
    // Find the line numbers the hunk starts at, looking back if the first
    // line only exists on one side.
    for (let k = s; k >= 0; k--) {
      const op = ops[k];
      if (!oldStart && op.type !== "add") oldStart = op.old + (k < s ? 1 : 0);
      if (!newStart && op.type !== "del") newStart = op.new + (k < s ? 1 : 0);
      if (oldStart && newStart) break;
    }
    hunks.push({
      oldStart: oldStart || 1,
      newStart: newStart || 1,
      oldLines: lines.filter(l => l.type !== "add").length,
      newLines: lines.filter(l => l.type !== "del").length,
      lines,
    });
  }
  return hunks;
}

export function diffFile(
  path: string,
  before: string | undefined,
  after: string | undefined,
  context = 3,
): FileDiff | undefined {
  if (before === after) return undefined;
  const ops = lineOps(splitLines(before ?? ""), splitLines(after ?? ""));
  return {
    path,
    status:
      before === undefined
        ? "added"
        : after === undefined
          ? "deleted"
          : "modified",
    additions: ops.filter(o => o.type === "add").length,
    deletions: ops.filter(o => o.type === "del").length,
    hunks: toHunks(ops, context),
  };
}

export function diffSnapshots(
  before: Snapshot,
  after: Snapshot,
  context = 3,
): FileDiff[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths]
    .sort()
    .map(path => diffFile(path, before[path], after[path], context))
    .filter((d): d is FileDiff => d !== undefined);
}

export function diffStats(files: FileDiff[]): DiffStats {
  return {
    files: files.length,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };
}
