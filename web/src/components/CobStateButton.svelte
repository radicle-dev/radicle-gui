<script lang="ts">
  import type { IssueState, PatchState } from "@app/node/model";

  import Icon from "./Icon.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  type State = IssueState | PatchState;

  interface Props {
    kind: "issue" | "patch";
    state: State;
    // States the viewer may switch to. Empty means read-only.
    options?: State[];
    onSelect?: (state: State) => void;
  }

  const { kind, state: value, options = [], onSelect }: Props = $props();

  let expanded = $state(false);

  function look(s: State) {
    if (kind === "issue") {
      return s === "open"
        ? { icon: "issue" as const, label: "Open", tone: "open" }
        : {
            icon: "issue-closed" as const,
            label: s === "solved" ? "Solved" : "Closed",
            tone: "closed",
          };
    }
    switch (s) {
      case "merged":
        return { icon: "patch-merged" as const, label: "Merged", tone: "merged" };
      case "draft":
        return { icon: "patch-draft" as const, label: "Draft", tone: "draft" };
      case "archived":
        return { icon: "patch-archived" as const, label: "Archived", tone: "archived" };
      default:
        return { icon: "patch" as const, label: "Open", tone: "open" };
    }
  }

  const current = $derived(look(value));
</script>

<style>
  .state {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: none;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    white-space: nowrap;
    flex-shrink: 0;
    color: var(--fg);
    background-color: var(--bg);
  }
  button.state {
    cursor: pointer;
  }
  button.state:hover,
  button.state.active {
    filter: brightness(0.95);
  }
  .swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--border-radius-sm);
    color: var(--fg);
    background-color: var(--bg);
  }
</style>

{#snippet chip(tag: "button" | "span", onclick?: () => void)}
  <svelte:element
    this={tag}
    class="state"
    class:active={expanded}
    style:--fg={`var(--color-text-${current.tone})`}
    style:--bg={`var(--color-surface-${current.tone})`}
    role={tag === "button" ? "button" : undefined}
    {onclick}>
    <Icon name={current.icon} />
    <span>{current.label}</span>
    {#if tag === "button"}<Icon name={expanded ? "chevron-up" : "chevron-down"} />{/if}
  </svelte:element>
{/snippet}

{#if options.length === 0 || !onSelect}
  {@render chip("span")}
{:else}
  <Popover placement="bottom-start" bind:expanded>
    {#snippet toggle(onclick)}
      {@render chip("button", onclick)}
    {/snippet}
    {#snippet popover()}
      <div class="popover-panel">
        {#each options as option (option)}
          {@const l = look(option)}
          <button
            class="popover-item"
            class:selected={option === value}
            onclick={() => {
              onSelect(option);
              closeFocused();
            }}>
            <span
              class="swatch"
              style:--fg={`var(--color-text-${l.tone})`}
              style:--bg={`var(--color-surface-${l.tone})`}>
              <Icon name={l.icon} />
            </span>
            {l.label}
            {#if option === value}<span style="margin-left: auto;"><Icon name="checkmark" /></span>{/if}
          </button>
        {/each}
      </div>
    {/snippet}
  </Popover>
{/if}
