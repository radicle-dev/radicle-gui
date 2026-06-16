<script lang="ts">
  import { labelColor } from "@app/lib/labelColor";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    label: string;
    onRemove?: () => void;
    styleHeight?: "1.5rem" | "2rem";
  }

  const { label, onRemove = undefined, styleHeight = "2rem" }: Props = $props();
  const color = $derived(labelColor(label));
</script>

<style>
  .label {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    border-radius: var(--border-radius-sm);
    padding: 0 0.5rem;
    max-width: 12rem;
  }
  .label:has(.remove) {
    padding-right: 0.125rem;
  }
  .remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.125rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
  }
  .remove:hover,
  .remove:focus-visible {
    opacity: 1;
  }
</style>

<div
  class="label txt-body-m-regular"
  style:height={styleHeight}
  style:background-color={color.background}
  style:color={color.text}>
  <div class="txt-overflow" title={label}>{label}</div>
  {#if onRemove}
    <button
      type="button"
      class="remove"
      title="Remove"
      onclick={e => {
        e.stopPropagation();
        onRemove?.();
      }}>
      <Icon name="close" />
    </button>
  {/if}
</div>
