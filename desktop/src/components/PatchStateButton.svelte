<script lang="ts">
  import type { State } from "@bindings/cob/patch/State";

  import capitalize from "lodash/capitalize";

  import { patchStatusBackgroundColor, patchStatusColor } from "@app/lib/utils";

  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";

  interface Props {
    selectedState: State;
    onSelect: (newState: State) => void;
    disabled?: boolean;
  }

  const { selectedState, onSelect, disabled = false }: Props = $props();

  let popoverExpanded: boolean = $state(false);
  const isStatic = $derived(selectedState.status === "merged" || disabled);
</script>

<style>
  .status-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: none;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .status-button:hover:not(:disabled),
  .status-button.active {
    filter: brightness(0.95);
  }
  .status-button:disabled {
    cursor: default;
  }
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
  }
</style>

{#if isStatic}
  <span
    class="status-chip"
    style:color={patchStatusColor[selectedState.status]}
    style:background-color={patchStatusBackgroundColor[selectedState.status]}
    title={selectedState.status === "merged"
      ? "The state of merged patches can not be changed"
      : "Only delegates and the patch author can change the patch state"}>
    <Icon
      name={selectedState.status === "open"
        ? "patch"
        : `patch-${selectedState.status}`} />
    <span>{capitalize(selectedState.status)}</span>
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
        style:color={patchStatusColor[selectedState.status]}
        style:background-color={patchStatusBackgroundColor[
          selectedState.status
        ]}
        {onclick}>
        <Icon
          name={selectedState.status === "open"
            ? "patch"
            : `patch-${selectedState.status}`} />
        <span>{capitalize(selectedState.status)}</span>
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
            { status: "draft" },
            { status: "archived" },
          ] as State[]}>
          {#snippet item(state)}
            <DropdownListItem
              selected={selectedState.status === state.status}
              styleGap="0.5rem"
              onclick={() => {
                onSelect(state);
                closeFocused();
              }}>
              <span
                class="global-chip"
                style:padding="0"
                style:margin-left="-0.5rem"
                style:color={patchStatusColor[state.status]}
                style:background-color={patchStatusBackgroundColor[
                  state.status
                ]}>
                <Icon
                  name={state.status === "open"
                    ? "patch"
                    : `patch-${state.status}`} />
              </span>
              <span style:color="var(--color-text-secondary)">
                {capitalize(state.status)}
              </span>
            </DropdownListItem>
          {/snippet}
        </DropdownList>
      </div>
    {/snippet}
  </Popover>
{/if}
