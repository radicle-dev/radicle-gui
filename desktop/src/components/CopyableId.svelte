<script lang="ts">
  import type { Snippet } from "svelte";

  import Clipboard from "@app/components/Clipboard.svelte";

  const {
    inline = false,
    children,
    id,
    styleFont = undefined,
  }: {
    inline?: boolean;
    children?: Snippet;
    id: string;
    styleFont?: string;
  } = $props();

  let clipboard: Clipboard;
</script>

<style>
  .copyable-id {
    cursor: pointer;
    color: var(--color-text-secondary);
    gap: 0.25rem;
  }

  .copyable-id:hover {
    color: var(--color-text-primary);
  }
  .inline {
    display: inline-flex;
    gap: 0;
    white-space: nowrap;
  }
</style>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  role="button"
  tabindex="0"
  onclick={() => clipboard.copy()}
  class:inline
  class="copyable-id global-flex txt-code-regular"
  style:font={styleFont}>
  {#if children}
    {@render children()}
  {:else}
    {id}
  {/if}
  <Clipboard bind:this={clipboard} text={id} />
</div>
