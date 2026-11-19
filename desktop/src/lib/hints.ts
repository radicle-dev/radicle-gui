import { z } from "zod";

import useLocalStorage from "@app/lib/useLocalStorage.svelte";

// One-off tips that can be dismissed permanently. Kept in a single list so
// settings can offer to bring all of them back.
export type HintId =
  | "markdown"
  | "guide"
  | "profile.permanence"
  // One for each profile and number of its controllers.
  | `profile.controllers:${string}`;

const storage = useLocalStorage("dismissedHints", z.array(z.string()), []);

export const hints = {
  get dismissedCount(): number {
    return storage.value.length;
  },

  isDismissed(id: HintId): boolean {
    return storage.value.includes(id);
  },

  dismiss(id: HintId) {
    if (!storage.value.includes(id)) {
      storage.value = [...storage.value, id];
    }
  },

  resetAll() {
    storage.value = [];
  },
};
