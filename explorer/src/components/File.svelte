<script lang="ts">
  import { tick } from "svelte";

  import ExpandButton from "./ExpandButton.svelte";

  export let collapsable: boolean = false;
  export let expanded: boolean = true;
  export let sticky: boolean = true;
  export let containerBackground: string = "var(--color-surface-subtle)";

  let header: HTMLDivElement;
</script>

<style>
  .header {
    display: flex;
    height: 3rem;
    align-items: center;
    padding: 0 1rem;
    background-color: var(--color-surface-canvas);
    z-index: 2;
  }

  .header-border {
    border-bottom: 1px solid var(--color-border-subtle);
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
  }

  .right {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
    overflow: hidden;
  }

  .container {
    position: relative;
    overflow-x: auto;
  }
  @media (max-width: 719.98px) {
    .header {
      padding: 0 1rem 0 1rem;
    }
  }
</style>

<div
  bind:this={header}
  class="header"
  class:sticky
  class:header-border={expanded}>
  <div class="left">
    {#if collapsable}
      <ExpandButton
        {expanded}
        on:toggle={async () => {
          expanded = !expanded;
          if (!expanded) {
            await tick();
            header.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }} />
    {/if}
    <slot name="left-header" />
  </div>

  <div class="right">
    <slot name="right-header" {expanded} />
  </div>
</div>

{#if expanded}
  <div class="container" style:background={containerBackground}>
    <slot />
  </div>
{/if}
