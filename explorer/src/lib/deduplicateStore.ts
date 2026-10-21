import type { Readable, Writable } from "svelte/store";

import { derived } from "svelte/store";
import isEqual from "lodash/isEqual";

// Returns a derived store that only notifies subscribers if the value has changed.
export function deduplicateStore<T>(
  store: Readable<T> | Writable<T>,
): Readable<T> {
  let previous: T;

  return derived(store, ($value, set) => {
    if (!isEqual($value, previous)) {
      previous = $value;
      set($value);
    }
  });
}
