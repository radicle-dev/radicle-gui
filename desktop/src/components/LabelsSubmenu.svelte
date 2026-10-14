<script lang="ts">
  import { labelError } from "@app/lib/inputValidation";

  import Icon from "@app/components/Icon.svelte";
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
      : [...selected, label].sort();
    save($state.snapshot(selected));
  }

  function addLabel() {
    if (!valid || !sanitizedValue) return;
    added = [...added, sanitizedValue];
    selected = [...selected, sanitizedValue].sort();
    inputValue = "";
    save($state.snapshot(selected));
  }
</script>

<style>
  .check {
    display: inline-flex;
    width: 1rem;
    flex-shrink: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
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
  {@const checked = selected.includes(label)}
  <button
    type="button"
    class="menu-item"
    role="menuitemcheckbox"
    aria-checked={checked}
    title={label}
    onclick={() => toggle(label)}>
    <span class="check">
      {#if checked}
        <Icon name="checkmark" />
      {/if}
    </span>
    <span class="name">{label}</span>
  </button>
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
