import { expect, test } from "vitest";

import { menuFocusIndex } from "@app/lib/menuNavigation";

test.each([
  ["ArrowDown", -1, 0],
  ["ArrowDown", 0, 1],
  ["ArrowDown", 2, 0],
  ["ArrowUp", -1, 2],
  ["ArrowUp", 0, 2],
  ["ArrowUp", 2, 1],
  ["Home", 1, 0],
  ["End", 0, 2],
  ["Enter", 1, undefined],
])("%j from %j of three focuses %j", (key, current, expected) => {
  expect(menuFocusIndex(key, current, 3)).toBe(expected);
});
