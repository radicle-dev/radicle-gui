import { beforeEach, describe, expect, test, vi } from "vitest";
import { array, string } from "zod";

import useLocalStorage from "@app/lib/useLocalStorage.svelte";

const key = "test.list";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

describe("useLocalStorage", () => {
  test("starts with the initial value when nothing is stored", () => {
    expect(useLocalStorage(key, array(string()), ["x"]).value).toEqual(["x"]);
  });

  test("reads a valid stored value", () => {
    localStorage.setItem(key, JSON.stringify(["a", "b"]));

    expect(useLocalStorage(key, array(string()), []).value).toEqual(["a", "b"]);
  });

  test.each(["{not json", JSON.stringify([1, 2]), JSON.stringify("text")])(
    "falls back to the initial value for %j",
    stored => {
      localStorage.setItem(key, stored);

      expect(useLocalStorage(key, array(string()), ["x"]).value).toEqual(["x"]);
    },
  );

  test("writes through on set and update", () => {
    const store = useLocalStorage(key, array(string()), []);
    store.value = ["a"];
    expect(localStorage.getItem(key)).toBe('["a"]');

    store.update(list => [...list, "b"]);
    expect(store.value).toEqual(["a", "b"]);
    expect(localStorage.getItem(key)).toBe('["a","b"]');
  });

  test("clear resets the value and removes it from storage", () => {
    const store = useLocalStorage(key, array(string()), ["x"]);
    store.value = ["a"];
    store.clear();

    expect(store.value).toEqual(["x"]);
    expect(localStorage.getItem(key)).toBeNull();
  });

  test("with storage disabled, neither reads nor writes it", () => {
    localStorage.setItem(key, '["stored"]');
    const store = useLocalStorage(key, array(string()), ["x"], true);
    expect(store.value).toEqual(["x"]);

    store.value = ["a"];

    expect(store.value).toEqual(["a"]);
    expect(localStorage.getItem(key)).toBe('["stored"]');
  });
});
