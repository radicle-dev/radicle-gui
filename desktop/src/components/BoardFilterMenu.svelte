<script lang="ts">
  import { PRIORITIES } from "@app/lib/board";
  import type { BoardFilters } from "@app/lib/boardView";
  import { activeFilterCount } from "@app/lib/boardView";

  import Checkbox from "@app/components/Checkbox.svelte";
  import PriorityIcon from "@app/components/PriorityIcon.svelte";

  interface Props {
    filters: BoardFilters;
    people: { did: string; name: string }[];
    labels: string[];
    me: string;
  }

  /* eslint-disable prefer-const */
  let { filters = $bindable(), people, labels, me }: Props = $props();
  /* eslint-enable prefer-const */

  type ListKey = keyof BoardFilters;

  function has(key: ListKey, value: string): boolean {
    return (filters[key] as string[]).includes(value);
  }

  function toggle(key: ListKey, value: string) {
    const list = filters[key] as string[];
    filters = {
      ...filters,
      [key]: list.includes(value)
        ? list.filter(v => v !== value)
        : [...list, value],
    };
  }

  function clear() {
    filters = { types: [], assignees: [], priorities: [], labels: [] };
  }
</script>

<style>
  .menu {
    width: 18rem;
    max-height: 32rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
  }
  .section + .section {
    border-top: 1px solid var(--color-border-subtle);
  }
  .heading {
    font: var(--txt-body-s-regular, var(--txt-body-m-regular));
    color: var(--color-text-tertiary);
  }
  .option {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.625rem 1rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .clear {
    border: 0;
    background: none;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .clear:disabled {
    color: var(--color-text-disabled);
    cursor: default;
  }
  .clear:hover:not(:disabled) {
    color: var(--color-text-primary);
  }
</style>

<div class="menu">
  <div class="section">
    <span class="heading">Type</span>
    <Checkbox
      checked={has("types", "issue")}
      onchange={() => toggle("types", "issue")}>
      Issues
    </Checkbox>
    <Checkbox
      checked={has("types", "patch")}
      onchange={() => toggle("types", "patch")}>
      Patches
    </Checkbox>
  </div>

  <div class="section">
    <span class="heading">Assignee</span>
    <Checkbox
      checked={has("assignees", me)}
      onchange={() => toggle("assignees", me)}>
      Me
    </Checkbox>
    <Checkbox
      checked={has("assignees", "none")}
      onchange={() => toggle("assignees", "none")}>
      Unassigned
    </Checkbox>
    {#each people.filter(p => p.did !== me) as person (person.did)}
      <Checkbox
        checked={has("assignees", person.did)}
        onchange={() => toggle("assignees", person.did)}>
        {person.name}
      </Checkbox>
    {/each}
  </div>

  <div class="section">
    <span class="heading">Priority</span>
    {#each PRIORITIES as priority (priority.id)}
      <Checkbox
        checked={has("priorities", priority.id)}
        onchange={() => toggle("priorities", priority.id)}>
        <span class="option">
          <PriorityIcon priority={priority.id} />{priority.label}
        </span>
      </Checkbox>
    {/each}
  </div>

  <div class="section">
    <span class="heading">Label</span>
    {#each labels as label (label)}
      <Checkbox
        checked={has("labels", label)}
        onchange={() => toggle("labels", label)}>
        {label}
      </Checkbox>
    {:else}
      <Checkbox disabled>No labels yet</Checkbox>
    {/each}
  </div>

  <div class="footer">
    <button
      class="clear"
      disabled={activeFilterCount(filters) === 0}
      onclick={clear}>
      Clear filters
    </button>
  </div>
</div>
