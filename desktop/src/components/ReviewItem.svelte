<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Verdict } from "@bindings/cob/patch/Verdict";

  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
    verdictBadge,
  } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    rid: string;
    author: Author;
    verdict?: Verdict;
    summary: string;
    timestamp: number;
    onViewFullReview?: () => void;
    toggleTaskItem?: (summary: string) => Promise<void>;
  }

  const {
    rid,
    author,
    verdict,
    summary,
    timestamp,
    onViewFullReview,
    toggleTaskItem,
  }: Props = $props();

  const badge = $derived(verdictBadge(verdict));
</script>

<style>
  .review {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0;
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0 0.75rem;
    min-height: 1.5rem;
    font: var(--txt-body-m-regular);
  }
  .caption,
  .timestamp {
    color: var(--color-text-quaternary);
  }
  .badge {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
  }
  .badge.accept {
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .badge.reject {
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
  .badge.comment {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .view-full {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    margin-left: auto;
    padding: 0.125rem 0.375rem;
    border: 1px solid transparent;
    border-radius: var(--border-radius-sm);
    background: none;
    font: inherit;
    color: var(--color-text-secondary);
    white-space: nowrap;
    cursor: pointer;
  }
  .view-full:hover,
  .view-full:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .body {
    padding: 0 0.75rem;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
</style>

<div class="review">
  <div class="header">
    <NodeId {...authorForNodeId(author)} />
    <span class="caption">reviewed</span>
    <span class="badge {badge.variant} txt-body-s-medium">{badge.label}</span>
    <span class="timestamp" title={absoluteTimestamp(timestamp)}>
      {formatTimestamp(timestamp)}
    </span>
    {#if onViewFullReview}
      <button type="button" class="view-full" onclick={onViewFullReview}>
        View full review
        <Icon name="chevron-right" />
      </button>
    {/if}
  </div>
  {#if summary.trim() !== ""}
    <div class="body txt-body-m-regular">
      <Markdown {rid} breaks content={summary} {toggleTaskItem} />
    </div>
  {/if}
</div>
