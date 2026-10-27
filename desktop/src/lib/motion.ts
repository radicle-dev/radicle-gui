const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function motion(durationMs: number): number {
  return reducedMotion.matches ? 0 : durationMs;
}

export function scrollBehavior(): ScrollBehavior {
  return reducedMotion.matches ? "instant" : "smooth";
}
