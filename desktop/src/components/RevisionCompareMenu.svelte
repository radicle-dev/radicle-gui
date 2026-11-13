<script lang="ts">
  import type { RevisionRange } from "@app/lib/revisionCompare";
  import { compareRange, previousOption } from "@app/lib/revisionCompare";
  import { formatOid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";

  interface Props extends RevisionRange {
    // Called with the commit to diff `head` against, or with nothing for the
    // revision's own base.
    onCompare: (from?: string) => void;
  }

  const { base, head, previous, onCompare }: Props = $props();

  let expanded = $state(false);

  const prev = $derived(previousOption({ base, head, previous }));

  function compare(from?: string) {
    closeFocused();
    onCompare(from);
  }
</script>

<style>
  .item {
    display: flex;
    gap: 0.25rem;
  }
  .previous-id {
    color: var(--color-text-brand);
  }
</style>

<Popover placement="bottom-end" bind:expanded>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      active={expanded}
      title="Compare revision"
      onclick={e => {
        // The row around it toggles on click.
        e.stopPropagation();
        onclick();
      }}
      styleHeight="1.5rem"
      styleWidth="1.5rem"
      stylePadding="0"
      styleJustifyContent="center">
      <Icon name="ellipsis-vertical" />
    </Button>
  {/snippet}

  {#snippet popover()}
    <div
      style:border="1px solid var(--color-border-subtle)"
      style:border-radius="var(--border-radius-md)"
      style:background-color="var(--color-surface-canvas)"
      style:padding="0.25rem">
      <DropdownList items={prev ? ["base", "previous"] : ["base"]}>
        {#snippet item(entry)}
          {#if entry === "base"}
            <DropdownListItem
              selected={false}
              title={compareRange(base, head)}
              onclick={() => compare()}>
              <span class="item">
                Compare to base:
                <span class="txt-id">{formatOid(base)}</span>
              </span>
            </DropdownListItem>
          {:else if prev}
            <DropdownListItem
              selected={false}
              disabled={prev.disabled}
              title={prev.title}
              onclick={() => compare(prev.from)}>
              <span class="item">
                Compare to previous revision:
                <span class="txt-id previous-id">
                  {formatOid(prev.id)}
                </span>
              </span>
            </DropdownListItem>
          {/if}
        {/snippet}
      </DropdownList>
    </div>
  {/snippet}
</Popover>
