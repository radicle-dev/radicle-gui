// Which explanatory hints this viewer has dismissed. A per-browser
// convenience, so it lives apart from the node's own storage and survives a
// prototype reset.
const STORAGE_KEY = "radicle2:hints";

function load(): Record<string, true> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
  } catch {
    // Storage can be unavailable in private windows; hints just come back.
  }
}

export const dismissed = $state<Record<string, true>>(load());

export function dismissHint(id: string) {
  dismissed[id] = true;
  save();
}

export function hasDismissedHints(): boolean {
  return Object.keys(dismissed).length > 0;
}

export function restoreHints() {
  for (const id of Object.keys(dismissed)) delete dismissed[id];
  save();
}
