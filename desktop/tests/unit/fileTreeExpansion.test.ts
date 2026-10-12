import { expect, test } from "vitest";

import type { FolderExpansion, Location } from "@app/lib/fileTreeExpansion";
import {
  isFolderExpanded,
  openAncestors,
  toggleFolder,
} from "@app/lib/fileTreeExpansion";

function create(): FolderExpansion {
  return { opened: new Set(), collapsedOnVisit: new Map() };
}

let visits = 0;
function navigate(state: FolderExpansion, path: string): Location {
  openAncestors(state, path);
  return { path, visit: ++visits };
}

test("folders containing the open file are expanded", () => {
  const state = create();
  const location = { path: "docs/guides/setup.md", visit: 0 };

  expect(isFolderExpanded(state, "docs/", location)).toBe(true);
  expect(isFolderExpanded(state, "docs/guides/", location)).toBe(true);
  expect(isFolderExpanded(state, "src/", location)).toBe(false);
});

test("only the open file's own ancestors are expanded", () => {
  const state = create();
  const location = navigate(state, "src/doc/readme.md");

  expect(isFolderExpanded(state, "doc/", location)).toBe(false);
  expect(isFolderExpanded(state, "src/do/", location)).toBe(false);
});

test("a file at the root opens no folders", () => {
  const state = create();
  navigate(state, "README.md");

  expect(state.opened.size).toBe(0);
});

test("folders stay open after navigating to a file elsewhere", () => {
  const state = create();
  navigate(state, "docs/guides/setup.md");
  const location = navigate(state, "src/main.ts");

  expect(isFolderExpanded(state, "docs/", location)).toBe(true);
  expect(isFolderExpanded(state, "docs/guides/", location)).toBe(true);
});

test("a folder opened by hand stays open after navigating", () => {
  const state = create();
  toggleFolder(state, "src/", navigate(state, "README.md"));
  const location = navigate(state, "docs/setup.md");

  expect(isFolderExpanded(state, "src/", location)).toBe(true);
});

test("a folder collapsed by hand stays closed after navigating elsewhere", () => {
  const state = create();
  toggleFolder(state, "docs/", navigate(state, "docs/setup.md"));
  const location = navigate(state, "src/main.ts");

  expect(isFolderExpanded(state, "docs/", location)).toBe(false);
});

test("the open file's folder can be collapsed and expanded again", () => {
  const state = create();
  const location = navigate(state, "docs/setup.md");

  toggleFolder(state, "docs/", location);
  expect(isFolderExpanded(state, "docs/", location)).toBe(false);

  toggleFolder(state, "docs/", location);
  expect(isFolderExpanded(state, "docs/", location)).toBe(true);
});

test("navigating into a collapsed folder expands it", () => {
  const state = create();
  toggleFolder(state, "docs/", navigate(state, "docs/setup.md"));
  const location = navigate(state, "docs/usage.md");

  expect(isFolderExpanded(state, "docs/", location)).toBe(true);
});

test("navigating back to the file a folder was collapsed on expands it", () => {
  const state = create();
  toggleFolder(state, "docs/", navigate(state, "docs/setup.md"));
  navigate(state, "src/main.ts");
  const location = navigate(state, "docs/setup.md");

  expect(isFolderExpanded(state, "docs/", location)).toBe(true);
});
