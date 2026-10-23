<script lang="ts">
  import Icon from "./Icon.svelte";
  import LabelChip from "./LabelChip.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  interface Props {
    labels: { label: string; count: number }[];
    // The selected labels; an issue matches if it has any of them.
    value: string[];
    onchange: (labels: string[]) => void;
  }

  const { labels, value, onchange }: Props = $props();

  // Keeps the menu open so several labels can be picked in a row.
  function toggleLabel(label: string) {
    onchange(value.includes(label) ? value.filter(l => l !== label) : [...value, label]);
  }

  function clear() {
    onchange([]);
    closeFocused();
  }
</script>

<style>
  .trigger {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.25rem;
    padding: 0 0.5rem 0 0.625rem;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .trigger:hover {
    border-color: var(--color-border-strong);
  }
  .trigger:focus-visible {
    border-color: var(--color-border-brand);
  }
  .extra {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .chevron {
    display: inline-flex;
    color: var(--color-text-tertiary);
  }
  .menu {
    min-width: 14rem;
    max-height: 20rem;
    overflow-y: auto;
    padding: 0.25rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .option {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2rem;
    padding: 0 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .option:hover,
  .option:focus-visible {
    background: var(--color-surface-subtle);
  }
  .check {
    display: inline-flex;
    width: 1rem;
    color: var(--color-text-primary);
  }
  .count {
    margin-left: auto;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
</style>

<Popover placement="bottom-start">
  {#snippet toggle(onclick)}
    <button class="trigger" {onclick} aria-haspopup="listbox" aria-label="Filter by label">
      {#if value.length === 0}
        All labels
      {:else}
        {#each value.slice(0, 2) as l (l)}<LabelChip label={l} />{/each}
        {#if value.length > 2}<span class="extra">+{value.length - 2}</span>{/if}
      {/if}
      <span class="chevron"><Icon name="chevron-down" /></span>
    </button>
  {/snippet}
  {#snippet popover()}
    <div class="menu" role="listbox" aria-label="Labels" aria-multiselectable="true">
      <button class="option" role="option" aria-selected={value.length === 0} onclick={clear}>
        <span class="check">{#if value.length === 0}<Icon name="checkmark" />{/if}</span>
        All labels
      </button>
      {#each labels as l (l.label)}
        <button class="option" role="option" aria-selected={value.includes(l.label)} onclick={() => toggleLabel(l.label)}>
          <span class="check">{#if value.includes(l.label)}<Icon name="checkmark" />{/if}</span>
          <LabelChip label={l.label} />
          <span class="count">{l.count}</span>
        </button>
      {/each}
    </div>
  {/snippet}
</Popover>
