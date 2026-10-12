<script lang="ts">
  import type { Reaction } from "@bindings/cob/Reaction";
  import type { Placement } from "@floating-ui/dom";

  import { twemoji } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  interface Props {
    reactions?: Reaction[];
    placement?: Placement;
    select: (reaction: Reaction) => Promise<void>;
  }

  const { reactions, placement, select }: Props = $props();

  const availableReactions = ["👍", "👎", "😄", "🎉", "🙁", "🚀", "👀"];
</script>

<style>
  .selector {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  button {
    cursor: pointer;
    border: 0;
    background: none;
    height: 1.5rem;
    border-radius: var(--border-radius-sm);
    margin: 0;
    font: var(--txt-body-m-regular);
    width: 2rem;
    height: 2rem;
  }

  button:hover,
  button.active {
    background-color: var(--color-surface-subtle);
  }
</style>

<Popover {placement} popoverPadding="0">
  {#snippet toggle(onclick)}
    <span class="global-icon-button" title="React">
      <Icon name="emoji" {onclick} />
    </span>
  {/snippet}
  {#snippet popover()}
    <div
      style:border="1px solid var(--color-border-subtle)"
      style:border-radius="var(--border-radius-md)"
      style:display="flex"
      style:gap="0.5rem"
      style:align-items="center"
      style:background-color="var(--color-surface-canvas)">
      <div class="selector">
        {#each availableReactions as reaction}
          {@const lookedUpReaction = reactions?.find(
            ({ emoji }) => emoji === reaction,
          )}
          <button
            use:twemoji={{ exclude: ["21a9"] }}
            class:active={Boolean(lookedUpReaction)}
            onclick={() =>
              select(lookedUpReaction || { emoji: reaction, authors: [] })}>
            {reaction}
          </button>
        {/each}
      </div>
    </div>
  {/snippet}
</Popover>
