<script lang="ts">
  import { labelError } from "@app/lib/inputValidation";

  import MenuCheckItem from "@app/components/MenuCheckItem.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    labels: string[];
    suggestions: string[];
    save: (labels: string[]) => void;
  }

  const { labels, suggestions, save }: Props = $props();

  let selected: string[] = $derived([...labels]);
  let added: string[] = $state([]);
  let inputValue = $state("");

  const options = $derived(
    [...new Set([...suggestions, ...labels, ...added])].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
  const sanitizedValue = $derived(inputValue.trim());
  const valid = $derived(labelError(inputValue, selected) === undefined);

  function toggle(label: string) {
    selected = selected.includes(label)
      ? selected.filter(l => l !== label)
      : [...selected, label];
    save($state.snapshot(selected));
  }

  function addLabel() {
    if (!valid || !sanitizedValue) return;
    added = [...added, sanitizedValue];
    selected = [...selected, sanitizedValue];
    inputValue = "";
    save($state.snapshot(selected));
  }
</script>

<style>
  .input {
    padding: 0.25rem;
  }
  .empty {
    padding: 0.25rem 0.75rem 0.5rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
</style>

{#each options as label (label)}
  <MenuCheckItem
    checked={selected.includes(label)}
    {label}
    title={label}
    onclick={() => toggle(label)} />
{:else}
  <div class="empty">No labels yet</div>
{/each}
{#if options.length > 0}
  <div class="menu-separator"></div>
{/if}
<div class="input">
  <TextInput
    placeholder="New label"
    {valid}
    bind:value={inputValue}
    onSubmit={addLabel} />
</div>
