<script lang="ts">
  import type { BaseUrl, Tree } from "@http-client";

  import { createEventDispatcher } from "svelte";

  import Loading from "@app/components/Loading.svelte";
  import Link from "@app/components/Link.svelte";

  import File from "./File.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Submodule from "./Submodule.svelte";

  export let baseUrl: BaseUrl;
  export let currentPath: string;
  export let fetchTree: (path: string) => Promise<Tree | undefined>;
  export let name: string;
  export let peer: string | undefined;
  export let prefix: string;
  export let repoId: string;
  export let revision: string | undefined;

  $: expanded = currentPath.indexOf(prefix) === 0;
  $: tree = expanded
    ? fetchTree(prefix).then(tree => {
        return tree;
      })
    : Promise.resolve(undefined);

  const dispatch = createEventDispatcher<{ select: string }>();
  const onSelectFile = ({ detail: path }: { detail: string }) =>
    dispatch("select", path);
</script>

<style>
  .folder {
    display: flex;
    cursor: pointer;
    padding: 0.25rem 0.875rem;
    margin: 0.25rem 0;
    user-select: none;
    white-space: nowrap;
  }
  .folder:hover {
    background-color: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
  }

  .folder-name {
    margin-left: 0.25rem;
    font: var(--txt-body-m-regular);
  }

  .container {
    padding-left: 1rem;
    margin-left: 0.5rem;
  }

  .loading {
    display: inline-block;
    padding: 0.5rem 0;
  }
  .icon-container {
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--color-text-tertiary);
    margin-right: 0.125rem;
  }

  .expanded {
    color: var(--color-text-primary);
  }
</style>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
  role="button"
  tabindex="0"
  class="folder"
  on:click={() => {
    // eslint-disable-next-line
    expanded = !expanded;
  }}>
  <div class="icon-container" class:expanded>
    {#if expanded}
      <Icon name="folder-open" />
    {:else}
      <Icon name="folder" />
    {/if}
  </div>
  <span class="folder-name" class:expanded>{name}</span>
</div>

{#if expanded}
  <div class="container">
    {#await tree}
      <span class="loading"><Loading grayscale noDelay small margins /></span>
    {:then tree}
      {#if tree}
        {#each tree.entries as entry (entry.path)}
          {#if entry.kind === "tree"}
            <!-- svelte:self doesn't check types, make sure to pass in all
            required props! -->
            <svelte:self
              name={entry.name}
              on:select={onSelectFile}
              prefix={`${entry.path}/`}
              {baseUrl}
              {currentPath}
              {fetchTree}
              {peer}
              {repoId}
              {revision} />
          {:else if entry.kind === "submodule"}
            <Submodule name={entry.name} oid={entry.oid} />
          {:else}
            <Link
              route={{
                resource: "repo.source",
                repo: repoId,
                node: baseUrl,
                path: entry.path,
                peer,
                revision,
              }}
              on:afterNavigate={() => onSelectFile({ detail: entry.path })}>
              <File active={entry.path === currentPath} name={entry.name} />
            </Link>
          {/if}
        {/each}
      {/if}
    {/await}
  </div>
{/if}
