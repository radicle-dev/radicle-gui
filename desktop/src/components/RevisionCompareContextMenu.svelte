<script lang="ts">
  import type { RevisionRange } from "@app/lib/revisionCompare";
  import { compareRange, previousOption } from "@app/lib/revisionCompare";
  import { formatOid } from "@app/lib/utils";

  import ContextMenu from "@app/components/ContextMenu.svelte";

  interface Props extends RevisionRange {
    x: number;
    y: number;
    target?: HTMLElement;
    // Called with the commit to diff `head` against, or with nothing for the
    // revision's own base.
    onCompare: (from?: string) => void;
    onclose: () => void;
  }

  const { x, y, target, base, head, previous, onCompare, onclose }: Props =
    $props();

  const prev = $derived(previousOption({ base, head, previous }));
</script>

<style>
  .item {
    gap: 0.25rem;
  }
  .item.item:disabled {
    color: var(--color-text-disabled);
    cursor: not-allowed;
    background-color: transparent;
  }
  .previous-id {
    color: var(--color-text-brand);
  }
</style>

<!-- Opened from the revision picker, a popover. -->
<ContextMenu {x} {y} {target} {onclose} styleZIndex="500">
  <button
    class="menu-item item"
    role="menuitem"
    title={compareRange(base, head)}
    onclick={() => onCompare()}>
    Compare to base:
    <span class="txt-id">{formatOid(base)}</span>
  </button>
  {#if prev}
    <button
      class="menu-item item"
      role="menuitem"
      disabled={prev.disabled}
      title={prev.title}
      onclick={() => onCompare(prev.from)}>
      Compare to previous revision:
      <span class="txt-id previous-id">{formatOid(prev.id)}</span>
    </button>
  {/if}
</ContextMenu>
