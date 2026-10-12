import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { dynamicInterval, poll, resetDynamicInterval } from "@app/lib/interval";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetDynamicInterval("a");
  resetDynamicInterval("b");
  vi.useRealTimers();
});

test("runs the callback once per period", () => {
  const callback = vi.fn();
  dynamicInterval("a", callback, 100);

  vi.advanceTimersByTime(99);
  expect(callback).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(200);
  expect(callback).toHaveBeenCalledTimes(3);
});

test("rescheduling a key replaces its callback and period", () => {
  const first = vi.fn();
  const second = vi.fn();
  dynamicInterval("a", first, 100);
  vi.advanceTimersByTime(50);
  dynamicInterval("a", second, 300);

  vi.advanceTimersByTime(299);
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(second).toHaveBeenCalledTimes(1);
});

test("an async callback can reschedule its own key", async () => {
  const callback = vi.fn(async () => {
    await Promise.resolve();
    dynamicInterval("a", callback, 500);
  });
  dynamicInterval("a", callback, 100);

  await vi.advanceTimersByTimeAsync(100);
  expect(callback).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(499);
  expect(callback).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(callback).toHaveBeenCalledTimes(2);
});

test("resetting a key stops its callback", () => {
  const callback = vi.fn();
  dynamicInterval("a", callback, 100);
  resetDynamicInterval("a");

  vi.advanceTimersByTime(1000);
  expect(callback).not.toHaveBeenCalled();
});

test("keys run independently", () => {
  const a = vi.fn();
  const b = vi.fn();
  dynamicInterval("a", a, 100);
  dynamicInterval("b", b, 100);

  vi.advanceTimersByTime(100);
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
});

test("poll runs at once and again a period after each run settles", async () => {
  let release: (() => void) | undefined;
  const task = vi.fn(() => new Promise<void>(resolve => (release = resolve)));
  const stop = poll(task, 100);
  expect(task).toHaveBeenCalledTimes(1);

  // A slow run never overlaps the next one.
  await vi.advanceTimersByTimeAsync(500);
  expect(task).toHaveBeenCalledTimes(1);

  release?.();
  await vi.advanceTimersByTimeAsync(99);
  expect(task).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(task).toHaveBeenCalledTimes(2);
  stop();
});

test("stopping a poll ends it and marks a pending run inactive", async () => {
  let active: (() => boolean) | undefined;
  let release: (() => void) | undefined;
  const task = vi.fn(
    (isActive: () => boolean) =>
      new Promise<void>(resolve => {
        active = isActive;
        release = resolve;
      }),
  );
  const stop = poll(task, 100);
  expect(active?.()).toBe(true);

  stop();
  expect(active?.()).toBe(false);
  release?.();
  await vi.advanceTimersByTimeAsync(1000);
  expect(task).toHaveBeenCalledTimes(1);
});
