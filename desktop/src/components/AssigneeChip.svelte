<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import { authorForNodeId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    assignee: Author;
    onRemove?: () => void;
  }

  const { assignee, onRemove = undefined }: Props = $props();
</script>

<style>
  .assignee {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .assignee:has(.remove) {
    padding-right: 0.125rem;
  }
  .remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.125rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0.7;
  }
  .remove:hover,
  .remove:focus-visible {
    opacity: 1;
  }
</style>

<div class="assignee">
  <NodeId {...authorForNodeId(assignee)} />
  {#if onRemove}
    <button
      type="button"
      class="remove"
      title="Remove"
      onclick={e => {
        e.stopPropagation();
        onRemove?.();
      }}>
      <Icon name="close" />
    </button>
  {/if}
</div>
