const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function motion(durationMs: number): number {
  return reducedMotion.matches ? 0 : durationMs;
}

export function scrollBehavior(): "smooth" | "instant" {
  return reducedMotion.matches ? "instant" : "smooth";
}
