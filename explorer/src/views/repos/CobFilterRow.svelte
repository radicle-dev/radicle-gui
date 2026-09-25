<script lang="ts">
  import type { CobFilters } from "./router";

  import { createEventDispatcher } from "svelte";

  import TextInput from "@app/components/TextInput.svelte";

  export let filters: CobFilters;

  const dispatch = createEventDispatcher<{ change: Omit<CobFilters, "q"> }>();

  let author = filters.author ?? "";
  let assignee = filters.assignee ?? "";
  let label = filters.label ?? "";
  let committed = filters;

  $: syncFromRoute(filters);

  function syncFromRoute(next: CobFilters) {
    if (next.author !== committed.author) {
      author = next.author ?? "";
    }
    if (next.assignee !== committed.assignee) {
      assignee = next.assignee ?? "";
    }
    if (next.label !== committed.label) {
      label = next.label ?? "";
    }
    committed = next;
  }

  function trimmed(value: string): string | undefined {
    const t = value.trim();
    return t ? t : undefined;
  }

  function commit() {
    const next: Omit<CobFilters, "q"> = {
      author: trimmed(author),
      assignee: trimmed(assignee),
      label: trimmed(label),
    };
    if (
      next.author === committed.author &&
      next.assignee === committed.assignee &&
      next.label === committed.label
    ) {
      return;
    }
    committed = { ...committed, ...next };
    dispatch("change", next);
  }
</script>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .filters > :global(*) {
    flex: 1;
    min-width: 14rem;
  }
</style>

<div class="filters">
  <TextInput
    placeholder="Author (did:key:… or node id)"
    showKeyHint={false}
    bind:value={author}
    on:submit={commit}
    on:blur={commit} />
  <TextInput
    placeholder="Assignee (did:key:… or node id)"
    showKeyHint={false}
    bind:value={assignee}
    on:submit={commit}
    on:blur={commit} />
  <TextInput
    placeholder="Label"
    showKeyHint={false}
    bind:value={label}
    on:submit={commit}
    on:blur={commit} />
</div>
