import { expect, test } from "vitest";

import { readListState, saveListState } from "@app/lib/listState";

function state(scrollOffset: number) {
  return { items: [scrollOffset], more: false, scrollOffset, cache: undefined };
}

function saveMany(prefix: string, count: number) {
  for (let i = 0; i < count; i++) {
    saveListState(`${prefix}${i}`, state(i));
  }
}

test("reads back the latest saved state", () => {
  expect(readListState("list")).toBeUndefined();

  saveListState("list", state(1));
  saveListState("list", state(2));

  expect(readListState("list")).toEqual(state(2));
});

test("keeps only the 20 most recent lists", () => {
  saveMany("a", 21);

  expect(readListState("a0")).toBeUndefined();
  expect(readListState("a1")).toEqual(state(1));
  expect(readListState("a20")).toEqual(state(20));
});

test("saving a list again makes it the most recent", () => {
  saveMany("b", 20);
  saveListState("b0", state(0));
  saveListState("b20", state(20));

  expect(readListState("b0")).toEqual(state(0));
  expect(readListState("b1")).toBeUndefined();
});
