<script lang="ts">
  import type { Tree } from "@bindings/source/Tree";

  import { untrack } from "svelte";

  import FileTreeFile from "@app/components/FileTreeFile.svelte";
  import FileTreeFolder from "@app/components/FileTreeFolder.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    fetchTree: (path: string) => Promise<Tree>;
    onSelect: (path: string) => void;
    currentPath: string;
    name: string;
    prefix: string;
    // Expansion state lives in Tree.svelte so it survives the virtualizer
    // unmounting off-screen rows.
    isExpanded: (prefix: string) => boolean;
    toggleExpanded: (prefix: string) => void;
    indent?: number;
  }

  const {
    name,
    onSelect,
    currentPath,
    prefix,
    isExpanded,
    toggleExpanded,
    fetchTree,
    indent = 0.5,
  }: Props = $props();
  const expanded = $derived(isExpanded(prefix));

  let tree: Tree | undefined = $state.raw();
  let requested = false;

  $effect(() => {
    if (!expanded || requested) return;
    requested = true;
    void untrack(() => fetchTree(prefix)).then(loaded => (tree = loaded));
  });
</script>

<style>
  .folder {
    cursor: pointer;
    width: 100%;
    border-radius: var(--border-radius-sm);
  }
  .folder:hover {
    background-color: var(--color-surface-subtle);
  }
</style>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="folder"
  style:padding-left="{indent}rem"
  style:padding-right="0.5rem"
  onclick={() => toggleExpanded(prefix)}>
  <div class="global-flex txt-body-m-regular" style:padding="0.25rem 0">
    <div class:txt-missing={!expanded}>
      <Icon name={expanded ? "folder-open" : "folder"} />
    </div>
    {name}
  </div>
</div>
{#if expanded}
  {#if tree}
    <div style:display="flex" style:flex-direction="column" style:gap="0.25rem">
      {#each tree.entries as entry (entry.path)}
        {#if entry.kind === "tree"}
          <FileTreeFolder
            {fetchTree}
            {onSelect}
            name={entry.name}
            {currentPath}
            {isExpanded}
            {toggleExpanded}
            prefix={`${entry.path}/`}
            indent={indent + 1.5} />
        {:else if entry.kind === "blob"}
          <FileTreeFile
            name={entry.name}
            onSelect={() => onSelect(entry.path)}
            active={entry.path === currentPath}
            indent={indent + 1.5} />
        {/if}
      {/each}
    </div>
  {/if}
{/if}
