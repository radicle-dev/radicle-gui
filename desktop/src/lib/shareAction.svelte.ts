import { z } from "zod";

export const shareActionSchema = z.enum(["open", "copyLink", "copyId"]);

export type ShareAction = z.infer<typeof shareActionSchema>;

const KEY = "shareAction";

export const defaultShareAction: ShareAction = "copyLink";

function load(): ShareAction {
  const raw = globalThis.localStorage?.getItem(KEY);
  if (!raw) {
    return defaultShareAction;
  }
  const parsed = shareActionSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultShareAction;
}

export const shareAction = $state<{ value: ShareAction }>({ value: load() });

// A detached root effect persists changes for the whole session; the module
// singleton is never torn down.
$effect.root(() => {
  $effect(() => {
    globalThis.localStorage?.setItem(KEY, shareAction.value);
  });
});
