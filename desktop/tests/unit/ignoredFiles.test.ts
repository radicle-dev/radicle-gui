import type { FileDiff } from "@bindings/diff/FileDiff";

import { expect, test } from "vitest";

import { isIgnoredFile, isIgnoredPath } from "@app/lib/ignoredFiles";

const diff = { type: "empty" } as const;

test.each([
  ["Cargo.lock", true],
  ["web/package-lock.json", true],
  ["a/b/go.sum", true],
  ["Cargo.lock.bak", false],
  ["cargo.lock", false],
  ["Cargo.lock/main.rs", false],
  ["src/main.rs", false],
])("isIgnoredPath(%j) is %s", (path, expected) => {
  expect(isIgnoredPath(path)).toBe(expected);
});

test("isIgnoredFile judges a renamed file by its new path", () => {
  const moved = (oldPath: string, newPath: string): FileDiff => ({
    status: "moved",
    oldPath,
    newPath,
    diff,
  });

  expect(isIgnoredFile(moved("yarn.lock", "notes.txt"))).toBe(false);
  expect(isIgnoredFile(moved("notes.txt", "yarn.lock"))).toBe(true);
});
