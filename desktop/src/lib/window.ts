import { getCurrentWindow } from "@tauri-apps/api/window";

// The strip along the top edge of the window that drags it. Deliberately a
// fixed pixel height rather than rem: the root font size is user-configurable,
// and scaling the strip with it would swallow clicks at the top of every view.
export const DRAG_REGION_HEIGHT = 32;

const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
]);

// A press in the top strip on something that isn't itself interactive. Anything
// carrying `data-tauri-drag-region` is excluded because Tauri's own script
// already owns it -- that script drags on mousedown and maximizes on double
// click, and doing either here as well would fight it.
export function isDraggableArea(e: MouseEvent): boolean {
  if (e.clientY > DRAG_REGION_HEIGHT) return false;
  let el = e.target as HTMLElement | null;
  while (el && el !== document.body) {
    if (INTERACTIVE_TAGS.has(el.tagName.toLowerCase())) return false;
    if (el.getAttribute("role") === "button") return false;
    if (el.classList.contains("txt-selectable")) return false;
    if (el.hasAttribute("data-tauri-drag-region")) return false;
    el = el.parentElement;
  }
  return true;
}

// A window drag suppresses the mouse events that follow it, so the second press
// of a double click can arrive with `detail` back at 1 and `dblclick` never
// arrives at all. Pair the presses by time and position instead, the way the
// sidebar's resize edge does.
const DOUBLE_PRESS_MS = 500;
const DOUBLE_PRESS_SLOP_PX = 6;
let lastPressAt = 0;
let lastPressX = 0;
let lastPressY = 0;

function isDoublePress(e: MouseEvent): boolean {
  const paired =
    e.timeStamp - lastPressAt < DOUBLE_PRESS_MS &&
    Math.abs(e.clientX - lastPressX) <= DOUBLE_PRESS_SLOP_PX &&
    Math.abs(e.clientY - lastPressY) <= DOUBLE_PRESS_SLOP_PX;
  // Cleared so a third press starts a new pair instead of toggling again.
  lastPressAt = paired ? 0 : e.timeStamp;
  lastPressX = e.clientX;
  lastPressY = e.clientY;
  return paired;
}

// Drag the window by its top strip, and maximize it when that strip is double
// clicked, matching what Tauri's own drag regions do elsewhere in the app.
export function dragWindow(e: MouseEvent): void {
  // Primary button only; a right-click here would otherwise start a drag.
  if (!window.__TAURI_INTERNALS__ || e.button !== 0 || !isDraggableArea(e)) {
    return;
  }

  if (isDoublePress(e)) {
    void getCurrentWindow().toggleMaximize();
  } else {
    void getCurrentWindow().startDragging();
  }
}
