<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import TooltipBadge from "@app/components/TooltipBadge.svelte";

  interface Props {
    tooltip?: string;
  }

  const { tooltip = "Delegate" }: Props = $props();
</script>

<style>
  .delegate {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-tertiary);
  }
</style>

<TooltipBadge {tooltip} tight>
  {#snippet badge()}
    <span class="delegate" aria-label={tooltip}>
      <Icon name="badge" />
    </span>
  {/snippet}
</TooltipBadge>
