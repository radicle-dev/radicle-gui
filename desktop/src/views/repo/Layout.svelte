<script lang="ts">
  import type { Snippet } from "svelte";

  import ScrollArea from "@app/components/ScrollArea.svelte";

  interface Props {
    children: Snippet;
    selfScroll?: boolean;
  }

  const { children, selfScroll = false }: Props = $props();
</script>

{#if selfScroll}
  <div
    style="height: 100%; overflow: hidden; min-width: 0; background-color: var(--color-surface-canvas);">
    {@render children()}
  </div>
{:else}
  <ScrollArea
    style="height: 100%; width: 100%; background-color: var(--color-surface-canvas);">
    {@render children()}
  </ScrollArea>
{/if}
