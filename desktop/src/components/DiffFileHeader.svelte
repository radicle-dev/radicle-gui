<script lang="ts">
  import type { DiffFileHeaderState } from "./diffFileHeaderState.svelte";

  import { fileStatusLabel } from "@app/lib/diffText";

  import Button from "@app/components/Button.svelte";
  import DiffActions from "@app/components/DiffActions.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Path from "@app/components/Path.svelte";

  interface Props {
    state: DiffFileHeaderState;
  }

  const { state }: Props = $props();

  const name = $derived(state.fileDiff?.name ?? "");
  const prevName = $derived(state.fileDiff?.prevName);
  const isRename = $derived(
    state.status === "moved" || state.status === "copied",
  );

  const stats = $derived.by(() => {
    let additions = 0;
    let deletions = 0;
    for (const hunk of state.fileDiff?.hunks ?? []) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
    return { additions, deletions };
  });

  const fileName = $derived(`${name.split("/").pop() || "file"}.diff`);
  const text = $derived(state.text);

  const statusLabel = $derived(state.status && fileStatusLabel(state.status));
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
    /* Pinned (not min-height): the diff virtualizer reserves a flat 2.5rem per
       file header (`diffHeaderHeight` in PierreDiff), so the real header must be
       exactly that height or a gap/overlap appears under it. Content is a single
       truncated line, so it always fits. */
    height: 2.5rem;
    padding: 0 0.5rem;
    font: var(--txt-body-m-regular);
  }
  /* Binary/empty marker matches the collapse Button's footprint so filenames
     stay column-aligned across all files. */
  .marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    line-height: 0;
    color: var(--color-text-secondary);
  }
  .marker :global(svg) {
    display: block;
  }
  .arrow {
    color: var(--color-text-secondary);
  }
  .status {
    padding: 0.125rem 0.5rem;
    border-radius: var(--border-radius-sm);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .status.added {
    color: var(--color-feedback-success-text);
    background-color: var(--color-feedback-success-bg);
  }
  .status.deleted {
    color: var(--color-feedback-error-text);
    background-color: var(--color-feedback-error-bg);
  }
  .status.moved,
  .status.copied {
    color: var(--color-text-secondary);
    background: var(--color-surface-subtle);
  }
  .stats {
    margin-left: auto;
    font: var(--txt-code-regular);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .comments {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    color: var(--color-text-secondary);
  }
  .add {
    color: var(--color-feedback-success-text);
  }
  .del {
    color: var(--color-feedback-error-text);
  }
</style>

<div class="header">
  {#if state.note === "binary"}
    <span class="marker" title="Binary file"><Icon name="binary" /></span>
  {:else if state.note === "empty"}
    <span class="marker" title="Empty file"><Icon name="none" /></span>
  {:else}
    <Button
      variant="naked"
      styleHeight="1.75rem"
      styleWidth="1.75rem"
      stylePadding="0"
      styleJustifyContent="center"
      title={state.collapsed ? "Expand file" : "Collapse file"}
      onclick={() => state.onToggleCollapse()}>
      <Icon name={state.collapsed ? "chevron-right" : "chevron-down"} />
    </Button>
  {/if}

  {#if isRename && prevName}
    <Path fullPath={prevName} />
    <span class="arrow">→</span>
    <Path fullPath={name} />
  {:else}
    <Path fullPath={name} />
  {/if}

  {#if statusLabel}
    <span class="status {state.status}">{statusLabel}</span>
  {/if}

  <span class="stats">
    {#if !state.note && stats.additions + stats.deletions > 0}
      <span class="add">+{stats.additions}</span>
      <span class="del">-{stats.deletions}</span>
    {/if}
  </span>

  {#if state.unresolvedComments > 0}
    <span class="comments" title="Unresolved comments">
      <Icon name="comment" />
      {state.unresolvedComments}
    </span>
  {/if}
  {#if state.resolvedComments > 0}
    <span class="comments" title="Resolved comments">
      <Icon name="comment-checkmark" />
      {state.resolvedComments}
    </span>
  {/if}

  {#if state.reviewed !== undefined}
    <Button
      variant="ghost"
      active={state.reviewed}
      bordered
      styleHeight="1.5rem"
      stylePadding="0 0.375rem"
      title={state.reviewed
        ? "Mark file as not reviewed"
        : "Mark file as reviewed"}
      onclick={() => state.onToggleReviewed()}>
      <Icon name={state.reviewed ? "checkmark" : "eye"} />
      {state.reviewed ? "Reviewed" : "Review"}
    </Button>
  {/if}

  {#if text !== undefined}
    <DiffActions {text} {fileName} title="File diff actions" />
  {/if}
</div>
