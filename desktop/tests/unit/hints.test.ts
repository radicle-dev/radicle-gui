import { beforeEach, expect, test, vi } from "vitest";

async function load() {
  vi.resetModules();
  return (await import("@app/lib/hints")).hints;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

test("starts with nothing dismissed", async () => {
  const hints = await load();

  expect(hints.isDismissed("markdown")).toBe(false);
  expect(hints.dismissedCount).toBe(0);
});

test("remembers dismissed hints across reloads", async () => {
  const hints = await load();
  hints.dismiss("markdown");
  hints.dismiss("markdown");

  const reloaded = await load();
  expect(reloaded.isDismissed("markdown")).toBe(true);
  expect(reloaded.isDismissed("guide")).toBe(false);
  expect(reloaded.dismissedCount).toBe(1);
});

test("resetAll brings every hint back", async () => {
  const hints = await load();
  hints.dismiss("markdown");
  hints.dismiss("guide");
  expect(hints.dismissedCount).toBe(2);

  hints.resetAll();

  expect(hints.isDismissed("markdown")).toBe(false);
  expect(hints.dismissedCount).toBe(0);
  expect((await load()).dismissedCount).toBe(0);
});

test("ignores an invalid stored value", async () => {
  localStorage.setItem("dismissedHints", '"markdown"');

  const hints = await load();

  expect(hints.isDismissed("markdown")).toBe(false);
  expect(hints.dismissedCount).toBe(0);
});
