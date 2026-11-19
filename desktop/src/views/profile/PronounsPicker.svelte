<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    value: string;
    disabled?: boolean;
  }

  /* eslint-disable prefer-const */
  let { value = $bindable(""), disabled = false }: Props = $props();
  /* eslint-enable prefer-const */

  // The field is free text, so these are a shortcut past typing rather than
  // the answers allowed.
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

  // A value typed before is offered for editing, not retyped.
  $effect(() => {
    if (expanded) custom = common.includes(value) ? "" : value;
  });

  function pick(pronouns: string) {
    value = pronouns;
    closeFocused();
  }
</script>

<style>
  .control {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .control > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }
  .clear-icon {
    display: flex;
    color: var(--color-text-tertiary);
  }
  .trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
  }
  .trigger-value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .placeholder {
    flex: 1;
    color: var(--color-text-tertiary);
  }
  .panel {
    display: flex;
    flex-direction: column;
    width: 14rem;
    padding-top: 0.25rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .custom {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-top: 0.25rem;
    padding: 0.5rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .custom-label {
    color: var(--color-text-tertiary);
  }
</style>

<div class="control">
  <Popover
    popoverPadding="0"
    placement="bottom-start"
    styleDisplay="flex"
    bind:expanded>
    {#snippet toggle(onclick)}
      <Button
        variant="outline"
        bordered
        {onclick}
        {disabled}
        styleWidth="100%"
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
            <span class="txt-body-m-regular">{pronouns}</span>
          </DropdownListItem>
        {/each}

        <div class="custom">
          <span class="custom-label txt-body-s-regular">Something else</span>
          <TextInput
            bind:value={custom}
            placeholder="Write your own"
            styleHeight="1.75rem"
            onSubmit={() => {
              if (custom.trim()) pick(custom.trim());
            }} />
        </div>
      </div>
    {/snippet}
  </Popover>

  {#if value && !disabled}
    <Button variant="naked" title="Clear pronouns" onclick={() => (value = "")}>
      <span class="clear-icon"><Icon name="close" /></span>
    </Button>
  {/if}
</div>
