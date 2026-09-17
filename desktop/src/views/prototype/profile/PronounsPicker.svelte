<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    value: string;
  }

  let { value = $bindable("") }: Props = $props();

  // The spec is explicit that this field is free text and never an
  // enumeration, so the list is a shortcut past typing rather than the set of
  // allowed answers.
  const common = [
    "he/him",
    "she/her",
    "they/them",
    "he/they",
    "she/they",
    "any pronouns",
  ];

  let expanded = $state(false);
  let custom = $state("");

  function pick(pronouns: string) {
    value = pronouns;
    custom = "";
    closeFocused();
  }

  function useCustom() {
    if (custom.trim()) pick(custom.trim());
  }
</script>

<style>
  .trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .trigger-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .placeholder {
    color: var(--color-text-tertiary);
  }
  .panel {
    display: flex;
    flex-direction: column;
    width: 14rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
  }
  .custom {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .custom-label {
    color: var(--color-text-tertiary);
  }
  .clear {
    padding: 0.25rem;
    border-top: 1px solid var(--color-border-subtle);
  }
</style>

<Popover popoverPadding="0" placement="bottom-start" bind:expanded>
  {#snippet toggle(onclick)}
    <Button
      variant="outline"
      bordered
      {onclick}
      styleJustifyContent="flex-start">
      <span class="trigger">
        {#if value}
          <span class="trigger-value">{value}</span>
        {:else}
          <span class="placeholder">Not set</span>
        {/if}
        <Icon name={expanded ? "chevron-up" : "chevron-down"} />
      </span>
    </Button>
  {/snippet}

  {#snippet popover()}
    <div class="panel">
      {#each common as pronouns (pronouns)}
        <DropdownListItem
          styleWidth="100%"
          selected={value === pronouns}
          onclick={() => pick(pronouns)}>
          <span class="row txt-body-m-regular">{pronouns}</span>
        </DropdownListItem>
      {/each}

      <div class="custom">
        <span class="custom-label txt-body-s-regular">Something else</span>
        <TextInput
          bind:value={custom}
          placeholder="Write your own"
          styleHeight="1.75rem"
          onSubmit={useCustom} />
      </div>

      {#if value}
        <div class="clear">
          <DropdownListItem
            styleWidth="100%"
            selected={false}
            onclick={() => pick("")}>
            <span class="row txt-body-m-regular">
              <Icon name="close" />
              Clear
            </span>
          </DropdownListItem>
        </div>
      {/if}
    </div>
  {/snippet}
</Popover>
