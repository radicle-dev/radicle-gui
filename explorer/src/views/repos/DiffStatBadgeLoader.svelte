<script lang="ts">
  import type { BaseUrl, Patch, Revision } from "@http-client";

  import { cachedGetDiffStats } from "@app/views/repos/router";
  import { formatCommit } from "@app/lib/utils";

  import DiffStatBadge from "@app/components/DiffStatBadge.svelte";
  import Link from "@app/components/Link.svelte";
  import Loading from "@app/components/Loading.svelte";

  export let repoId: string;
  export let baseUrl: BaseUrl;
  export let patch: Patch;
  export let latestRevision: Revision;
</script>

{#await cachedGetDiffStats(baseUrl, repoId, latestRevision.base, latestRevision.oid)}
  <Loading small />
{:then stats}
  <Link
    title="Compare {formatCommit(latestRevision.base)}..{formatCommit(
      latestRevision.oid,
    )}"
    route={{
      resource: "repo.patch",
      repo: repoId,
      node: baseUrl,
      patch: patch.id,
      view: {
        name: "diff",
        fromCommit: latestRevision.base,
        toCommit: latestRevision.oid,
      },
    }}>
    <DiffStatBadge
      hoverable
      insertions={stats.insertions}
      deletions={stats.deletions} />
  </Link>
{/await}
