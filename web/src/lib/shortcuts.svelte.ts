export type Shortcut = "submit";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  switch (shortcut) {
    case "submit":
      return event.key === "Enter" && (isMac ? event.metaKey : event.ctrlKey);
  }
}

export const modKey = isMac ? "⌘" : "Ctrl";
