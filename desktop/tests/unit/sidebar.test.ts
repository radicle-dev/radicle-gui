import { beforeEach, describe, expect, test, vi } from "vitest";

function setWindow(innerWidth: number, fontSize = "") {
  Object.defineProperty(window, "innerWidth", {
    value: innerWidth,
    configurable: true,
  });
  document.documentElement.style.fontSize = fontSize;
}

async function load() {
  return await import("@app/lib/sidebar.svelte");
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  setWindow(2000);
});

test("rootFontSize falls back to 16px when it can't be read", async () => {
  const { rootFontSize } = await load();
  vi.spyOn(window, "getComputedStyle").mockReturnValueOnce({
    fontSize: "",
  } as CSSStyleDeclaration);

  expect(rootFontSize()).toBe(16);
});

describe("clampSidebarWidth", () => {
  test.each([
    [20, 20],
    [12, 12],
    [11.9, 12],
    [-5, 12],
    [30, 30],
    [30.1, 30],
    [NaN, 16.5],
    [Infinity, 16.5],
  ])("clamps %d rem to %d in a wide window", async (rem, expected) => {
    const { clampSidebarWidth } = await load();

    expect(clampSidebarWidth(rem)).toBe(expected);
  });

  test.each([
    [1000, "", 25, 25],
    [1000, "", 26, 25],
    [1000, "20px", 25, 20],
    [100, "", 25, 12],
  ])(
    "caps the width at 40%% of a %dpx window with font size %j",
    async (innerWidth, fontSize, rem, expected) => {
      setWindow(innerWidth, fontSize);
      const { clampSidebarWidth } = await load();

      expect(clampSidebarWidth(rem)).toBe(expected);
    },
  );
});

describe("sidebarWidth", () => {
  test("starts with the default width", async () => {
    const { renderedSidebarWidth } = await load();

    expect(renderedSidebarWidth.value).toBe(16.5);
    expect(localStorage.getItem("sidebarWidth")).toBeNull();
  });

  test.each([
    ["20", 20, "20"],
    ["50", 30, "30"],
    ["5", 12, "12"],
  ])("restores a stored %s rem as %d", async (stored, expected, afterLoad) => {
    localStorage.setItem("sidebarWidth", stored);
    const { renderedSidebarWidth } = await load();

    expect(renderedSidebarWidth.value).toBe(expected);
    expect(localStorage.getItem("sidebarWidth")).toBe(afterLoad);
  });

  test("stores a clamped width set directly", async () => {
    const { renderedSidebarWidth, setSidebarWidth } = await load();
    setSidebarWidth(40);

    expect(renderedSidebarWidth.value).toBe(30);
    expect(localStorage.getItem("sidebarWidth")).toBe("30");
  });

  test("stores a drag's width only once it is committed", async () => {
    const {
      commitSidebarWidth,
      previewSidebarWidth,
      renderedSidebarWidth,
      sidebarWidth,
    } = await load();
    previewSidebarWidth(20);
    previewSidebarWidth(40);

    expect(renderedSidebarWidth.value).toBe(30);
    expect(localStorage.getItem("sidebarWidth")).toBeNull();

    commitSidebarWidth();

    expect(renderedSidebarWidth.value).toBe(30);
    expect(localStorage.getItem("sidebarWidth")).toBe("30");

    sidebarWidth.value = 20;

    expect(renderedSidebarWidth.value).toBe(20);
  });

  test("a discarded drag keeps the stored width", async () => {
    const {
      discardSidebarWidthPreview,
      previewSidebarWidth,
      renderedSidebarWidth,
      setSidebarWidth,
    } = await load();
    setSidebarWidth(20);
    previewSidebarWidth(25);
    discardSidebarWidthPreview();

    expect(renderedSidebarWidth.value).toBe(20);
    expect(localStorage.getItem("sidebarWidth")).toBe("20");
  });

  test("committing without a drag stores nothing", async () => {
    const { commitSidebarWidth, renderedSidebarWidth } = await load();
    commitSidebarWidth();

    expect(renderedSidebarWidth.value).toBe(16.5);
    expect(localStorage.getItem("sidebarWidth")).toBeNull();
  });

  test("a direct set drops an ongoing drag", async () => {
    const {
      commitSidebarWidth,
      previewSidebarWidth,
      renderedSidebarWidth,
      setSidebarWidth,
    } = await load();
    previewSidebarWidth(25);
    setSidebarWidth(20);

    expect(renderedSidebarWidth.value).toBe(20);

    commitSidebarWidth();

    expect(localStorage.getItem("sidebarWidth")).toBe("20");
  });
});

test("toggleSidebar flips and stores the collapsed state", async () => {
  const { sidebarCollapsed, toggleSidebar } = await load();
  expect(sidebarCollapsed.value).toBe(false);

  toggleSidebar();

  expect(sidebarCollapsed.value).toBe(true);
  expect(localStorage.getItem("sidebarCollapsed")).toBe("true");

  toggleSidebar();

  expect(sidebarCollapsed.value).toBe(false);
});
