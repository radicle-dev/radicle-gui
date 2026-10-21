import type { Writable } from "svelte/store";

import { writable, get } from "svelte/store";
import { z } from "zod";

type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/**
 * An extension of Svelte's `writable` that also saves its state to localStorage and
 * automatically restores it.
 * @param key The localStorage key to use for saving the writable's contents.
 * @param schema A Zod schema describing the contents of the writable.
 * @param initialValue The initial value to use if no prior state has been saved in
 * localstorage.
 * @param disableLocalStorage Skip interaction with localStorage, for example during SSR.
 * @returns A stored writable.
 */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage can throw on write in Safari private mode or when the
    // quota is exceeded. The in-memory store still works for this session;
    // the user just won't have persistence across reloads.
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // See safeSetItem.
  }
}

export default function storedWritable<
  S extends z.infer<T>,
  T extends z.ZodType = z.ZodType<S>,
>(
  key: string,
  schema: T,
  initialValue: z.infer<typeof schema>,
  disableLocalStorage = false,
): Writable<
  Equals<T, typeof schema> extends true ? S : z.infer<typeof schema>
> & { clear: () => void } {
  const stored = !disableLocalStorage ? safeGetItem(key) : null;

  const parseFromJson = (content: string) => {
    return z
      .string()
      .transform((_, ctx) => {
        try {
          return JSON.parse(content);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "invalid json",
          });
          return z.never;
        }
      })
      .pipe(schema)
      .safeParse(content);
  };

  // Subscribe to window storage event to keep changes from another tab in sync.
  if (!disableLocalStorage) {
    window?.addEventListener("storage", event => {
      if (event.key === key) {
        if (event.newValue === null) {
          w.set(initialValue as S);
          return;
        }

        const { success, data } = parseFromJson(event.newValue);
        w.set(success ? (data as S) : (initialValue as S));
      }
    });
  }
  const parsed = stored ? parseFromJson(stored) : undefined;
  const w = writable<S>(
    parsed?.success ? (parsed.data as S) : (initialValue as S),
  );

  /**
   * Set writable value and inform subscribers. Updates the writeable's stored data in
   * localstorage.
   * */
  function set(...args: Parameters<typeof w.set>) {
    w.set(...args);
    if (!disableLocalStorage) safeSetItem(key, JSON.stringify(get(w)));
  }

  /**
   * Update writable value using a callback and inform subscribers. Updates the writeable's
   * stored data in localstorage.
   * */
  function update(...args: Parameters<typeof w.update>) {
    w.update(...args);
    if (!disableLocalStorage) safeSetItem(key, JSON.stringify(get(w)));
  }

  /**
   * Delete any data saved for this StoredWritable in localstorage.
   */
  function clear() {
    w.set(initialValue as S);
    if (!disableLocalStorage) safeRemoveItem(key);
  }

  return {
    subscribe: w.subscribe,
    set,
    update,
    clear,
  };
}
