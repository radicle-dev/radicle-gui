import { z } from "zod";

import useLocalStorage from "@app/lib/useLocalStorage.svelte";

const boards = useLocalStorage("labs.boards", z.boolean(), false);
const actorRepos = useLocalStorage("labs.actorRepos", z.boolean(), false);

// Experimental features, off until turned on in Settings.
export const labs = {
  get boards(): boolean {
    return boards.value;
  },

  set boards(value: boolean) {
    boards.value = value;
  },

  get actorRepos(): boolean {
    return actorRepos.value;
  },

  set actorRepos(value: boolean) {
    actorRepos.value = value;
  },
};
