<script lang="ts">
  import TooltipBadge from "@app/components/TooltipBadge.svelte";

  interface Props {
    tooltip?: string;
  }

  const { tooltip = "You are the author" }: Props = $props();
</script>

<style>
  .you {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0 0.375rem;
    white-space: nowrap;
  }
</style>

<TooltipBadge {tooltip}>
  {#snippet badge()}
    <span class="you" aria-label={tooltip}>You</span>
  {/snippet}
</TooltipBadge>
