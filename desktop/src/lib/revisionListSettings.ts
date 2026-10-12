import { z } from "zod";

import useLocalStorage from "@app/lib/useLocalStorage.svelte";

// How the revision dropdown is arranged. Kept out of the patch view so the
// choice follows the user across patches and repositories rather than
// resetting every time the view is mounted.
const schema = z.object({
  sortDesc: z.boolean().default(false),
  // Bucket revisions per author, patch author first.
  groupByAuthor: z.boolean().default(false),
  // Off by default: the position is rarely what you are scanning for, and
  // it is already spelled out on the dropdown's own button.
  showNumber: z.boolean().default(false),
  showStats: z.boolean().default(false),
  showReviewers: z.boolean().default(true),
});

export type RevisionListSettings = z.infer<typeof schema>;

const storage = useLocalStorage("revisionListSettings", schema, {
  sortDesc: false,
  groupByAuthor: false,
  showNumber: false,
  showStats: false,
  showReviewers: true,
});

export const revisionListSettings = {
  get value(): RevisionListSettings {
    return storage.value;
  },

  toggle(key: keyof RevisionListSettings) {
    storage.value = { ...storage.value, [key]: !storage.value[key] };
  },
};
