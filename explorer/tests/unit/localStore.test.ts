import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { get } from "svelte/store";
import { z } from "zod";

import storedWritable from "@app/lib/localStore";

const numberSchema = z.number();

describe("storedWritable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uses initial value when localStorage is empty", () => {
    const store = storedWritable("test-empty", numberSchema, 42);
    expect(get(store)).toBe(42);
  });

  test("restores prior value from localStorage", () => {
    localStorage.setItem("test-restore", "7");
    const store = storedWritable("test-restore", numberSchema, 0);
    expect(get(store)).toBe(7);
  });

  test("persists set() to localStorage", () => {
    const store = storedWritable("test-persist", numberSchema, 0);
    store.set(5);
    expect(localStorage.getItem("test-persist")).toBe("5");
  });

  test("clear() resets the store and removes from localStorage", () => {
    const store = storedWritable("test-clear", numberSchema, 0);
    store.set(9);
    store.clear();
    expect(get(store)).toBe(0);
    expect(localStorage.getItem("test-clear")).toBeNull();
  });

  test("falls back to initial value when stored data fails schema", () => {
    localStorage.setItem("test-bad-schema", '"not a number"');
    const store = storedWritable("test-bad-schema", numberSchema, 3);
    expect(get(store)).toBe(3);
  });

  test("falls back to initial value when stored data is invalid JSON", () => {
    localStorage.setItem("test-bad-json", "{not json");
    const store = storedWritable("test-bad-json", numberSchema, 4);
    expect(get(store)).toBe(4);
  });

  test("ignores localStorage.getItem errors and uses initial value", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    const store = storedWritable("test-get-throws", numberSchema, 11);
    expect(get(store)).toBe(11);
  });

  test("ignores localStorage.setItem errors but still updates in-memory store", () => {
    const store = storedWritable("test-set-throws", numberSchema, 0);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => store.set(99)).not.toThrow();
    expect(get(store)).toBe(99);
  });

  test("ignores localStorage.removeItem errors but still resets in-memory store", () => {
    const store = storedWritable("test-remove-throws", numberSchema, 0);
    store.set(5);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => store.clear()).not.toThrow();
    expect(get(store)).toBe(0);
  });

  test("update() persists to localStorage", () => {
    const store = storedWritable("test-update", numberSchema, 1);
    store.update(n => n + 10);
    expect(get(store)).toBe(11);
    expect(localStorage.getItem("test-update")).toBe("11");
  });

  test("disableLocalStorage skips persistence", () => {
    const store = storedWritable("test-disabled", numberSchema, 0, true);
    store.set(7);
    expect(localStorage.getItem("test-disabled")).toBeNull();
    expect(get(store)).toBe(7);
  });
});
