<script lang="ts">
  import type { BaseUrl, ChangesetWithoutDiff } from "@http-client";

  import Badge from "@app/components/Badge.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import FilePath from "@app/components/FilePath.svelte";

  export let headerBadgeCaption: ChangesetWithoutDiff["status"];
  export let newPath: string;
  export let oldPath: string;
  export let revision: string | undefined = undefined;
  export let baseUrl: BaseUrl;
  export let repoId: string;
</script>

<style>
  .wrapper {
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-md);
    line-height: 1.5rem;
  }
  .header {
    align-items: center;
    background: none;
    border-radius: 0;
    display: flex;
    flex-direction: row;
    height: 3rem;
    padding: 1rem;
  }
  .actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }
</style>

<div id={newPath} class="wrapper">
  <header class="header">
    <div class="actions">
      <span>
        <FilePath filenameWithPath={oldPath} /> → <FilePath
          filenameWithPath={newPath} />
      </span>
      {#if headerBadgeCaption === "moved"}
        <Badge variant="foreground">moved</Badge>
      {:else if headerBadgeCaption === "copied"}
        <Badge variant="foreground">copied</Badge>
      {/if}
    </div>
    <div style:margin-left="auto">
      <Link
        route={{
          resource: "repo.source",
          repo: repoId,
          node: baseUrl,
          path: newPath,
          revision,
        }}>
        <IconButton title="View file at this commit">
          <Icon name="chevron-left-right" />
        </IconButton>
      </Link>
    </div>
  </header>
</div>
