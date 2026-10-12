import { describe, expect, test } from "vitest";

import { doublePressDetector, dragResult } from "@app/lib/sidebarResize";

describe("dragResult", () => {
  test("widens by the dragged distance", () => {
    expect(dragResult(16, 32, 16)).toEqual({
      collapse: false,
      width: 18,
      railStretch: 0,
    });
  });

  test("collapses only past the slack below the minimum width", () => {
    expect(dragResult(12, -2 * 16, 16).collapse).toBe(false);
    expect(dragResult(12, -2 * 16 - 1, 16).collapse).toBe(true);
  });

  test("stretches the rail with a collapsed drag, never below its width", () => {
    expect(dragResult(5, 2 * 16, 16)).toEqual({
      collapse: true,
      width: 7,
      railStretch: 0.7,
    });
    expect(dragResult(5, -16, 16).railStretch).toBe(0);
  });
});

describe("doublePressDetector", () => {
  const press = (timeStamp: number, clientX = 100) => ({ timeStamp, clientX });

  test("pairs two quick presses in the same place", () => {
    const isDoublePress = doublePressDetector();
    expect(isDoublePress(press(1000), false)).toBe(false);
    expect(isDoublePress(press(1499, 106), false)).toBe(true);
  });

  test("a third press starts a new pair", () => {
    const isDoublePress = doublePressDetector();
    isDoublePress(press(1000), false);
    isDoublePress(press(1100), false);
    expect(isDoublePress(press(1200), false)).toBe(false);
    expect(isDoublePress(press(1300), false)).toBe(true);
  });

  test.each([
    ["too late", press(1500), false],
    ["too far", press(1100, 107), false],
    ["after a resize", press(1100), true],
  ])("doesn't pair a press %s", (_, second, resized) => {
    const isDoublePress = doublePressDetector();
    isDoublePress(press(1000), false);
    expect(isDoublePress(second, resized)).toBe(false);
  });

  test("the first press right after launch isn't a pair", () => {
    expect(doublePressDetector()(press(10, 0), false)).toBe(false);
  });
});
