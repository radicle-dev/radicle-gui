import { getContext, setContext } from "svelte";

export interface Sheet {
  expandHref: string;
  close: () => void;
}

const KEY = Symbol("sheet");

export function provideSheet(sheet: () => Sheet) {
  setContext(KEY, sheet);
}

// Views rendered inside a side sheet use this to swap page-level actions for
// the sheet's expand and close buttons.
export function useSheet(): (() => Sheet) | undefined {
  return getContext(KEY);
}
