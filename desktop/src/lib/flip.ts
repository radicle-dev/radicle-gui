// FLIP: animate elements from where they were to where a layout change just put
// them. Capture from `$effect.pre` and play from `$effect`, both reading the
// state that drives the change so they land on the same flush.
//
// Positions are relative to the container, so only the reflow inside it is
// animated; the container's own shift is left to whatever already carries it.

export interface FlipOptions {
  // Which descendants to animate. Defaults to the container's direct children.
  selector?: string;
  // Animate the container's height too. Needed when it lays out to `auto` in
  // one state, which a CSS transition can't carry.
  animateHeight?: boolean;
  durationMs?: number;
}

export interface FlipSnapshot {
  offsets: WeakMap<Element, { x: number; y: number }>;
  height: number;
}

const DEFAULT_DURATION_MS = 200;

// Sub-pixel differences are rounding, not movement.
const EPSILON_PX = 0.5;

function targets(container: Element, selector: string | undefined): Element[] {
  return Array.from(
    selector ? container.querySelectorAll(selector) : container.children,
  );
}

export function captureFlip(
  container: Element | undefined,
  options: FlipOptions = {},
): FlipSnapshot | undefined {
  // First run, before the bind has landed. Returning nothing stops `playFlip`
  // animating in from a zero-sized phantom.
  if (!container) return undefined;

  const base = container.getBoundingClientRect();
  const offsets = new WeakMap<Element, { x: number; y: number }>();
  for (const child of targets(container, options.selector)) {
    const rect = child.getBoundingClientRect();
    offsets.set(child, { x: rect.left - base.left, y: rect.top - base.top });
  }

  return { offsets, height: base.height };
}

export function playFlip(
  container: Element | undefined,
  first: FlipSnapshot | undefined,
  options: FlipOptions = {},
): void {
  if (!container || !first) return;

  const duration = options.durationMs ?? DEFAULT_DURATION_MS;
  const base = container.getBoundingClientRect();

  if (
    options.animateHeight &&
    Math.abs(base.height - first.height) > EPSILON_PX
  ) {
    container.animate(
      [{ height: `${first.height}px` }, { height: `${base.height}px` }],
      { duration, easing: "ease" },
    );
  }

  for (const child of targets(container, options.selector)) {
    const from = first.offsets.get(child);
    if (!from) continue;
    const rect = child.getBoundingClientRect();
    const dx = from.x - (rect.left - base.left);
    const dy = from.y - (rect.top - base.top);
    if (Math.abs(dx) < EPSILON_PX && Math.abs(dy) < EPSILON_PX) continue;
    child.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0px, 0px)" },
      ],
      { duration, easing: "ease" },
    );
  }
}
