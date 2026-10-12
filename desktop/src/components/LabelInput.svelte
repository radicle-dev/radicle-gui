<script lang="ts">
  import { positionInputPopover } from "@app/lib/inputPopover";
  import { labelError } from "@app/lib/inputValidation";
  import { portal } from "@app/lib/portal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Label from "@app/components/Label.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    allowedToEdit: boolean;
    labels: string[];
    submitInProgress: boolean;
    save: (updatedLabels: string[]) => void;
    preview?: boolean;
  }

  const {
    allowedToEdit = false,
    labels,
    submitInProgress = false,
    save,
    preview = false,
  }: Props = $props();

  let updatedLabels: string[] = $state([]);
  let showInput: boolean = $state(false);
  let inputValue = $state("");
  const sanitizedValue = $derived(inputValue.trim());
  const validationMessage = $derived(labelError(inputValue, updatedLabels));
  const valid = $derived(validationMessage === undefined);

  let removeToggles: Record<string, boolean> = $state({});

  let anchorEl: HTMLDivElement | undefined = $state();
  let floatingEl: HTMLDivElement | undefined = $state();

  const panelVisible = $derived(showInput && validationMessage !== undefined);

  $effect(() => {
    if (!panelVisible || !floatingEl || !anchorEl) return;
    return positionInputPopover(anchorEl, floatingEl);
  });

  $effect(() => {
    // Reset component state whenever the labels change in the parent. This
    // happens when the issue ID changes for example when the user navigates
    // to a different issue via the sidebar.
    updatedLabels = labels;

    showInput = false;
    removeToggles = {};
  });

  function addLabel() {
    if (valid && sanitizedValue) {
      updatedLabels = [...updatedLabels, sanitizedValue].sort();
      inputValue = "";
      save($state.snapshot(updatedLabels));
      showInput = false;
    }
  }

  function removeLabel(label: string) {
    updatedLabels = updatedLabels.filter(x => x !== label);
    save($state.snapshot(updatedLabels));
    showInput = false;
  }
</script>

<style>
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .popover {
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    z-index: 400;
    max-width: 28rem;
    padding: 0.25rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .validation-message {
    padding: 0.375rem 0.5rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
  }
  .removable-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  button {
    border: 0;
    cursor: pointer;
    gap: 0.5rem;
    background-color: transparent;
    border: none;
    display: flex;
    color: var(--color-text-secondary);
    padding: 0;
    align-items: center;
  }
</style>

{#if preview}
  <div class="row">
    <Button variant="outline" disabled>
      <Icon name="label" />
      Add labels
    </Button>
    {#each updatedLabels as label}
      <Label {label} />
    {/each}
  </div>
{:else}
  <div class="row">
    {#if showInput}
      <div class="input-row">
        <div style:flex="1" style:min-width="0" bind:this={anchorEl}>
          <TextInput
            autofocus
            disabled={submitInProgress}
            placeholder="Add label"
            bind:value={inputValue}
            onSubmit={addLabel} />
        </div>
        {#if panelVisible}
          <div class="popover" bind:this={floatingEl} use:portal>
            <div class="validation-message">{validationMessage}</div>
          </div>
        {/if}
        <Button
          variant="outline"
          onclick={() => {
            showInput = false;
            inputValue = "";
          }}>
          <Icon name="close" />
        </Button>
      </div>
    {:else}
      <Button
        variant="outline"
        disabled={!allowedToEdit}
        title={allowedToEdit ? undefined : "Only delegates can add labels"}
        onclick={() => {
          inputValue = "";
          showInput = true;
        }}>
        <Icon name="label" />
        Add labels
      </Button>
    {/if}

    {#each updatedLabels as label}
      {#if allowedToEdit}
        <button
          class="removable-label"
          onclick={() => (removeToggles[label] = !removeToggles[label])}>
          <Label {label} />
          {#if removeToggles[label]}
            <Icon name="close" onclick={() => removeLabel(label)} />
          {/if}
        </button>
      {:else}
        <Label {label} />
      {/if}
    {/each}
  </div>
{/if}
