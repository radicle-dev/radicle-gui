import { boolean, number } from "zod";

import useLocalStorage from "@app/lib/useLocalStorage.svelte";

export const MIN_SIDEBAR_WIDTH = 12;
export const MAX_SIDEBAR_WIDTH = 30;
export const DEFAULT_SIDEBAR_WIDTH = 16.5;

// Wide enough to clear macOS's traffic lights (~70px in), which would otherwise
// spill onto the content pane. Not platform-gated, to keep one rail geometry.
export const RAIL_WIDTH_REM = 5;

// The widths above are rem and the user can scale the root font size, so cap
// the share of the window the sidebar may take. Mirrored by `max-width` on the
// slot, which also covers the window being resized afterwards.
const MAX_VIEWPORT_FRACTION = 0.4;

export function rootFontSize(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

export function clampSidebarWidth(rem: number): number {
  if (!Number.isFinite(rem)) return DEFAULT_SIDEBAR_WIDTH;
  const viewportMax =
    (window.innerWidth * MAX_VIEWPORT_FRACTION) / rootFontSize();
  // Never below the minimum, even in a window too narrow to honour the share.
  const max = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, viewportMax),
  );
  return Math.min(max, Math.max(MIN_SIDEBAR_WIDTH, rem));
}

export const sidebarCollapsed = useLocalStorage(
  "sidebarCollapsed",
  boolean(),
  false,
  !window.localStorage,
);

export const sidebarWidth = useLocalStorage(
  "sidebarWidth",
  number(),
  DEFAULT_SIDEBAR_WIDTH,
  !window.localStorage,
);

// Writes are clamped; a value stored by a build with different bounds is not.
// Only written back when out of range, to keep startup off localStorage.
const restoredWidth = clampSidebarWidth(sidebarWidth.value);
if (sidebarWidth.value !== restoredWidth) {
  sidebarWidth.value = restoredWidth;
}

// True while dragging the resize edge; suppresses the width transition so the
// sidebar tracks the pointer 1:1.
export const sidebarResizing = $state({ value: false });

// Held out of `sidebarWidth`, which writes to localStorage on every set.
const draft = $state<{ width: number | undefined }>({ width: undefined });

// The live drag value while resizing, the stored one otherwise.
export const renderedSidebarWidth = {
  get value() {
    return draft.width ?? sidebarWidth.value;
  },
};

export function previewSidebarWidth(rem: number) {
  draft.width = clampSidebarWidth(rem);
}

// Drops the drag's width without storing it, for a drag that ends up collapsing
// instead: the widths it passed through on the way down are not a width the
// user chose, so the stored one is left alone to reopen at.
export function discardSidebarWidthPreview() {
  draft.width = undefined;
}

// A one-shot width change, for callers that aren't tracking a pointer.
export function setSidebarWidth(rem: number) {
  draft.width = undefined;
  sidebarWidth.value = clampSidebarWidth(rem);
}

// The single storage write for a whole drag.
export function commitSidebarWidth() {
  if (draft.width !== undefined) {
    sidebarWidth.value = draft.width;
    draft.width = undefined;
  }
}

export function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}
