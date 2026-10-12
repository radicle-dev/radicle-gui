<script lang="ts">
  import type { Tree } from "@bindings/source/Tree";

  import { untrack } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";

  import type { FolderExpansion } from "@app/lib/fileTreeExpansion";
  import {
    isFolderExpanded,
    openAncestors,
    toggleFolder,
  } from "@app/lib/fileTreeExpansion";

  import FileTreeFile from "@app/components/FileTreeFile.svelte";
  import FileTreeFolder from "@app/components/FileTreeFolder.svelte";
  import VirtualList from "@app/components/VirtualList.svelte";

  interface Props {
    tree: Tree;
    currentPath: string;
    fetchTree: (path: string) => Promise<Tree>;
    onSelect: (path: string) => void;
  }

  const { currentPath, tree, fetchTree, onSelect }: Props = $props();

  // Held here rather than in FileTreeFolder so the state survives the
  // virtualizer unmounting off-screen rows.
  const expansion: FolderExpansion = {
    opened: new SvelteSet(),
    collapsedOnVisit: new SvelteMap(),
  };
  let visits = 0;
  const location = $derived.by(() => ({ path: currentPath, visit: ++visits }));
  $effect(() => {
    const path = currentPath;
    untrack(() => openAncestors(expansion, path));
  });
  function isExpanded(prefix: string): boolean {
    return isFolderExpanded(expansion, prefix, location);
  }
  function toggleExpanded(prefix: string) {
    toggleFolder(expansion, prefix, location);
  }
</script>

<VirtualList
  items={tree.entries}
  getKey={entry => entry.path}
  estimatedItemSize={28}>
  {#snippet row(entry)}
    {#if entry.kind === "tree"}
      <FileTreeFolder
        name={entry.name}
        prefix={`${entry.path}/`}
        {currentPath}
        {isExpanded}
        {toggleExpanded}
        {fetchTree}
        {onSelect} />
    {:else}
      <FileTreeFile
        name={entry.name}
        onSelect={() => onSelect(entry.path)}
        active={entry.path === currentPath} />
    {/if}
  {/snippet}
</VirtualList>
