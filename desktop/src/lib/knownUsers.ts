import type { Author } from "@bindings/cob/Author";

import { invoke } from "@app/lib/invoke";

// Listing known users scans every seeded repo's patches and issues, so the
// result is memoised for the session: the first assignee modal pays the cost,
// later opens reuse it. A failed fetch is not cached, so the next open retries.
// New activity within the session won't appear until a reload, which is an
// acceptable trade-off for an assignee picker.
let cache: Promise<Author[]> | undefined;

export function listKnownUsers(): Promise<Author[]> {
  if (!cache) {
    cache = invoke<Author[]>("list_known_users").catch(error => {
      cache = undefined;
      throw error;
    });
  }
  return cache;
}
