<script lang="ts">
  import type { Commit } from "@bindings/repo/Commit";
  import type { Snippet } from "svelte";

  import * as utils from "@app/lib/utils";

  import CommitAuthors from "@app/components/CommitAuthors.svelte";

  interface Props {
    children: Snippet;
    commit: Commit;
  }

  const { children, commit }: Props = $props();
</script>

<style>
  .authorship {
    display: flex;
    font: var(--txt-body-m-regular);
    column-gap: 0.5rem;
    align-items: center;
    white-space: nowrap;
  }
</style>

<div class="authorship">
  <CommitAuthors {commit} />
  {@render children()}
  <div title={utils.commitTimes(commit)}>
    {utils.formatTimestamp(commit.committer.time * 1000)}
  </div>
</div>
