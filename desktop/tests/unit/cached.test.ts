import { describe, expect, test, vi } from "vitest";

import { cached } from "@app/lib/cached";

describe("cached", () => {
  test("returns the cached result for the same key", async () => {
    const f = vi.fn(async (x: number) => x * 2);
    const c = cached(f, x => String(x));

    expect(await c(1)).toBe(2);
    expect(await c(1)).toBe(2);
    expect(await c(2)).toBe(4);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("shares a single in-flight request between concurrent callers", async () => {
    let resolve: ((value: string) => void) | undefined;
    const f = vi.fn(
      () =>
        new Promise<string>(r => {
          resolve = r;
        }),
    );
    const c = cached(f, () => "key");

    const first = c();
    const second = c();
    resolve?.("done");

    expect(await first).toBe("done");
    expect(await second).toBe("done");
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("keeps a miss only for missTtl", async () => {
    const f = vi.fn(async () => null);
    const c = cached(f, () => "key", { max: 10, ttl: 60_000 }, 1);

    await c();
    await c();
    expect(f).toHaveBeenCalledTimes(1);
    await new Promise(resolve => setTimeout(resolve, 10));
    await c();
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("keeps a hit for the full ttl", async () => {
    const f = vi.fn(async () => "hit");
    const c = cached(f, () => "key", { max: 10, ttl: 60_000 }, 1);

    await c();
    await new Promise(resolve => setTimeout(resolve, 10));
    await c();
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("retries after a rejection", async () => {
    const f = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    const c = cached(f, () => "key");

    await expect(c()).rejects.toThrow("boom");
    expect(await c()).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("clear forces a new request", async () => {
    const f = vi.fn(async () => "value");
    const c = cached(f, () => "key");

    await c();
    c.clear();
    await c();
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("evicts the least recently used entry", async () => {
    const f = vi.fn(async (x: number) => x);
    const c = cached(f, x => String(x), { max: 2 });

    await c(1);
    await c(2);
    await c(1);
    await c(3);
    await c(1);
    expect(f).toHaveBeenCalledTimes(3);
    await c(2);
    expect(f).toHaveBeenCalledTimes(4);
  });

  test("expires entries after the ttl", async () => {
    let now = 1000;
    const f = vi.fn(async () => "value");
    const c = cached(f, () => "key", {
      max: 1,
      ttl: 1000,
      ttlResolution: 0,
      perf: { now: () => now },
    });

    await c();
    now = 1500;
    await c();
    expect(f).toHaveBeenCalledTimes(1);
    now = 2500;
    await c();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
