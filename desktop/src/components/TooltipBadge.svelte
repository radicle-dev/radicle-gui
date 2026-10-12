<script lang="ts">
  import type { Snippet } from "svelte";

  import HoverPopover from "@app/components/HoverPopover.svelte";

  interface Props {
    tooltip: string;
    badge: Snippet;
    tight?: boolean;
  }

  const { tooltip, badge, tight = false }: Props = $props();
</script>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  /* HoverPopover wraps its trigger in an inline-block container and a block
     button, whose line boxes push the badge off the centre line of whatever
     it sits beside. Neither needs a box of its own here. */
  .badge :global(.container),
  .badge :global([role="button"]) {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }
  .tight:not(:first-child) {
    margin-left: -0.25rem;
  }
  .tooltip {
    font: var(--txt-body-s-regular);
    color: var(--color-text-primary);
    white-space: nowrap;
  }
</style>

<span class="badge" class:tight>
  <HoverPopover stylePadding="0.25rem 0.5rem">
    {#snippet toggle()}
      {@render badge()}
    {/snippet}
    {#snippet popover()}
      <span class="tooltip">{tooltip}</span>
    {/snippet}
  </HoverPopover>
</span>
