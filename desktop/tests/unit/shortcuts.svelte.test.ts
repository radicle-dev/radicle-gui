import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import * as modal from "@app/lib/modal";
import type { Binding, ShortcutId } from "@app/lib/shortcuts.svelte";
import {
  ariaKeyShortcuts,
  comboKeys,
  listenForShortcuts,
  matchesCombo,
  matchesShortcut,
  modifierHeld,
  useShortcuts,
} from "@app/lib/shortcuts.svelte";

const platform = vi.hoisted(() => ({ mac: false }));
vi.mock("@app/lib/utils", async importOriginal => ({
  ...(await importOriginal<typeof import("@app/lib/utils")>()),
  isMac: () => platform.mac,
  modifierKey: () => (platform.mac ? "⌘" : "ctrl"),
}));

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

afterEach(() => {
  platform.mac = false;
});

describe("matchesCombo", () => {
  test.each<[boolean, string, KeyboardEventInit, boolean]>([
    [false, "Mod+F", { key: "f", ctrlKey: true }, true],
    [false, "Mod+F", { key: "F", ctrlKey: true }, true],
    [false, "Mod+F", { key: "f", metaKey: true }, false],
    [false, "Mod+F", { key: "f", ctrlKey: true, metaKey: true }, false],
    [false, "Mod+F", { key: "f", ctrlKey: true, altKey: true }, false],
    [false, "Mod+F", { key: "F", ctrlKey: true, shiftKey: true }, false],
    [false, "Mod+F", { key: "f" }, false],
    [false, "Mod+F", { key: "g", ctrlKey: true }, false],
    [true, "Mod+F", { key: "f", metaKey: true }, true],
    [true, "Mod+F", { key: "f", ctrlKey: true }, false],
    [true, "Mod+F", { key: "f", metaKey: true, ctrlKey: true }, false],
    [false, "F", { key: "f", ctrlKey: true }, false],
    [false, "Alt+ArrowLeft", { key: "ArrowLeft", altKey: true }, true],
    [false, "Alt+ArrowLeft", { key: "ArrowLeft" }, false],
    [false, "Alt+ArrowLeft", { key: "ArrowRight", altKey: true }, false],
    [false, "ArrowUp", { key: "ArrowUp", shiftKey: true }, false],
    [false, "Mod+Shift+P", { key: "P", ctrlKey: true, shiftKey: true }, true],
    [false, "Mod+Shift+P", { key: "p", ctrlKey: true }, false],
    [false, "?", { key: "?", shiftKey: true }, true],
    [false, "?", { key: "/" }, false],
    [false, "Mod++", { key: "+", ctrlKey: true, shiftKey: true }, true],
    [false, "Mod++", { key: "=", ctrlKey: true }, false],
    [false, "Mod+=", { key: "=", ctrlKey: true }, true],
    [false, "Mod+1", { key: "1", ctrlKey: true }, true],
    [false, "Mod+F", { key: "а", code: "KeyF", ctrlKey: true }, true],
    [false, "Mod+F", { key: "а", code: "KeyG", ctrlKey: true }, false],
    [false, "Mod+1", { key: "ё", code: "Digit1", ctrlKey: true }, true],
    [false, "Mod+1", { key: "ё", code: "Key1", ctrlKey: true }, false],
    [false, "Mod+F", { key: "u", code: "KeyF", ctrlKey: true }, false],
    [false, "Mod+F", { key: "Dead", code: "KeyF", ctrlKey: true }, false],
  ])("mac %s: %s with %j is %s", (mac, combo, init, expected) => {
    platform.mac = mac;
    expect(matchesCombo(key(init), combo)).toBe(expected);
  });
});

test.each<[ShortcutId, KeyboardEventInit]>([
  ["goToRepo", { key: "9", ctrlKey: true }],
  ["increaseFontSize", { key: "=", ctrlKey: true }],
])("matchesShortcut tries every combo of %s", (id, init) => {
  expect(matchesShortcut(key(init), id)).toBe(true);
});

test.each<[boolean, string, string[]]>([
  [false, "Mod+F", ["ctrl", "f"]],
  [true, "Mod+F", ["⌘", "f"]],
  [false, "Alt+ArrowLeft", ["alt", "←"]],
  [true, "Alt+ArrowRight", ["⌥", "→"]],
  [false, "ArrowUp", ["↑"]],
  [false, "ArrowDown", ["↓"]],
  [false, "Escape", ["esc"]],
  [false, "Mod++", ["ctrl", "+"]],
  [false, "Shift+Enter", ["shift", "enter"]],
])("comboKeys on mac %s labels %s as %j", (mac, combo, expected) => {
  platform.mac = mac;
  expect(comboKeys(combo)).toEqual(expected);
});

test.each<[boolean, ShortcutId, string]>([
  [false, "filter", "Control+F"],
  [true, "filter", "Meta+F"],
  [false, "help", "?"],
  [false, "increaseFontSize", "Control++"],
  [false, "allCommits", "Escape"],
  [false, "back", "Alt+ArrowLeft"],
])("ariaKeyShortcuts on mac %s gives %s as %s", (mac, id, expected) => {
  platform.mac = mac;
  expect(ariaKeyShortcuts(id)).toBe(expected);
});

test("history shortcuts use brackets on macOS", async () => {
  platform.mac = true;
  vi.resetModules();
  const { shortcuts } = await import("@app/lib/shortcuts.svelte");

  expect(shortcuts.back.combos).toEqual(["Mod+["]);
  expect(shortcuts.forward.combos).toEqual(["Mod+]"]);
});

describe("dispatch", () => {
  let stopListening: () => void;
  let cleanups: (() => void)[] = [];

  function bind(...bindings: Binding[]) {
    cleanups.push($effect.root(() => useShortcuts(...bindings)));
    flushSync();
  }

  function press(init: KeyboardEventInit, target: EventTarget = document) {
    const event = key(init);
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    stopListening = listenForShortcuts();
  });

  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
    window.dispatchEvent(new Event("blur"));
    stopListening();
    modal.forceHide();
    document.body.replaceChildren();
  });

  test("runs a matching binding with the combo index and prevents default", () => {
    const run = vi.fn();
    bind({ shortcut: "goToRepo", run });

    expect(press({ key: "x", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(run).not.toHaveBeenCalled();

    const event = press({ key: "3", ctrlKey: true });
    expect(run).toHaveBeenCalledWith(event, 2);
    expect(event.defaultPrevented).toBe(true);
  });

  test.each<[string, () => KeyboardEvent]>([
    [
      "already handled",
      () => {
        const event = key({ key: "?" });
        event.preventDefault();
        return event;
      },
    ],
    ["being composed", () => key({ key: "?", isComposing: true })],
  ])("ignores keys %s", (_, event) => {
    const run = vi.fn();
    bind({ shortcut: "help", run });

    document.dispatchEvent(event());

    expect(run).not.toHaveBeenCalled();
  });

  test.each<[string, string, boolean, KeyboardEventInit, boolean]>([
    ["input", "", false, { key: "?" }, false],
    ["textarea", "", false, { key: "?" }, false],
    ["div", "", true, { key: "?" }, false],
    ["div", "", false, { key: "?" }, true],
    ["input", "", false, { key: "f", ctrlKey: true }, false],
    ["input", "data-mod-shortcuts", false, { key: "f", ctrlKey: true }, true],
    ["input", "data-mod-shortcuts", false, { key: "?" }, false],
  ])(
    "from a %s %s (editable %s), %j runs: %s",
    (tag, attribute, editable, init, runs) => {
      const run = vi.fn();
      bind({ shortcut: "help", run }, { shortcut: "filter", run });
      const element = document.createElement(tag);
      if (attribute) element.setAttribute(attribute, "");
      if (editable) element.contentEditable = "true";
      document.body.append(element);

      press(init, element);

      expect(run).toHaveBeenCalledTimes(runs ? 1 : 0);
    },
  );

  test("skips bindings while a modal is open unless they allow it", () => {
    const outside = vi.fn();
    const inside = vi.fn();
    bind({ shortcut: "help", run: outside });
    modal.show({ component: vi.fn(), props: {} });

    press({ key: "?" });
    expect(outside).not.toHaveBeenCalled();

    bind({ shortcut: "closeModal", run: inside, allowInModal: true });
    press({ key: "Escape" });
    expect(inside).toHaveBeenCalledTimes(1);
  });

  test("skips disabled bindings", () => {
    const disabled = vi.fn();
    const enabled = vi.fn();
    bind(
      { shortcut: "help", run: enabled, enabled: () => true },
      { shortcut: "help", run: disabled, enabled: () => false },
    );

    press({ key: "?" });

    expect(disabled).not.toHaveBeenCalled();
    expect(enabled).toHaveBeenCalledTimes(1);
  });

  test("tries higher priority first, then the most recently registered", () => {
    const calls: string[] = [];
    const binding = (name: string, priority?: number): Binding => ({
      shortcut: "allCommits",
      priority,
      run: () => {
        calls.push(name);
        return false;
      },
    });
    bind(binding("low", -1), binding("first"), binding("high", 1));
    bind(binding("second"));

    const event = press({ key: "Escape" });

    expect(calls).toEqual(["high", "second", "first", "low"]);
    expect(event.defaultPrevented).toBe(false);
  });

  test("returning false passes the key on to the next binding", () => {
    const next = vi.fn();
    bind(
      { shortcut: "help", run: next },
      { shortcut: "help", run: () => false },
    );

    expect(press({ key: "?" }).defaultPrevented).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("repeated presses cycle past the active binding", () => {
    let focused = "";
    const binding = (name: string): Binding => ({
      shortcut: "filter",
      run: () => (focused = name),
      active: () => focused === name,
    });
    bind(binding("c"), binding("b"), binding("a"));

    const order = [1, 2, 3, 4].map(() => {
      press({ key: "f", ctrlKey: true });
      return focused;
    });

    expect(order).toEqual(["a", "b", "c", "a"]);
  });

  test("unbinds when the owner is destroyed", () => {
    const run = vi.fn();
    bind({ shortcut: "help", run });
    cleanups.pop()?.();

    press({ key: "?" });

    expect(run).not.toHaveBeenCalled();
  });

  test("stops listening once the listener is removed", () => {
    const run = vi.fn();
    bind({ shortcut: "help", run });
    press({ key: "Control" });
    stopListening();

    press({ key: "?" });
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));
    window.dispatchEvent(new Event("blur"));

    expect(run).not.toHaveBeenCalled();
    expect(modifierHeld.value).toBe(true);
    stopListening = listenForShortcuts();
  });

  test.each<[boolean, string]>([
    [false, "Control"],
    [true, "Meta"],
  ])("modifierHeld follows mac %s %s", (mac, modifier) => {
    platform.mac = mac;
    press({ key: mac ? "Control" : "Meta" });
    expect(modifierHeld.value).toBe(false);

    press({ key: modifier });
    expect(modifierHeld.value).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    expect(modifierHeld.value).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: modifier }));
    expect(modifierHeld.value).toBe(false);

    press({ key: modifier });
    window.dispatchEvent(new Event("blur"));
    expect(modifierHeld.value).toBe(false);
  });

  test.each<[string, string, boolean]>([
    ["a field", "", false],
    ["a Mod-shortcut field", "data-mod-shortcuts", true],
  ])("modifierHeld from %s is %s", (_, attribute, held) => {
    const input = document.createElement("input");
    if (attribute) input.setAttribute(attribute, "");
    document.body.append(input);

    press({ key: "Control" }, input);

    expect(modifierHeld.value).toBe(held);
  });

  test("modifierHeld stays false while a modal is open", () => {
    modal.show({ component: vi.fn(), props: {} });

    press({ key: "Control" });

    expect(modifierHeld.value).toBe(false);
  });
});
