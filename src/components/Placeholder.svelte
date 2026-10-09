<script lang="ts">
  import type { ComponentProps } from "svelte";

  import Icon from "./Icon.svelte";

  export let iconName: ComponentProps<Icon>["name"];
  export let caption: string;
  export let inline: boolean = false;
</script>

<style>
  .placeholder {
    align-items: center;
    text-align: center;
    color: var(--color-text-tertiary);
    display: flex;
    flex-direction: column;
    font: var(--txt-body-m-regular);
    gap: 0.5rem;
    justify-content: center;
  }
  .inline {
    flex-direction: row;
  }
  .icon :global(svg) {
    width: 2rem;
    height: 2rem;
  }
  .inline .icon :global(svg) {
    width: 1rem;
    height: 1rem;
  }
</style>

<div class="placeholder" class:inline>
  <div class="icon"><Icon name={iconName} /></div>
  {#each caption.split("\n") as line}
    {line}
    <br />
  {/each}
</div>
