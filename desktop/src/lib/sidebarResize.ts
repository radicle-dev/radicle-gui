import { MIN_SIDEBAR_WIDTH, RAIL_WIDTH_REM } from "@app/lib/sidebar.svelte";

// How far below the minimum width the drag has to go before it collapses,
// rather than the edge just sticking at the minimum.
const COLLAPSE_DRAG_SLACK_REM = 2;

// While collapsed, the rail follows the drag at a fraction of its distance so
// it feels attached to the pointer, instead of sitting still until the
// threshold and then jumping open.
const RAIL_STRETCH_FACTOR = 0.35;

// Where a drag of the sidebar edge leaves it. One boundary serves both
// directions: below it the sidebar is collapsed, above it expanded, so a
// single drag can cross either way.
export function dragResult(
  startWidth: number,
  deltaPx: number,
  pxPerRem: number,
): { collapse: boolean; width: number; railStretch: number } {
  const width = startWidth + deltaPx / pxPerRem;
  const collapse = width < MIN_SIDEBAR_WIDTH - COLLAPSE_DRAG_SLACK_REM;
  const railStretch = collapse
    ? Math.max(0, (width - RAIL_WIDTH_REM) * RAIL_STRETCH_FACTOR)
    : 0;
  return { collapse, width, railStretch };
}

const DOUBLE_PRESS_MS = 500;
const DOUBLE_PRESS_SLOP_PX = 6;

// A second press in quick succession, close to the first. A press that ended
// in a resize isn't half of a pair, and a pair is cleared so a third press
// starts a new one.
export function doublePressDetector() {
  let lastPressAt = -Infinity;
  let lastPressX = 0;
  return (
    press: { timeStamp: number; clientX: number },
    lastPressResized: boolean,
  ): boolean => {
    const paired =
      !lastPressResized &&
      press.timeStamp - lastPressAt < DOUBLE_PRESS_MS &&
      Math.abs(press.clientX - lastPressX) <= DOUBLE_PRESS_SLOP_PX;
    lastPressAt = paired ? -Infinity : press.timeStamp;
    lastPressX = press.clientX;
    return paired;
  };
}
