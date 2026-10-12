<script lang="ts">
  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import { formatOid } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    id: string;
    label: string;
    grouped?: boolean;
  }

  const { id, label, grouped = false }: Props = $props();

  let copied = $state(false);
  const resetCopied = debounce(() => {
    copied = false;
  }, 1000);

  async function copy() {
    await writeToClipboard(id);
    copied = true;
    resetCopied();
  }
</script>

<style>
  .id-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .id-chip.grouped {
    height: 100%;
    border: 0;
    border-radius: 0;
    background: none;
  }
  .id-chip:hover,
  .id-chip:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .value {
    font: var(--txt-code-regular);
  }
  .icon-default,
  .icon-hover {
    display: inline-flex;
    align-items: center;
  }
  .icon-hover {
    display: none;
  }
  .id-chip:hover .icon-default,
  .id-chip:focus-visible .icon-default {
    display: none;
  }
  .id-chip:hover .icon-hover,
  .id-chip:focus-visible .icon-hover {
    display: inline-flex;
  }
</style>

<button
  type="button"
  class="id-chip"
  class:grouped
  title={copied ? "Copied to clipboard" : `Copy ${label}`}
  onclick={copy}>
  {#if copied}
    <Icon name="checkmark" />
  {:else}
    <span class="icon-default"><Icon name="hash" /></span>
    <span class="icon-hover"><Icon name="copy" /></span>
  {/if}
  <span class="value">{formatOid(id)}</span>
</button>
