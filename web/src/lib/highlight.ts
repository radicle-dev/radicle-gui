import { scrollBehavior } from "./motion";

const SHOWN_MS = 1600;
const FADE_MS = 700;
const WAIT_MS = 1500;

// Scrolls to the elements a link points at and briefly rings them, so they
// stand out on a busy page. Waits a little for pages that render in stages,
// and scrolls to whichever comes first on the page.
export function highlightTargets(ids: string[]) {
  const started = Date.now();
  const attempt = () => {
    const found = ids.map(id => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (found.length < ids.length && Date.now() - started < WAIT_MS) {
      setTimeout(attempt, 50);
      return;
    }
    if (found.length === 0) return;
    const first = found.reduce((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? a : b));
    first.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    for (const el of found) {
      el.classList.remove("arrived-fading");
      el.classList.add("arrived");
    }
    setTimeout(() => {
      for (const el of found) {
        el.classList.add("arrived-fading");
        el.classList.remove("arrived");
      }
      setTimeout(() => found.forEach(el => el.classList.remove("arrived-fading")), FADE_MS);
    }, SHOWN_MS);
  };
  attempt();
}

export function highlightTarget(id: string) {
  highlightTargets([id]);
}
