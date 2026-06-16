<script lang="ts">
  import { invoke } from "@app/lib/invoke";
  import { hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Label from "@app/components/Label.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    labels: string[];
    rid: string;
    save: (labels: string[]) => void;
  }

  const { labels, rid, save }: Props = $props();

  // Radicle has no project-level label registry, so suggestions are the labels
  // already used across this repo's issues and patches (fetched below). For an
  // empty project with no labels yet, fall back to a small bootstrap set. These
  // are single tokens because Radicle labels cannot contain whitespace.
  const BOOTSTRAP_LABELS = [
    "bug",
    "enhancement",
    "documentation",
    "question",
    "duplicate",
    "help-wanted",
    "good-first-issue",
    "wontfix",
  ];
  const HIDE_SUGGESTIONS_KEY = "hideLabelSuggestions";
  function loadSuggestionsHidden(): boolean {
    try {
      return localStorage.getItem(HIDE_SUGGESTIONS_KEY) === "true";
    } catch {
      return false;
    }
  }

  // The modal edits a local copy seeded from the current labels.
  // svelte-ignore state_referenced_locally
  let working: string[] = $state([...labels]);
  let repoLabels: string[] = $state([]);
  let loadingSuggestions = $state(true);
  let suggestionsHidden = $state(loadSuggestionsHidden());
  let inputValue = $state("");
  const sanitized = $derived(inputValue.trim());
  const duplicate = $derived(sanitized !== "" && working.includes(sanitized));
  const suggestions = $derived(
    (repoLabels.length > 0 ? repoLabels : BOOTSTRAP_LABELS).filter(
      l => !working.includes(l),
    ),
  );

  $effect(() => {
    invoke<string[]>("list_repo_labels", { rid })
      .then(labels => {
        repoLabels = labels;
      })
      .catch(error => console.error("Loading repo labels failed", error))
      .finally(() => (loadingSuggestions = false));
  });

  function add() {
    if (sanitized === "" || duplicate) return;
    working = [...working, sanitized].sort();
    inputValue = "";
  }
  function addLabel(label: string) {
    if (working.includes(label)) return;
    working = [...working, label].sort();
  }
  function remove(label: string) {
    working = working.filter(l => l !== label);
  }
  function dismissSuggestions() {
    suggestionsHidden = true;
    try {
      localStorage.setItem(HIDE_SUGGESTIONS_KEY, "true");
    } catch {
      // Ignore storage failures; suggestions just won't stay hidden.
    }
  }
</script>

<style>
  .modal {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 26rem;
    max-width: 90vw;
    padding: 1.5rem;
    background-color: var(--color-surface-canvas);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-medium);
  }
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
  .icon-badge {
    display: flex;
    color: var(--color-text-brand);
  }
  .title {
    color: var(--color-text-primary);
    text-align: center;
  }
  .add-row {
    display: flex;
    gap: 0.5rem;
  }
  .add-row > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }
  .hint {
    margin-top: -1rem;
    color: var(--color-feedback-error-text);
  }
  .list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .empty {
    color: var(--color-text-tertiary);
  }
  .suggestions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .suggestions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .suggestions-title {
    color: var(--color-text-secondary);
  }
  .dismiss-all {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-quaternary);
    cursor: pointer;
  }
  .dismiss-all:hover,
  .dismiss-all:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .suggestion-add {
    display: inline-flex;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>

<div class="modal">
  <div class="header">
    <div class="icon-badge"><Icon name="label" size="32" /></div>
    <div class="title txt-heading-m">Labels</div>
  </div>
  <div class="add-row">
    <TextInput
      autofocus
      valid={!duplicate}
      placeholder="Add a label"
      bind:value={inputValue}
      onSubmit={add}
      onDismiss={() => hide()} />
    <Button
      variant="secondary"
      disabled={sanitized === "" || duplicate}
      onclick={add}>
      Add
    </Button>
  </div>
  {#if duplicate}
    <div class="hint txt-body-s-regular">This label is already added.</div>
  {/if}
  {#if !loadingSuggestions && !suggestionsHidden && suggestions.length > 0}
    <div class="suggestions">
      <div class="suggestions-header">
        <div class="suggestions-title txt-body-s-regular">Suggestions</div>
        <button
          type="button"
          class="dismiss-all"
          title="Dismiss suggestions"
          onclick={dismissSuggestions}>
          <Icon name="close" />
        </button>
      </div>
      <div class="list">
        {#each suggestions as label (label)}
          <button
            type="button"
            class="suggestion-add"
            title="Add this label"
            onclick={() => addLabel(label)}>
            <Label {label} styleHeight="2rem" />
          </button>
        {/each}
      </div>
    </div>
  {/if}
  <div class="list">
    {#if working.length === 0}
      <span class="empty txt-body-m-regular">No labels yet.</span>
    {:else}
      {#each working as label (label)}
        <Label {label} onRemove={() => remove(label)} styleHeight="2rem" />
      {/each}
    {/if}
  </div>
  <div class="actions">
    <Button variant="naked" onclick={() => hide()}>Cancel</Button>
    <Button
      variant="secondary"
      onclick={() => {
        save([...working]);
        hide();
      }}>
      Save
    </Button>
  </div>
</div>
