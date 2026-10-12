<script lang="ts">
  import type { Snippet } from "svelte";

  import { tick } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    children: Snippet;
    expandable?: boolean;
    expanded?: boolean;
    leftHeader?: Snippet;
    rightHeader?: Snippet;
    sticky?: boolean;
    border?: boolean;
    headerBackground?: string;
    // Render just the header, for the pinned bar a virtualized list draws
    // above its rows.
    headerOnly?: boolean;
    // Lets an owner outside this component persist the collapse state, which
    // local state can't do when the block is unmounted while scrolled away.
    onToggle?: (expanded: boolean) => void;
  }

  /* eslint-disable prefer-const */
  let {
    children,
    expanded = $bindable(true),
    leftHeader,
    rightHeader,
    sticky = true,
    expandable = true,
    border = true,
    headerBackground = "var(--color-surface-canvas)",
    headerOnly = false,
    onToggle,
  }: Props = $props();
  /* eslint-enable prefer-const */

  let header: HTMLElement | undefined = $state();
  let hasEverExpanded = $state(expanded);

  $effect(() => {
    if (expanded) hasEverExpanded = true;
  });

  async function toggleExpanded() {
    if (!expandable) return;
    expanded = !expanded;
    onToggle?.(expanded);
    if (!expanded && header) {
      await tick();
      header.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    min-height: 2.5rem;
    padding-left: 0.25rem;
    z-index: 2;
    font: var(--txt-body-m-regular);
    position: relative;
    background-color: var(--header-background);
    border-top-left-radius: var(--border-radius-md);
    border-top-right-radius: var(--border-radius-md);
  }
  .header:not(:first-child) {
    margin-top: 0.5rem;
  }
  .header.expandable {
    cursor: pointer;
    transition: background-color 0.1s ease-in-out;
  }
  .header.expandable:hover,
  .header.expandable:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .header.collapsed {
    border-bottom-left-radius: var(--border-radius-md);
    border-bottom-right-radius: var(--border-radius-md);
  }

  .sticky {
    position: sticky;
    top: 0;
  }

  .left {
    display: flex;
    gap: 0.5rem;
    margin-right: 1rem;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .toggle-icon {
    width: 1.5rem;
    display: flex;
    justify-content: center;
    color: var(--color-text-secondary);
  }
  .icon-stack {
    display: grid;
  }
  .icon-default,
  .icon-hover {
    grid-area: 1 / 1;
    transition:
      opacity 150ms ease,
      transform 150ms ease;
  }
  .icon-hover {
    opacity: 0;
    transform: rotate(-90deg);
  }
  .header.expandable:hover .icon-default,
  .header.expandable:focus-visible .icon-default {
    opacity: 0;
    transform: rotate(90deg);
  }
  .header.expandable:hover .icon-hover,
  .header.expandable:focus-visible .icon-hover {
    opacity: 1;
    transform: rotate(0);
  }

  .container {
    position: relative;
    overflow-x: auto;
    z-index: 1;
    border-top: none;
    border-bottom-left-radius: var(--border-radius-md);
    border-bottom-right-radius: var(--border-radius-md);
  }
  .collapsible {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 180ms ease-out;
  }
  .collapsible.open {
    grid-template-rows: 1fr;
  }
  .collapsible-inner {
    overflow: hidden;
    min-height: 0;
  }
</style>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="header"
  class:expandable
  class:sticky
  class:collapsed={!expanded}
  bind:this={header}
  style:--header-background={headerBackground}
  role={expandable ? "button" : undefined}
  tabindex={expandable ? 0 : undefined}
  style:border={border ? "1px solid var(--color-border-subtle)" : undefined}
  style:border-bottom={border
    ? "undefined"
    : "1px solid var(--color-border-subtle)"}
  onclick={toggleExpanded}
  onkeydown={async event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      await toggleExpanded();
    }
  }}>
  <div class="left">
    <div class="toggle-icon" style:padding="0 0.5rem">
      {#if expandable}
        <span class="icon-stack">
          <span class="icon-default"><Icon name="document" /></span>
          <span class="icon-hover">
            <Icon name={expanded ? "collapse-vertical" : "expand-vertical"} />
          </span>
        </span>
      {:else}
        <Icon name="document" />
      {/if}
    </div>
    {@render leftHeader?.()}
  </div>
  {#if rightHeader}
    <div
      class="global-flex"
      style:gap="1rem"
      style:margin-left="auto"
      style:margin-right="0.5rem">
      {@render rightHeader()}
    </div>
  {/if}
</div>

{#if hasEverExpanded && !headerOnly}
  <div class="collapsible" class:open={expanded}>
    <div class="collapsible-inner">
      <div
        class="container"
        style:border={border
          ? "1px solid var(--color-border-subtle)"
          : "undefined"}
        style:border-top="none">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
