import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { debounced } from "@app/lib/debounced.svelte";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("follows the source once it stops changing", () => {
  let source = $state("a");
  let search: { readonly current: string } | undefined;
  const cleanup = $effect.root(() => {
    search = debounced(() => source, 150);
  });
  flushSync();
  expect(search?.current).toBe("a");

  source = "ab";
  flushSync();
  vi.advanceTimersByTime(100);
  source = "abc";
  flushSync();
  vi.advanceTimersByTime(149);
  expect(search?.current).toBe("a");

  vi.advanceTimersByTime(1);
  expect(search?.current).toBe("abc");

  cleanup();
});
