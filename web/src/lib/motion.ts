const query = typeof window === "undefined" ? undefined : window.matchMedia("(prefers-reduced-motion: reduce)");

export function reducedMotion(): boolean {
  return query?.matches ?? false;
}

// Transition parameters that collapse to no motion when the viewer asks for
// reduced motion. Checked on every call, so changing the OS setting applies
// without a reload.
export function motion<T extends { duration?: number; delay?: number }>(params: T): T {
  return reducedMotion() ? { ...params, duration: 0, delay: 0 } : params;
}

export function scrollBehavior(): ScrollBehavior {
  return reducedMotion() ? "auto" : "smooth";
}
