import { untrack } from "svelte";
import { get } from "svelte/store";

import { modalStore } from "@app/lib/modal";
import { isMac, modifierKey } from "@app/lib/utils";

// A combo is the key, optionally preceded by modifiers: "Mod+F", "Alt+ArrowLeft",
// "?". "Mod" is Cmd on macOS and Ctrl elsewhere. Keys are `KeyboardEvent.key`
// values, except that letters and digits are case-insensitive.
export type Combo = string;

interface ShortcutDoc {
  combos: Combo[];
  description: string;
  // Where the shortcut applies, when that isn't everywhere.
  note?: string;
  // Shown in the shortcuts modal instead of the first combo.
  label?: Combo;
}

// Every shortcut in the app, in the order the shortcuts modal lists them.
// Components bind behaviour to these by id, so the keys live only here.
export const shortcuts = {
  help: { combos: ["?"], description: "Keyboard shortcuts" },
  navigator: {
    combos: ["Mod+K"],
    description: "Search repositories, issues and patches",
  },
  filter: {
    combos: ["Mod+F"],
    description: "Focus a filter on screen, press again to cycle through them",
  },
  newIssue: {
    combos: ["Mod+N"],
    description: "New issue",
    note: "In a repository",
  },
  goToRepo: {
    combos: Array.from({ length: 9 }, (_, i) => `Mod+${i + 1}`),
    label: "Mod+1…9",
    description: "Go to the nth repo in the sidebar",
  },
  back: {
    combos: [isMac() ? "Mod+[" : "Alt+ArrowLeft"],
    description: "Go back",
  },
  forward: {
    combos: [isMac() ? "Mod+]" : "Alt+ArrowRight"],
    description: "Go forward",
  },
  previousCommit: {
    combos: ["ArrowUp"],
    description: "Previous commit",
    note: "In a patch's changes",
  },
  nextCommit: {
    combos: ["ArrowDown"],
    description: "Next commit",
    note: "In a patch's changes",
  },
  allCommits: {
    combos: ["Escape"],
    description: "Show all commits",
    note: "In a patch's changes",
  },
  toggleSidebar: { combos: ["Mod+B"], description: "Toggle sidebar" },
  settings: { combos: ["Mod+,"], description: "Settings" },
  reload: { combos: ["Mod+R"], description: "Reload" },
  // Covers where the plus key sits on different keyboard layouts.
  increaseFontSize: {
    combos: ["Mod++", "Mod+="],
    label: "Mod++",
    description: "Increase font size",
  },
  decreaseFontSize: { combos: ["Mod+-"], description: "Decrease font size" },
  resetFontSize: { combos: ["Mod+0"], description: "Reset font size" },
  closeModal: {
    combos: ["Escape"],
    description: "Close modal",
    note: "In a modal",
  },
  submit: {
    combos: ["Mod+Enter"],
    description: "Submit",
    note: "In a comment or description",
  },
  bold: {
    combos: ["Mod+B"],
    description: "Bold",
    note: "In a comment or description",
  },
  italic: {
    combos: ["Mod+I"],
    description: "Italic",
    note: "In a comment or description",
  },
  code: {
    combos: ["Mod+E"],
    description: "Code",
    note: "In a comment or description",
  },
  link: {
    combos: ["Mod+K"],
    description: "Link",
    note: "In a comment or description",
  },
  pasteLink: {
    combos: ["Mod+V"],
    description: "Paste a URL over selected text to link it",
    note: "In a comment or description",
  },
} satisfies Record<string, ShortcutDoc>;

export type ShortcutId = keyof typeof shortcuts;

export interface Binding {
  shortcut: ShortcutId;
  // Gets the index of the combo that matched. Returning false passes the key
  // on to the next binding for it.
  run: (event: KeyboardEvent, combo: number) => unknown;
  enabled?: () => boolean;
  // Whether what the binding acts on already has focus. The next press then
  // moves on to the following binding, wrapping around, so repeated presses
  // cycle through them.
  active?: () => boolean;
  allowInModal?: boolean;
  // Tried before other bindings for the same keys. Among equals, the most
  // recently registered one goes first.
  priority?: number;
}

let registered = $state.raw<Binding[]>([]);
let modifierDown = $state(false);

// Whether Mod is held down in a state where Mod shortcuts would run.
export const modifierHeld = {
  get value() {
    return modifierDown;
  },
};

function register(binding: Binding): () => void {
  registered = [...registered, binding];
  return () => {
    registered = registered.filter(b => b !== binding);
  };
}

// Binds shortcuts for the lifetime of the calling component.
export function useShortcuts(...bindings: Binding[]) {
  $effect(() => {
    // Registering reads the registry it writes to, which would otherwise make
    // every registration re-run all of them.
    const unregister = untrack(() => bindings.map(register));
    return () => untrack(() => unregister.forEach(fn => fn()));
  });
}

function parse(combo: Combo): { modifiers: string[]; key: string } {
  const parts = combo.split("+");
  // "Mod++" splits into a trailing pair of empty strings.
  const key = parts.pop() || "+";
  return { modifiers: parts.filter(Boolean), key };
}

function isAlphanumeric(key: string): boolean {
  return /^[a-z0-9]$/i.test(key);
}

export function matchesCombo(event: KeyboardEvent, combo: Combo): boolean {
  const { modifiers, key } = parse(combo);
  const [mod, otherMod] = isMac()
    ? [event.metaKey, event.ctrlKey]
    : [event.ctrlKey, event.metaKey];
  if (mod !== modifiers.includes("Mod") || otherMod) return false;
  if (event.altKey !== modifiers.includes("Alt")) return false;
  // Shift is part of how symbols like "?" and "+" are typed on most layouts.
  const symbol = key.length === 1 && !isAlphanumeric(key);
  if (!symbol && event.shiftKey !== modifiers.includes("Shift")) return false;

  if (!isAlphanumeric(key)) return event.key === key;
  if (event.key.toLowerCase() === key.toLowerCase()) return true;
  // On a non-Latin layout, fall back to the key's position on a QWERTY one.
  return (
    event.key.length === 1 &&
    event.key.charCodeAt(0) > 127 &&
    event.code === (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`)
  );
}

export function matchesShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  return (shortcuts[id].combos as Combo[]).some(c => matchesCombo(event, c));
}

const keyLabels: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "esc",
};

export function comboKeys(combo: Combo): string[] {
  const { modifiers, key } = parse(combo);
  const modifierLabels = modifiers.map(m =>
    m === "Mod"
      ? modifierKey()
      : m === "Alt"
        ? isMac()
          ? "⌥"
          : "alt"
        : m.toLowerCase(),
  );
  return [...modifierLabels, keyLabels[key] ?? key.toLowerCase()];
}

export function ariaKeyShortcuts(id: ShortcutId): string {
  const { modifiers, key } = parse(shortcuts[id].combos[0]);
  const modifierNames = modifiers.map(m =>
    m === "Mod" ? (isMac() ? "Meta" : "Control") : m,
  );
  return [...modifierNames, key.length === 1 ? key.toUpperCase() : key].join(
    "+",
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function isModifierKey(event: KeyboardEvent): boolean {
  return event.key === (isMac() ? "Meta" : "Control");
}

// Fields marked with `data-mod-shortcuts`, like filters, hold nothing worth
// protecting, so shortcuts with Mod still work from them.
function blocksShortcuts(event: KeyboardEvent, modDown: boolean): boolean {
  if (!isTyping(event.target)) {
    return false;
  }
  const allowsMod =
    event.target instanceof HTMLElement &&
    event.target.hasAttribute("data-mod-shortcuts");
  return !(allowsMod && modDown);
}

function onKeydown(event: KeyboardEvent) {
  const modalOpen = get(modalStore) !== undefined;
  if (isModifierKey(event)) {
    modifierDown = !modalOpen && !blocksShortcuts(event, true);
  }
  const modDown = isMac() ? event.metaKey : event.ctrlKey;
  // Keys a component already handled, and anything typed into a field, are
  // left alone.
  if (
    event.defaultPrevented ||
    event.isComposing ||
    blocksShortcuts(event, modDown)
  ) {
    return;
  }

  const candidates = registered
    .map((binding, index) => ({
      binding,
      index,
      combo: (shortcuts[binding.shortcut].combos as Combo[]).findIndex(c =>
        matchesCombo(event, c),
      ),
    }))
    .filter(
      ({ binding, combo }) =>
        combo !== -1 &&
        (!modalOpen || binding.allowInModal) &&
        binding.enabled?.() !== false,
    )
    .sort(
      (a, b) =>
        (b.binding.priority ?? 0) - (a.binding.priority ?? 0) ||
        b.index - a.index,
    );
  const active = candidates.findIndex(({ binding }) => binding.active?.());
  const ordered =
    active === -1
      ? candidates
      : [...candidates.slice(active + 1), ...candidates.slice(0, active + 1)];
  for (const { binding, combo } of ordered) {
    if (binding.run(event, combo) !== false) {
      event.preventDefault();
      return;
    }
  }
}

function onKeyup(event: KeyboardEvent) {
  if (isModifierKey(event)) {
    modifierDown = false;
  }
}

function onBlur() {
  modifierDown = false;
}

export function listenForShortcuts(): () => void {
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("keyup", onKeyup);
  window.addEventListener("blur", onBlur);
  return () => {
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("keyup", onKeyup);
    window.removeEventListener("blur", onBlur);
  };
}
