<script lang="ts">
  export let selected: boolean;
  export let disabled: boolean = false;
  export let title: string | undefined = undefined;
  export let style: string | undefined = undefined;
</script>

<style>
  .item {
    cursor: pointer;
    display: flex;
    align-items: center;
    flex-direction: row;
    gap: 0.375rem;
    padding: 0.5rem 0.375rem;
    white-space: nowrap;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .item.disabled {
    color: var(--color-text-disabled);
  }
  .item:hover,
  .selected {
    background-color: var(--color-surface-mid);
  }
  .selected {
    color: var(--color-text-primary);
    background-color: var(--color-surface-mid);
  }
  .item:hover.selected {
    background-color: var(--color-surface-strong);
  }
  .item:hover.selected.disabled {
    background-color: var(--color-surface-mid);
  }
  .item:hover.disabled {
    cursor: not-allowed;
    background-color: var(--color-surface-subtle);
  }
</style>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
  role="button"
  tabindex="0"
  class="item"
  class:selected
  class:disabled
  {style}
  {title}
  on:click>
  <slot />
</div>
