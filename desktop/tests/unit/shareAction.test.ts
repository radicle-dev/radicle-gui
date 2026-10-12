import { afterEach, beforeEach, expect, test, vi } from "vitest";

let flushSync: () => void;

async function load() {
  vi.resetModules();
  const { shareAction } = await import("@app/lib/shareAction.svelte");
  ({ flushSync } = await import("svelte"));
  flushSync();
  return shareAction;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("defaults to copying the link", async () => {
  expect((await load()).value).toBe("copyLink");
});

test.each([
  ["copyId", "copyId"],
  ["open", "open"],
  ["share", "copyLink"],
  ['"open"', "copyLink"],
])("reads a stored %j as %j", async (stored, expected) => {
  localStorage.setItem("shareAction", stored);

  expect((await load()).value).toBe(expected);
});

test("persists a change", async () => {
  const shareAction = await load();

  shareAction.value = "open";
  flushSync();

  expect(localStorage.getItem("shareAction")).toBe("open");
  expect((await load()).value).toBe("open");
});

test("works without localStorage", async () => {
  vi.stubGlobal("localStorage", undefined);
  const shareAction = await load();

  shareAction.value = "open";
  flushSync();

  expect(shareAction.value).toBe("open");
});
