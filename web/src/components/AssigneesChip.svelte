<script lang="ts">
  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";

  interface Props {
    assignees: string[];
    candidates: string[];
    editable?: boolean;
    onSave?: (assignees: string[]) => void;
  }

  const { assignees, candidates, editable = false, onSave }: Props = $props();

  const options = $derived([...new Set([...candidates, ...assignees])]);

  function flip(p: string) {
    onSave?.(assignees.includes(p) ? assignees.filter(a => a !== p) : [...assignees, p]);
  }
</script>

<style>
  .people {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>

{#snippet content()}
  <Icon name="avatar-incognito" />
  {#if assignees.length === 0}
    <span>{editable ? "Assign" : "No assignees"}</span>
  {:else}
    <span class="people">
      {#each assignees as a (a)}
        <Avatar person={a} size="1rem" />
        <span style="color: var(--color-text-secondary)">{node.person(a).alias}</span>
      {/each}
    </span>
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
        {#each options as p (p)}
          <button class="popover-item" onclick={() => flip(p)}>
            <span style:width="1rem" style:display="inline-flex">
              {#if assignees.includes(p)}<Icon name="checkmark" />{/if}
            </span>
            <Avatar person={p} size="1.125rem" />
            {node.person(p).alias}
            {#if p === "self"}<span class="caption">(you)</span>{/if}
          </button>
        {/each}
      </div>
    {/snippet}
  </Popover>
{/if}
