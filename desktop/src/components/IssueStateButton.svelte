<script lang="ts">
  import type { State } from "@bindings/cob/issue/State";

  import capitalize from "lodash/capitalize";
  import isEqual from "lodash/isEqual";

  import {
    issueStatusBackgroundColor,
    issueStatusColor,
    issueStatusIcon,
  } from "@app/lib/utils";

  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";

  interface Props {
    selectedState: State;
    onSelect: (selectedStatus: State) => void;
    disabled?: boolean;
  }

  const { selectedState, onSelect, disabled = false }: Props = $props();

  let popoverExpanded: boolean = $state(false);

  function label(state: State): string {
    return state.status === "closed"
      ? `${capitalize(state.status)} as ${state.reason}`
      : capitalize(state.status);
  }
</script>

<style>
  .status-button,
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .status-button {
    border: none;
    cursor: pointer;
  }
  .status-button:hover,
  .status-button.active {
    filter: brightness(0.95);
  }
</style>

{#if disabled}
  <span
    class="status-chip"
    style:color={issueStatusColor[selectedState.status]}
    style:background-color={issueStatusBackgroundColor[selectedState.status]}
    title="Only the issue author and delegates can change the issue state">
    <Icon name={issueStatusIcon[selectedState.status]} />
    <span>{label(selectedState)}</span>
  </span>
{:else}
  <Popover
    popoverPadding="0"
    placement="bottom-start"
    bind:expanded={popoverExpanded}>
    {#snippet toggle(onclick)}
      <button
        type="button"
        class="status-button"
        class:active={popoverExpanded}
        style:color={issueStatusColor[selectedState.status]}
        style:background-color={issueStatusBackgroundColor[
          selectedState.status
        ]}
        {onclick}>
        <Icon name={issueStatusIcon[selectedState.status]} />
        <span>{label(selectedState)}</span>
        <Icon name={popoverExpanded ? "chevron-up" : "chevron-down"} />
      </button>
    {/snippet}
    {#snippet popover()}
      <div
        style:border="1px solid var(--color-border-subtle)"
        style:border-radius="var(--border-radius-sm)"
        style:display="flex"
        style:gap="0.5rem"
        style:align-items="center"
        style:background-color="var(--color-surface-canvas)">
        <DropdownList
          items={[
            { status: "open" },
            { status: "closed", reason: "solved" },
            { status: "closed", reason: "other" },
          ] as State[]}>
          {#snippet item(state)}
            <DropdownListItem
              selected={isEqual(selectedState, state)}
              styleGap="0.5rem"
              onclick={() => {
                onSelect(state);
                closeFocused();
              }}>
              <span
                class="global-chip"
                style:padding="0"
                style:margin-left="-0.5rem"
                style:color={issueStatusColor[state.status]}
                style:background-color={issueStatusBackgroundColor[
                  state.status
                ]}>
                <Icon name={issueStatusIcon[state.status]} />
              </span>
              <span style:color="var(--color-text-secondary)">
                {label(state)}
              </span>
            </DropdownListItem>
          {/snippet}
        </DropdownList>
      </div>
    {/snippet}
  </Popover>
{/if}
