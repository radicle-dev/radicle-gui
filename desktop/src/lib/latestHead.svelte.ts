import type { Commit } from "@bindings/repo/Commit";

import { keys } from "@radicle-gui/core/keys";
import {
  createQuery,
  invalidatedSinceLoading,
} from "@radicle-gui/ui/lib/query.svelte";

import { invoke } from "@app/lib/invoke";
import { queryClient } from "@app/lib/query";

interface ResolvedRevision {
  rid: string;
  peer: string | undefined;
  revision: string | undefined;
  // The commit the route loader resolved the revision to.
  oid: string;
}

// The commit a revision resolves to now. A branch, or the default branch
// without a revision, can move on while the user reads, so a view keeps
// showing the loaded commit and offers the newer one. Create it during
// component initialisation; the route loader marks `keys.head` as loading first.
export function latestHead(revision: () => ResolvedRevision): {
  readonly current: string | undefined;
} {
  const headKey = $derived(
    keys.head(revision().rid, revision().peer, revision().revision),
  );
  // The loader has just resolved the revision, so that is the latest commit.
  // A ref update during the load may have moved it since, so then the head is
  // checked again at mount, and a push during the load still shows as newer.
  $effect.pre(() => {
    queryClient.setQueryData(headKey, revision().oid);
    if (invalidatedSinceLoading(queryClient, headKey)) {
      void queryClient.invalidateQueries({ queryKey: headKey, exact: true });
    }
  });
  const head = createQuery<string>(queryClient, () => {
    const { rid, peer, revision: rev } = revision();
    return {
      queryKey: headKey,
      queryFn: async () =>
        (await invoke<Commit>("repo_commit", { rid, peer, revision: rev })).id,
    };
  });
  return {
    get current() {
      return head.current.data;
    },
  };
}
