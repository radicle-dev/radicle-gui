<script lang="ts">
  import Icon from "./Icon.svelte";
  import LabelChip from "./LabelChip.svelte";
  import Popover from "./Popover.svelte";

  interface Props {
    labels: string[];
    known: string[];
    editable?: boolean;
    onSave?: (labels: string[]) => void;
  }

  const { labels, known, editable = false, onSave }: Props = $props();

  let custom = $state("");
  const options = $derived([...new Set([...known, ...labels])].sort());

  function flip(label: string) {
    onSave?.(labels.includes(label) ? labels.filter(l => l !== label) : [...labels, label]);
  }
</script>

<style>
  .labels {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
  }
  .add {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border-top: 1px solid var(--color-border-subtle);
    margin-top: 0.25rem;
  }
</style>

{#snippet content()}
  <Icon name="label" />
  {#if labels.length === 0}
    <span>{editable ? "Add labels" : "No labels"}</span>
  {:else}
    <span class="labels">{#each labels as l (l)}<LabelChip label={l} />{/each}</span>
  {/if}
{/snippet}

{#if !editable}
  <span class="chip">{@render content()}</span>
{:else}
  <Popover placement="bottom-start">
    {#snippet toggle(onclick)}
      <button class="chip" {onclick}>{@render content()}</button>
    {/snippet}
    {#snippet popover()}
      <div class="popover-panel">
        {#each options as option (option)}
          <button class="popover-item" onclick={() => flip(option)}>
            <span style:width="1rem" style:display="inline-flex">
              {#if labels.includes(option)}<Icon name="checkmark" />{/if}
            </span>
            <LabelChip label={option} />
          </button>
        {/each}
        <div class="add">
          <input
            class="input"
            style="height: 1.75rem;"
            placeholder="New label"
            bind:value={custom}
            onkeydown={e => {
              if (e.key === "Enter" && custom.trim()) {
                onSave?.([...labels, custom.trim()]);
                custom = "";
              }
            }} />
        </div>
      </div>
    {/snippet}
  </Popover>
{/if}
