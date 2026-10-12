import { beforeEach, expect, test, vi } from "vitest";

const defaults = {
  showTree: true,
  diffStyle: "unified",
  wordWrap: false,
  indicators: "bars",
  lineDiffType: "word-alt",
};

async function load() {
  const { diffOptions } = await import("@app/lib/diffOptions.svelte");
  const { flushSync } = await import("svelte");
  return { diffOptions, flushSync };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

test("starts with the defaults when nothing is stored", async () => {
  expect((await load()).diffOptions).toEqual(defaults);
});

test("merges stored options over the defaults", async () => {
  localStorage.setItem(
    "diffOptions",
    JSON.stringify({ diffStyle: "split", wordWrap: true }),
  );

  expect((await load()).diffOptions).toEqual({
    ...defaults,
    diffStyle: "split",
    wordWrap: true,
  });
});

test.each([
  "{not json",
  "null",
  JSON.stringify({ diffStyle: "sideways", wordWrap: true }),
])("falls back to the defaults for %s", async stored => {
  localStorage.setItem("diffOptions", stored);

  expect((await load()).diffOptions).toEqual(defaults);
});

test("persists changes", async () => {
  const { diffOptions, flushSync } = await load();
  diffOptions.indicators = "none";
  flushSync();

  expect(JSON.parse(localStorage.getItem("diffOptions") ?? "")).toEqual({
    ...defaults,
    indicators: "none",
  });
});
