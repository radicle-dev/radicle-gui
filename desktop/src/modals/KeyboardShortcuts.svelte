<script lang="ts">
  import { cubicIn, cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";

  import { comboKeys, shortcuts } from "@app/lib/shortcuts.svelte";

  const rows = Object.values(shortcuts).map(s => ({
    keys: comboKeys("label" in s ? s.label : s.combos[0]),
    description: s.description,
    note: "note" in s ? s.note : undefined,
  }));

  const globalRows = rows.filter(row => !row.note);
  const notes = rows
    .map(row => row.note)
    .filter(
      (note, index, all): note is string =>
        note !== undefined && all.indexOf(note) === index,
    );
  const contextGroups = notes.map(note => ({
    note,
    rows: rows.filter(row => row.note === note),
  }));
</script>

<style>
  .modal {
    width: max-content;
    max-width: calc(100vw - 4rem);
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .columns {
    display: grid;
    grid-template-columns: auto auto;
  }
  .column {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    align-content: start;
    column-gap: 1rem;
    row-gap: 0.75rem;
    padding: 1.5rem;
  }
  .column + .column {
    border-left: 1px solid var(--color-border-subtle);
  }
  .keys {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    justify-content: flex-end;
  }
  .key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.75rem;
    min-width: 1.75rem;
    padding: 0 0.5rem;
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
  }
  .plus {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .description {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .note {
    grid-column: 1 / -1;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .note:not(:first-child) {
    margin-top: 0.25rem;
  }
</style>

{#snippet shortcutRow(row: (typeof rows)[number])}
  <div class="keys">
    {#each row.keys as key, index (key)}
      {#if index > 0}
        <span class="plus">+</span>
      {/if}
      <span class="key">{key}</span>
    {/each}
  </div>
  <span class="description">{row.description}</span>
{/snippet}

<div
  class="modal"
  in:fly={{ y: 8, duration: 160, easing: cubicOut }}
  out:fly={{ y: 8, duration: 120, easing: cubicIn }}>
  <div class="header">
    <span class="title">Keyboard shortcuts</span>
  </div>
  <div class="columns">
    <div class="column">
      {#each globalRows as row, index (index)}
        {@render shortcutRow(row)}
      {/each}
    </div>
    <div class="column">
      {#each contextGroups as group (group.note)}
        <span class="note">{group.note}</span>
        {#each group.rows as row, index (index)}
          {@render shortcutRow(row)}
        {/each}
      {/each}
    </div>
  </div>
</div>
