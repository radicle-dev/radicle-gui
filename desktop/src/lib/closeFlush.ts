import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import once from "lodash/once";

// A flush writes what a view holds back; `announce` is whether the writes
// are announced to the network as well.
type Flush = (announce: boolean) => Promise<void>;

const flushes = new Set<Flush>();

// Closing writes locally only: the commits and signed refs land, and peers
// learn of them with the next announcement for the repository or when the
// node restarts.
async function flushAll() {
  await Promise.allSettled([...flushes].map(flush => flush(false)));
}

// The backend holds the first close of the window until the frontend has
// written what it was holding back, and closing the window once that's done
// lets it go right away. The test backend has no window, so the page flushes
// as it goes away or is hidden instead.
export const listenForClose = once(async () => {
  if (!window.__TAURI_INTERNALS__) {
    window.addEventListener("pagehide", () => void flushAll());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flushAll();
    });
    return;
  }
  await listen("close-requested", async () => {
    await flushAll();
    await getCurrentWindow().close();
  });
});

export function flushBeforeClose(flush: Flush): () => void {
  flushes.add(flush);
  return () => flushes.delete(flush);
}
