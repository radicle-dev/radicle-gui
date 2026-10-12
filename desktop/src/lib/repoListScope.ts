import { z } from "zod";

import useLocalStorage from "@app/lib/useLocalStorage.svelte";

// Which repositories the sidebar lists, mirroring `rad ls` and `rad ls --all`:
// only the ones you seed, or everything in local storage.
const schema = z.union([z.literal("seeded"), z.literal("all")]);

export type RepoListScope = z.infer<typeof schema>;

export const repoListScope = useLocalStorage(
  "repoListScope",
  schema,
  "seeded",
  !window.localStorage,
);
