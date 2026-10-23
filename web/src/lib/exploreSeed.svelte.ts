import { DEFAULT_SEED, LOCAL_NODE, SEED_NODES } from "@app/node/seedNodes";

// The seed node this viewer last explored, remembered per browser.
const STORAGE_KEY = "radicle2:explore-seed";

function isKnown(seed: string | undefined | null): seed is string {
  return seed === LOCAL_NODE || SEED_NODES.some(s => s.host === seed);
}

function load(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isKnown(stored) ? stored : DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}

export const exploreSeed = $state({ current: load() });

export function chooseSeed(seed: string) {
  if (!isKnown(seed)) return;
  exploreSeed.current = seed;
  try {
    localStorage.setItem(STORAGE_KEY, seed);
  } catch {
    // Without storage the choice lasts for this visit.
  }
}

export function seedLabel(seed: string): string {
  return seed === LOCAL_NODE ? "your node" : seed;
}
