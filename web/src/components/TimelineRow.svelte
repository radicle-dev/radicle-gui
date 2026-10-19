<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";

  import { fullDate, timeAgo } from "@app/lib/utils";

  import Icon from "./Icon.svelte";
  import PersonLink from "./PersonLink.svelte";

  interface Props {
    icon: ComponentProps<typeof Icon>["name"];
    iconColor?: string;
    author?: string;
    time: number;
    children: Snippet;
    trailing?: Snippet;
  }

  const { icon, iconColor, author, time, children, trailing }: Props = $props();
</script>

<style>
  .row-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.5rem;
    padding: 0.375rem 0.5rem;
    font: var(--txt-body-m-regular);
    min-width: 0;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    background-color: var(--color-surface-canvas);
    position: relative;
    z-index: 1;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    color: var(--color-text-secondary);
  }
  .summary :global(b) {
    color: var(--color-text-primary);
    font-weight: 468;
  }
  .time {
    flex-shrink: 0;
    color: var(--color-text-quaternary);
  }
</style>

<div class="row-item">
  <span class="icon" style:color={iconColor}><Icon name={icon} /></span>
  <div class="summary">
    {#if author}<PersonLink person={author} size="1rem" />{/if}
    {@render children()}
  </div>
  {#if trailing}{@render trailing()}{/if}
  <span class="time" title={fullDate(time)}>{timeAgo(time)}</span>
</div>
