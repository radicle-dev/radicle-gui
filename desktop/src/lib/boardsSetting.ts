import { z } from "zod";

import useLocalStorage from "@app/lib/useLocalStorage.svelte";

const storage = useLocalStorage("showBoards", z.boolean(), true);

export const boardsSetting = {
  get visible(): boolean {
    return storage.value;
  },

  set visible(value: boolean) {
    storage.value = value;
  },
};
