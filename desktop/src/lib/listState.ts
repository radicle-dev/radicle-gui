import type { VirtualizerHandle } from "virtua/svelte";

// virtua's cache snapshot is opaque; derive its type from the handle so we
// don't depend on a non-public export.
export type ListCacheSnapshot = ReturnType<VirtualizerHandle["getCache"]>;

export interface ListState<T = unknown> {
  // The full set of loaded (paginated) items, so a restored list isn't limited
  // to the first page the route loader re-fetches.
  items: T[];
  more: boolean;
  scrollOffset: number;
  // virtua measurement snapshot, so item sizes (and thus the offset) are exact
  // immediately on restore instead of drifting as rows are re-measured.
  cache: ListCacheSnapshot | undefined;
}

// Keep only a handful of recently-visited lists; this is a scroll-restoration
// convenience, not a persistent store.
const MAX_ENTRIES = 20;
const states = new Map<string, ListState>();

export function saveListState(key: string, state: ListState): void {
  // Re-insert to mark as most-recently-used.
  states.delete(key);
  states.set(key, state);
  if (states.size > MAX_ENTRIES) {
    const oldest = states.keys().next().value;
    if (oldest !== undefined) {
      states.delete(oldest);
    }
  }
}

export function readListState<T>(key: string): ListState<T> | undefined {
  return states.get(key) as ListState<T> | undefined;
}
