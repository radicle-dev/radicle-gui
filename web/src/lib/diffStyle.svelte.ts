import { MediaQuery } from "svelte/reactivity";

// Whether diffs show as one column or side by side, remembered per browser.
const STORAGE_KEY = "radicle2:diff-style";

export type DiffStyle = "unified" | "split";

function load(): DiffStyle {
  try {
    return localStorage.getItem(STORAGE_KEY) === "split" ? "split" : "unified";
  } catch {
    return "unified";
  }
}

const chosen = $state({ current: load() });

// Two columns of code don't fit on a narrow screen, so there it is always one.
export const splitFits = new MediaQuery("min-width: 56rem");

export const diffStyle = {
  get current(): DiffStyle {
    return splitFits.current ? chosen.current : "unified";
  },
};

export function setDiffStyle(style: DiffStyle) {
  chosen.current = style;
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Without storage the choice lasts for this visit.
  }
}
