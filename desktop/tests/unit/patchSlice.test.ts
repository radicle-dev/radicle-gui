import { describe, expect, test } from "vitest";

import { sliceForRange } from "@app/lib/patchSlice";

const preamble = [
  "diff --git a/f.txt b/f.txt",
  "index 1111111..2222222 100644",
  "--- a/f.txt",
  "+++ b/f.txt",
];

// Old side: l1..l10 on lines 1-10. New side: l1-l4, L5, L5b, l6-l10 on lines
// 1-11.
const hunk = [
  "@@ -1,10 +1,11 @@ fn main",
  " l1",
  " l2",
  " l3",
  " l4",
  "-l5",
  "+L5",
  "+L5b",
  " l6",
  " l7",
  " l8",
  " l9",
  " l10",
];

function patch(...lines: string[]): string {
  return [...preamble, ...lines, ""].join("\n");
}

describe("sliceForRange", () => {
  test("cuts a new-side range down to its context and renumbers the hunk", () => {
    expect(sliceForRange(patch(...hunk), "new", 5, 6, 1)).toBe(
      patch("@@ -5,1 +5,2 @@", "-l5", "+L5", "+L5b"),
    );
  });

  test("keeps three lines of context by default", () => {
    expect(sliceForRange(patch(...hunk), "new", 5, 6)).toBe(
      patch(
        "@@ -3,5 +3,6 @@",
        " l3",
        " l4",
        "-l5",
        "+L5",
        "+L5b",
        " l6",
        " l7",
      ),
    );
  });

  test("cuts an old-side range", () => {
    expect(sliceForRange(patch(...hunk), "old", 5, 6, 1)).toBe(
      patch("@@ -4,2 +4,2 @@", " l4", "-l5", "+L5"),
    );
  });

  test("covers a multi-line range with context on both ends", () => {
    expect(sliceForRange(patch(...hunk), "new", 7, 9, 1)).toBe(
      patch("@@ -6,3 +6,4 @@", "+L5b", " l6", " l7", " l8"),
    );
  });

  test("keeps the hunk verbatim when the window covers all of it", () => {
    expect(sliceForRange(patch(...hunk), "new", 5, 6, 20)).toBe(patch(...hunk));
  });

  test("writes 0 for a side the slice has no lines on", () => {
    expect(sliceForRange(patch(...hunk), "new", 5, 7, 0)).toBe(
      patch("@@ -0,0 +5,2 @@", "+L5", "+L5b"),
    );
  });

  test("returns undefined when no hunk covers the range", () => {
    expect(sliceForRange(patch(...hunk), "new", 50, 51)).toBeUndefined();
    expect(sliceForRange(patch(...hunk), "old", 11, 12)).toBeUndefined();
  });

  test("uses the hunk that covers the range and keeps the preamble", () => {
    const twoHunks = patch(
      "@@ -1,2 +1,2 @@",
      "-a",
      "+A",
      " b",
      "@@ -20,3 +20,3 @@ fn second",
      " x",
      "-y",
      "+Y",
      " z",
    );

    expect(sliceForRange(twoHunks, "new", 21, 22, 0)).toBe(
      patch("@@ -0,0 +21,1 @@", "+Y"),
    );
    expect(sliceForRange(twoHunks, "new", 21, 22, 5)).toBe(
      patch("@@ -20,3 +20,3 @@ fn second", " x", "-y", "+Y", " z"),
    );
  });

  test("reads a hunk header without counts", () => {
    expect(sliceForRange(patch("@@ -3 +3 @@", "-c", "+C"), "new", 3, 4)).toBe(
      patch("@@ -3 +3 @@", "-c", "+C"),
    );
  });

  test("a no-newline marker doesn't shift the line numbers", () => {
    const noNewline = patch(
      "@@ -1,2 +1,2 @@",
      "-a",
      "\\ No newline at end of file",
      "+A",
      " b",
    );

    expect(sliceForRange(noNewline, "new", 2, 3, 0)).toBe(
      patch("@@ -2,1 +2,1 @@", " b"),
    );
  });
});
