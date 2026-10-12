import type { DiffContent } from "@bindings/diff/DiffContent";
import type { FileDiff } from "@bindings/diff/FileDiff";

import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkedFileProgress,
  checkedPaths,
  fileDiffPath,
  fileMetaOf,
  fullFileLoader,
  gitStatusEntries,
} from "@app/lib/diffText";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@app/lib/invoke", () => ({ invoke }));

const plain: DiffContent = {
  type: "plain",
  stats: { additions: 1, deletions: 0 },
};

const added: FileDiff = { status: "added", path: "new.ts", diff: plain };
const deleted: FileDiff = { status: "deleted", path: "old.ts", diff: plain };
const modified: FileDiff = { status: "modified", path: "a.ts", diff: plain };
const moved: FileDiff = {
  status: "moved",
  oldPath: "from.ts",
  newPath: "to.ts",
  diff: plain,
};
const copied: FileDiff = {
  status: "copied",
  oldPath: "orig.ts",
  newPath: "copy.ts",
  diff: plain,
};

test("fileDiffPath names renames and copies by their new path", () => {
  expect([added, deleted, modified, moved, copied].map(fileDiffPath)).toEqual([
    "new.ts",
    "old.ts",
    "a.ts",
    "to.ts",
    "copy.ts",
  ]);
});

test("gitStatusEntries marks a rename as renamed and a copy as added", () => {
  expect(gitStatusEntries([added, deleted, modified, moved, copied])).toEqual([
    { path: "new.ts", status: "added" },
    { path: "old.ts", status: "deleted" },
    { path: "a.ts", status: "modified" },
    { path: "to.ts", status: "renamed" },
    { path: "copy.ts", status: "added" },
  ]);
});

test("fileMetaOf notes unrenderable files and lockfiles", () => {
  const meta = fileMetaOf([
    moved,
    { status: "added", path: "logo.png", diff: { type: "binary" } },
    { status: "added", path: "empty.txt", diff: { type: "empty" } },
    { status: "modified", path: "web/package-lock.json", diff: plain },
  ]);

  expect(Object.fromEntries(meta.statuses)).toEqual({
    "to.ts": "moved",
    "logo.png": "added",
    "empty.txt": "added",
    "web/package-lock.json": "modified",
  });
  expect(Object.fromEntries(meta.notes)).toEqual({
    "logo.png": "binary",
    "empty.txt": "empty",
  });
  expect([...meta.ignored]).toEqual(["web/package-lock.json"]);
});

test("checkedFileProgress ignores checks on files the diff no longer has", () => {
  expect(
    checkedFileProgress([modified, moved], ["a.ts", "from.ts", "gone.ts"]),
  ).toEqual({ filesChecked: 1, filesTotal: 2 });
});

test("checkedPaths names checked files by their diff path", () => {
  expect([...checkedPaths([modified, moved], path => path !== "a.ts")]).toEqual(
    ["to.ts"],
  );
});

describe("fullFileLoader", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(
      (_cmd, { path, sha }: { path: string; sha: string }) =>
        Promise.resolve(
          path.endsWith(".png")
            ? { binary: true, content: "\u0089PNG" }
            : { binary: false, content: `${path}@${sha}` },
        ),
    );
  });

  const load = (files: FileDiff[]) =>
    fullFileLoader("rad:z", "base", "head", () => files);

  test("reads a rename's old side from its old path", async () => {
    expect(await load([moved])("to.ts")).toEqual({
      oldContents: "from.ts@base",
      newContents: "to.ts@head",
    });
  });

  test("reads only the side a file has", async () => {
    expect(await load([added])("new.ts")).toEqual({
      oldContents: "",
      newContents: "new.ts@head",
    });
    expect(await load([deleted])("old.ts")).toEqual({
      oldContents: "old.ts@base",
      newContents: "",
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  test("has no old side without a base", async () => {
    const rootCommit = fullFileLoader("rad:z", undefined, "head", () => [
      modified,
    ]);
    expect(await rootCommit("a.ts")).toEqual({
      oldContents: "",
      newContents: "a.ts@head",
    });
  });

  test("gives binary blobs and unknown paths no contents", async () => {
    const binary: FileDiff = {
      status: "modified",
      path: "logo.png",
      diff: { type: "binary" },
    };
    expect(await load([binary])("logo.png")).toEqual({
      oldContents: "",
      newContents: "",
    });
    expect(await load([modified])("missing.ts")).toEqual({
      oldContents: "",
      newContents: "",
    });
  });
});
