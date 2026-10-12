<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    leftHeader: Snippet;
    children: Snippet;
  }

  const { leftHeader, children }: Props = $props();
</script>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.5rem;
    padding: 0 0.5rem;
    font: var(--txt-body-m-regular);
    background-color: var(--color-surface-canvas);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .icon {
    display: grid;
    width: 1rem;
    height: 1rem;
    place-items: center;
  }
</style>

<div style:display="flex" style:flex-direction="column" style:width="100%">
  <div class="header">
    <span class="icon"><Icon name="commit" /></span>
    {@render leftHeader()}
  </div>
  {@render children()}
</div>
