<script lang="ts">
  import type { Repo, Review, Revision } from "@app/node/model";

  import { fullDate, timeAgo } from "@app/lib/utils";

  import Icon from "./Icon.svelte";
  import Markdown from "./Markdown.svelte";
  import PersonLink from "./PersonLink.svelte";

  interface Props {
    repo: Repo;
    review: Review;
    revision: Revision;
    revisionNumber: number;
    revisionCount: number;
    onOpenChanges?: () => void;
  }

  const { repo, review, revision, revisionNumber, revisionCount, onOpenChanges }: Props = $props();

  const badge = $derived(
    review.verdict === "accept"
      ? { label: "Accepted", variant: "accept" }
      : review.verdict === "reject"
        ? { label: "Changes requested", variant: "reject" }
        : { label: "Commented", variant: "comment" },
  );

  function snippet(path: string, line: number): { n: number; text: string }[] {
    const content = repo.snapshots[revision.head]?.[path];
    if (!content) return [];
    const lines = content.split("\n");
    const start = Math.max(0, line - 3);
    return lines.slice(start, line).map((text, i) => ({ n: start + i + 1, text }));
  }
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
  .badge {
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-medium);
    white-space: nowrap;
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
  .view {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    margin-left: auto;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .view:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .body {
    padding: 0 0.75rem;
  }
  .code-comments {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 0.75rem 0.25rem;
  }
  .code-comment {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    overflow: hidden;
  }
  .where {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background-color: var(--color-surface-base);
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-code-small);
    color: var(--color-text-secondary);
  }
  .resolved {
    margin-left: auto;
    padding: 0.0625rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
    font: var(--txt-body-s-regular);
  }
  .snippet {
    font: var(--txt-code-small);
    background-color: var(--color-surface-base);
    border-bottom: 1px solid var(--color-border-subtle);
    overflow-x: auto;
    padding: 0.25rem 0;
  }
  .snippet div {
    display: flex;
    white-space: pre;
  }
  .snippet .n {
    width: 2.5rem;
    flex-shrink: 0;
    text-align: right;
    padding-right: 0.75rem;
    color: var(--color-text-quaternary);
  }
  .snippet .last {
    background: color-mix(in srgb, var(--color-feedback-warning-border) 14%, transparent);
  }
  .comment-body {
    padding: 0.5rem 0.625rem;
  }
</style>

<div class="review">
  <div class="header">
    <PersonLink person={review.author} size="1rem" />
    <span class="caption">reviewed</span>
    <span class={`badge ${badge.variant}`}>{badge.label}</span>
    {#if revisionCount > 1}<span class="caption">on revision {revisionNumber}</span>{/if}
    <span class="caption" title={fullDate(review.time)}>{timeAgo(review.time)}</span>
    {#if onOpenChanges && review.comments.length > 0}
      <button class="view" onclick={onOpenChanges}>View on changes <Icon name="chevron-right" /></button>
    {/if}
  </div>
  {#if review.summary.trim()}
    <div class="body"><Markdown content={review.summary} compact /></div>
  {/if}
  {#if review.comments.length > 0}
    <div class="code-comments">
      {#each review.comments as c (c.id)}
        {#if c.location}
          <div class="code-comment">
            <div class="where">
              <Icon name="document" />{c.location.path}<span class="caption">:{c.location.line}</span>
              {#if c.resolved}<span class="resolved">Resolved</span>{/if}
            </div>
            <div class="snippet">
              {#each snippet(c.location.path, c.location.line) as l (l.n)}
                <div class:last={l.n === c.location.line}><span class="n">{l.n}</span>{l.text}</div>
              {/each}
            </div>
            <div class="comment-body"><Markdown content={c.body} compact /></div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
