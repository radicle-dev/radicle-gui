import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@app/lib/invoke", () => ({ invoke }));

const storageKey = "updateChecker.isEnabled";
const latestUrl =
  "https://files.radicle.dev/releases/radicle-desktop/latest/latest.json";
const hour = 3600 * 1000;

const fetch = vi.fn();
let latest: Promise<string>;

async function start(current: string, stored?: boolean) {
  if (stored !== undefined) {
    localStorage.setItem(storageKey, JSON.stringify(stored));
  }
  invoke.mockResolvedValue(current);
  vi.resetModules();
  const { updateChecker } = await import("@app/lib/updateChecker.svelte");
  await vi.advanceTimersByTimeAsync(0);
  return updateChecker;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  latest = Promise.resolve("1.0.0");
  fetch.mockReset();
  fetch.mockImplementation(async () => ({
    json: async () => ({ version: await latest }),
  }));
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("is disabled by default and doesn't check", async () => {
  const checker = await start("0.9.0");

  expect(invoke).toHaveBeenCalledWith("version");
  expect(checker.currentVersion).toBe("0.9.0");
  expect(checker.isEnabled).toBe(false);
  expect(checker.newVersion).toBeUndefined();
  expect(checker.upToDate).toBe(false);

  await vi.advanceTimersByTimeAsync(hour);
  expect(fetch).not.toHaveBeenCalled();
});

test("stays disabled when disabling was stored", async () => {
  const checker = await start("0.9.0", false);

  expect(checker.isEnabled).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

test.each<[string, string, string | undefined, boolean]>([
  ["0.9.0", "1.0.0", "1.0.0", false],
  ["0.9.0", "0.9.0", undefined, true],
  ["1.1.0", "1.0.0", undefined, true],
  ["v0.9.0-12-gabcdef", "0.9.1", "0.9.1", false],
  ["not a version", "1.0.0", undefined, false],
])(
  "on %s with %s released, offers %s and is up to date: %s",
  async (current, released, newVersion, upToDate) => {
    latest = Promise.resolve(released);
    const checker = await start(current, true);

    expect(fetch).toHaveBeenCalledWith(latestUrl, { cache: "no-store" });
    expect(checker.currentVersion).toBe(current);
    expect(checker.isEnabled).toBe(true);
    expect(checker.newVersion).toBe(newVersion);
    expect(checker.upToDate).toBe(upToDate);
  },
);

test("a failed check claims neither an update nor being up to date", async () => {
  latest = Promise.reject(new Error("offline"));
  const checker = await start("0.9.0", true);

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(checker.newVersion).toBeUndefined();
  expect(checker.upToDate).toBe(false);
});

test("enable stores the choice and checks now and every hour", async () => {
  const checker = await start("0.9.0");

  checker.enable();
  checker.enable();
  await vi.advanceTimersByTimeAsync(0);
  expect(localStorage.getItem(storageKey)).toBe("true");
  expect(checker.isEnabled).toBe(true);
  expect(checker.newVersion).toBe("1.0.0");
  expect(fetch).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(hour - 1);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("an hourly check picks up a new release", async () => {
  latest = Promise.resolve("0.9.0");
  const checker = await start("0.9.0", true);
  expect(checker.upToDate).toBe(true);

  latest = Promise.resolve("0.10.0");
  await vi.advanceTimersByTimeAsync(hour);

  expect(checker.newVersion).toBe("0.10.0");
  expect(checker.upToDate).toBe(false);
});

test("disable stores the choice and stops checking", async () => {
  latest = Promise.resolve("0.9.0");
  const checker = await start("0.9.0", true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(checker.upToDate).toBe(true);

  checker.disable();
  await vi.advanceTimersByTimeAsync(hour);

  expect(localStorage.getItem(storageKey)).toBe("false");
  expect(checker.isEnabled).toBe(false);
  expect(checker.upToDate).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);

  checker.enable();
  await vi.advanceTimersByTimeAsync(hour);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("disabling keeps offering an update that was already found", async () => {
  const checker = await start("0.9.0", true);

  checker.disable();

  expect(checker.newVersion).toBe("1.0.0");
});
