<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    checked?: boolean;
    disabled?: boolean;
    children?: Snippet;
  }

  /* eslint-disable prefer-const */
  let {
    checked = $bindable(false),
    disabled = false,
    children,
  }: Props = $props();
  /* eslint-enable prefer-const */
</script>

<style>
  .checkbox {
    display: inline-flex;
    align-items: flex-start;
    gap: 0.5rem;
    min-width: 0;
    cursor: pointer;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .checkbox:has(input:disabled) {
    cursor: not-allowed;
    color: var(--color-text-disabled);
  }
  /* The native input stays in the layout so it keeps focus, keyboard toggling
     and the label association; the box below is what gets drawn. */
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    opacity: 0;
    pointer-events: none;
  }
  .box {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-base);
    color: transparent;
  }
  .checkbox:hover .box {
    background-color: var(--color-surface-subtle);
    border-color: var(--color-border-strong);
  }
  .checkbox:has(input:checked) .box {
    color: var(--color-text-brand);
  }
  .checkbox:has(input:focus-visible) .box {
    outline: 1px solid var(--color-border-brand);
    outline-offset: 1px;
  }
  .checkbox:has(input:disabled) .box,
  .checkbox:has(input:disabled):hover .box {
    background-color: var(--color-surface-base);
    border-color: var(--color-border-subtle);
  }
  .checkbox:has(input:disabled:checked) .box {
    color: var(--color-text-disabled);
  }
  .label {
    min-width: 0;
  }
</style>

<label class="checkbox">
  <input type="checkbox" bind:checked {disabled} />
  <span class="box"><Icon name="checkmark" /></span>
  {#if children}
    <span class="label">{@render children()}</span>
  {/if}
</label>
