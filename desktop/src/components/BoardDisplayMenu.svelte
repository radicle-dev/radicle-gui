<script lang="ts">
  import type { BoardView } from "@app/lib/board";
  import type { BoardViewSettings, Property } from "@app/lib/boardView";
  import {
    defaultView,
    GROUPINGS,
    ORDERINGS,
    PROPERTIES,
  } from "@app/lib/boardView";

  import Checkbox from "@app/components/Checkbox.svelte";
  import Icon from "@app/components/Icon.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";

  interface Props {
    view: BoardView;
    settings: BoardViewSettings;
    onView: (view: BoardView) => void;
  }

  /* eslint-disable prefer-const */
  let { view, settings = $bindable(), onView }: Props = $props();
  /* eslint-enable prefer-const */

  function toggleProperty(property: Property) {
    settings.properties = settings.properties.includes(property)
      ? settings.properties.filter(p => p !== property)
      : [...settings.properties, property];
  }

  function reset() {
    const { filters } = settings;
    settings = { ...defaultView(), filters };
  }
</script>

<style>
  .menu {
    width: 20rem;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem 1rem;
  }
  .section + .section {
    border-top: 1px solid var(--color-border-subtle);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 2rem;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  select {
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
  }
  .row.disabled {
    color: var(--color-text-disabled);
  }
  select:disabled {
    color: var(--color-text-disabled);
    background-color: var(--color-surface-base);
  }
  select:focus {
    outline: none;
    border-color: var(--color-border-brand);
  }
  .direction {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
  }
  .direction:hover:not(:disabled) {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .direction:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .heading {
    color: var(--color-text-primary);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .chip {
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: 999px;
    background: none;
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .chip.on {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.625rem 1rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .reset {
    border: 0;
    background: none;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .reset:hover {
    color: var(--color-text-primary);
  }
</style>

<div class="menu">
  <div class="section">
    <SegmentedSwitch
      options={[
        { value: "board", label: "Columns" },
        { value: "list", label: "List" },
      ]}
      value={view}
      onchange={onView} />
    <div class="row" class:disabled={view !== "list"}>
      Grouping
      <select
        aria-label="Grouping"
        title={view === "list" ? undefined : "Grouping applies to the list"}
        disabled={view !== "list"}
        bind:value={settings.grouping}>
        {#each GROUPINGS as grouping (grouping.id)}
          <option value={grouping.id}>{grouping.label}</option>
        {/each}
      </select>
    </div>
    <div class="row">
      Ordering
      <div class="controls">
        <button
          class="direction"
          title={settings.descending ? "Descending" : "Ascending"}
          aria-label="Reverse the order"
          disabled={settings.ordering === "manual"}
          onclick={() => (settings.descending = !settings.descending)}>
          <Icon name={settings.descending ? "arrow-down" : "arrow-up"} />
        </button>
        <select aria-label="Ordering" bind:value={settings.ordering}>
          {#each ORDERINGS as ordering (ordering.id)}
            <option value={ordering.id}>{ordering.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  <div class="section">
    <Checkbox bind:checked={settings.showCompleted}>Show completed</Checkbox>
    <Checkbox bind:checked={settings.showCanceled}>Show canceled</Checkbox>
    <Checkbox bind:checked={settings.showEmpty}>Show empty columns</Checkbox>
  </div>

  <div class="section">
    <span class="heading">Display properties</span>
    <div class="chips">
      {#each PROPERTIES as property (property.id)}
        <button
          class="chip"
          class:on={settings.properties.includes(property.id)}
          aria-pressed={settings.properties.includes(property.id)}
          onclick={() => toggleProperty(property.id)}>
          {property.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="footer">
    <button class="reset" onclick={reset}>Reset</button>
  </div>
</div>
