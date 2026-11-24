import type { KeyProfiles } from "@bindings/actor/KeyProfiles";
import type { ShownProfile } from "@bindings/actor/ShownProfile";
import type { Query } from "@radicle-gui/ui/lib/query.svelte";

import { createQuery } from "@radicle-gui/ui/lib/query.svelte";

import { keyProfiles } from "@app/lib/cobQueries";
import { labs } from "@app/lib/labs";
import { queryClient } from "@app/lib/query";
import { didFromPublicKey, publicKeyFromDid } from "@app/lib/utils";

// One observer for every key on the page, for as long as the app runs. Its
// options follow the lab, so that turning the lab on finds the query in the
// cache again: one that nothing observed for a while is dropped from it, and
// no change would reach an observer still holding the dropped one.
let query: Query<KeyProfiles>;
$effect.root(() => {
  query = createQuery(queryClient, () => ({
    ...keyProfiles(),
    enabled: labs.actorRepos,
  }));

  // Observed for as long as the lab is on, whether or not a key is on the
  // page, so that the profiles are loaded and current when one is.
  $effect(() => {
    if (labs.actorRepos) void query.current;
  });
});

// The profile `key` shows as in place of its alias, read from the cache
// without waiting; `key` is a public key or its DID. Undefined with the lab
// off, until the profiles have loaded, when loading them failed, and for a
// key whose actor has no profile to show or that no actor or more than one
// binds; the alias shows then.
export function profileOf(key: string): ShownProfile | undefined {
  if (!labs.actorRepos) return undefined;

  const { data } = query.current;
  const rid = data?.keys[didFromPublicKey(publicKeyFromDid(key))];

  return rid === undefined ? undefined : data?.profiles[rid];
}
