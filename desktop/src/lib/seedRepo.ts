import { createQuery } from "@radicle-gui/ui/lib/query.svelte";

import { repoList } from "@app/lib/cobQueries";
import { invoke } from "@app/lib/invoke";
import { queryClient } from "@app/lib/query";
import { repoListScope } from "@app/lib/repoListScope";
import { parseRepositoryId } from "@app/lib/utils";

// Validates a RID typed into the "Seed a repo" form. The form accepts a bare
// `z…` id as well as `rad:z…`, so the result is the RID in the `rad:` form the
// seeded and queued lists use.
export function seedTarget(
  input: string,
  queued: string[],
  seeded: string[],
): { rid: string } | { error: string } {
  const parsed = parseRepositoryId(input.trim());
  if (parsed === undefined) {
    return { error: "RID is not valid" };
  }
  const rid = `${parsed.prefix}${parsed.pubkey}`;
  if (queued.includes(rid)) {
    return { error: "This repo is already queued for fetching" };
  }
  if (seeded.includes(rid)) {
    return { error: "This repo is already seeded" };
  }
  return { rid };
}

// Seeded repos that haven't been fetched yet, as the repository list last had
// them. Create it during component initialisation.
export function createFetchingRepos(): { readonly current: string[] } {
  const query = createQuery(queryClient, () => repoList(repoListScope.value));

  return {
    get current() {
      return query.current.data?.seededNotReplicated ?? [];
    },
  };
}

export async function seedRepo(rid: string): Promise<void> {
  await invoke<null>("seed", { rid });
}
