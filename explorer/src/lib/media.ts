import { readable } from "svelte/store";

// Reactive store that tracks whether a CSS media query currently matches.
// Returns `false` during SSR / when `matchMedia` is unavailable.
export function mediaQuery(query: string) {
  return readable(false, set => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(query);
    set(mql.matches);
    const onChange = () => set(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  });
}

// Mobile breakpoint, matching `0px - 719.98px` from public/index.css.
export const isMobile = mediaQuery("(max-width: 719.98px)");
