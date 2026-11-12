<script lang="ts">
  import { formatOid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";

  interface Props {
    base: string;
    head: string;
    // The revision before this one, absent for the first.
    previous?: { id: string; base: string; head: string };
    // Called with the commit to diff `head` against, or with nothing for the
    // revision's own base.
    onCompare: (from?: string) => void;
  }

  const { base, head, previous, onCompare }: Props = $props();

  let expanded = $state(false);

  // Diffing two heads on different bases would mix in every change between the
  // bases, so the previous revision is only offered on the same base.
  const baseMoved = $derived(previous !== undefined && previous.base !== base);

  // Nothing changed between two revisions on the same commit.
  const sameHead = $derived(previous?.head === head);

  const range = (from: string) => `${formatOid(from)}..${formatOid(head)}`;

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
      <DropdownList items={previous ? ["base", "previous"] : ["base"]}>
        {#snippet item(entry)}
          {#if entry === "base"}
            <DropdownListItem
              selected={false}
              title={range(base)}
              onclick={() => compare()}>
              <span class="item">
                Compare to base:
                <span class="txt-id">{formatOid(base)}</span>
              </span>
            </DropdownListItem>
          {:else if previous}
            <DropdownListItem
              selected={false}
              disabled={baseMoved || sameHead}
              title={baseMoved
                ? "Previous revision has different base"
                : sameHead
                  ? "Same commit as the previous revision"
                  : range(previous.head)}
              onclick={() =>
                // An empty previous revision's head is this one's base.
                compare(previous.head === base ? undefined : previous.head)}>
              <span class="item">
                Compare to previous revision:
                <span class="txt-id previous-id">
                  {formatOid(previous.id)}
                </span>
              </span>
            </DropdownListItem>
          {/if}
        {/snippet}
      </DropdownList>
    </div>
  {/snippet}
</Popover>
