<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    badges?: Snippet;
    chipBackground?: string;
    chipColor?: string;
    contextActive?: boolean;
    focussed?: boolean;
    heading: Snippet;
    icon: Snippet;
    meta: Snippet;
    onclick: () => void;
    oncontextmenu?: (event: MouseEvent) => void;
  }

  const {
    badges,
    chipBackground,
    chipColor,
    contextActive,
    focussed,
    heading,
    icon,
    meta,
    onclick,
    oncontextmenu,
  }: Props = $props();

  function onkeydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onclick();
    }
  }
</script>

<style>
  .cob-teaser {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    min-height: 5rem;
    background-color: var(--color-surface-canvas);
    padding: 1.25rem;
    cursor: pointer;
    font: var(--txt-body-l-regular);
    word-break: break-word;
    width: 100%;
  }
  .cob-teaser.focussed {
    padding: 1rem;
  }
  .cob-teaser:hover,
  .cob-teaser.context-active {
    background-color: var(--color-surface-subtle);
  }
  .chip {
    padding: 0;
    margin-right: 1rem;
  }
  .focus-ring {
    display: flex;
    border: 1px solid var(--color-border-brand);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
  }
</style>

{#snippet teaser()}
  <div
    tabindex="0"
    role="button"
    class="cob-teaser"
    class:focussed
    class:context-active={contextActive}
    {oncontextmenu}
    {onclick}
    {onkeydown}>
    <div class="global-flex" style:align-items="flex-start">
      <div
        class="global-chip chip"
        style:color={chipColor}
        style:background-color={chipBackground}>
        {@render icon()}
      </div>
      <div
        class="global-flex"
        style:flex-direction="column"
        style:align-items="flex-start">
        {@render heading()}
        <div class="global-flex txt-body-m-regular" style:flex-wrap="wrap">
          {@render meta()}
        </div>
      </div>
    </div>

    {#if badges}
      <div class="global-flex" style:margin-left="auto">
        {@render badges()}
      </div>
    {/if}
  </div>
{/snippet}

{#if focussed}
  <div class="focus-ring">
    {@render teaser()}
  </div>
{:else}
  {@render teaser()}
{/if}
