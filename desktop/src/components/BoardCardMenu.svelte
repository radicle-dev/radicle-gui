<script lang="ts">
  import type { Column } from "@bindings/cob/board/Column";

  import type { BoardItem, Priority } from "@app/lib/board";
  import { itemLabels, PRIORITIES, priorityOf } from "@app/lib/board";

  import ContextMenu from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";
  import PriorityIcon from "@app/components/PriorityIcon.svelte";

  interface Props {
    item: BoardItem;
    x: number;
    y: number;
    target: HTMLElement;
    targets: Column[];
    canRemove: boolean;
    canPrioritize: boolean;
    onMove: (column: string) => void;
    onRemove: () => void;
    onPriority: (priority: Priority) => void;
    onclose: () => void;
  }

  const {
    item,
    x,
    y,
    target,
    targets,
    canRemove,
    canPrioritize,
    onMove,
    onRemove,
    onPriority,
    onclose,
  }: Props = $props();

  const showMove = $derived(targets.length > 0);

  const currentPriority = $derived(priorityOf(itemLabels(item)));
</script>

<style>
  .check {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .menu-heading {
    padding: 0.25rem 0.75rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
</style>

<ContextMenu {x} {y} {target} {onclose}>
  {#if showMove}
    <div class="menu-heading">Move to</div>
    {#each targets as column (column.id)}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => {
          onMove(column.id);
          onclose();
        }}>
        {column.name}
        {#if item.column === column.id}
          <span class="check"><Icon name="checkmark" /></span>
        {/if}
      </button>
    {/each}
  {/if}
  {#if canRemove}
    {#if showMove}
      <div class="menu-separator"></div>
    {/if}
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => {
        onRemove();
        onclose();
      }}>
      <Icon name="trash" />Remove from board
    </button>
  {/if}
  {#if canPrioritize}
    {#if showMove || canRemove}
      <div class="menu-separator"></div>
    {/if}
    <div class="menu-heading">Priority</div>
    {#each PRIORITIES as priority (priority.id)}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => {
          onPriority(priority.id);
          onclose();
        }}>
        <PriorityIcon priority={priority.id} />
        {priority.label}
        {#if currentPriority === priority.id}
          <span class="check"><Icon name="checkmark" /></span>
        {/if}
      </button>
    {/each}
  {/if}
</ContextMenu>
