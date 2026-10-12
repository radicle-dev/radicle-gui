<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
  import type { Comment } from "@bindings/cob/thread/Comment";
  import type { Thread } from "@bindings/cob/thread/Thread";

  import type { Resolution } from "@app/lib/commentResolutions";
  import { plainText } from "@app/lib/markdownPlain";
  import type { CommentAnchor } from "@app/lib/pierreComments";
  import { anchorOf, formatAnchorLines } from "@app/lib/pierreComments";
  import {
    formatResolvedCaption,
    publicKeyFromDid,
    truncateId,
  } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Path from "@app/components/Path.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    /// Threads grouped per file, in the order the files appear in the diff, so
    /// the column reads top to bottom alongside it.
    groups: { path: string; threads: Thread<CodeLocation>[] }[];
    /// The comment the diff is currently pointing at, so the row that sent it
    /// there stays marked while you look. A comment, not a thread: a reply and
    /// its root scroll to the same place, but marking both would say the click
    /// landed somewhere it did not.
    selectedId?: string;
    onSelect: (commentId: string, anchor: CommentAnchor | undefined) => void;
    // Who resolved a comment, for the checkmark to name — the same tooltip the
    // `Resolved` badge in the diff carries.
    resolvedBy?: (commentId: string) => Resolution | undefined;
  }

  const { groups, selectedId, onSelect, resolvedBy }: Props = $props();

  function resolvedTitle(commentId: string): string {
    const resolution = resolvedBy?.(commentId);
    return resolution
      ? formatResolvedCaption(resolution.author, resolution.timestamp)
      : "Marked as resolved";
  }

  /// `NodeId` would be the obvious thing here, but it carries a popover — and
  /// therefore a button — which cannot live inside the button each card already
  /// is. The avatar and the alias are the parts that matter at this size.
  function authorKey(author: Author): string {
    return publicKeyFromDid(author.did);
  }
  function authorName(author: Author): string {
    return author.alias ?? truncateId(authorKey(author));
  }

  /// The last edit is the current text.
  function preview(comment: Comment<CodeLocation>): string {
    return plainText(comment.edits.at(-1)?.body ?? "");
  }
</script>

<style>
  /* Pinned to the top of the column, so a long list still says which file you
     are in. The count that used to sit above it is in the bar over both columns
     now, outside this component. */
  .file {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.75rem 0.5rem 0.375rem;
    background-color: var(--color-surface-canvas);
    color: var(--color-text-secondary);
  }
  /* `Path` dims the directory and leaves the filename alone, which is the half
     that tells these apart — the prefix is the same for most of a review. */
  .file :global(.container) {
    font: var(--txt-body-s-regular);
  }
  /* Each comment is its own surface. Separating them with whitespace alone left
     a wall of similar lines; a card gives every comment an edge to read from. */
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: calc(100% - 1rem);
    /* One gutter all round, so the gap below the last card matches the sides. */
    margin: 0 0.5rem 0.5rem;
    padding: 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    cursor: pointer;
    text-align: left;
  }
  /* The chip sits at `mid`, between the card at rest and this, so it stays
     legible either way. */
  .card:hover,
  .card:focus-visible {
    background-color: var(--color-surface-strong);
  }
  .card.selected {
    background-color: var(--color-surface-strong);
    box-shadow: inset 2px 0 0 0 var(--color-border-brand);
  }
  /* Indented rather than marked: a glyph on every reply turns a long thread into
     noise, and the author line already says who is speaking. */
  .card.reply {
    width: calc(100% - 1.75rem);
    margin-left: 1.25rem;
  }
  .byline {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    font: var(--txt-body-s-regular);
  }
  .author {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
  }
  .caption {
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  /* Shaped like the chip the comment itself puts its anchor in, but quieter: in
     the diff it labels one thing, whereas here it repeats on every card and the
     comment is what should be read first. */
  .line {
    flex-shrink: 0;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    height: 1.25rem;
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-quaternary);
    font: var(--txt-code-small);
  }
  .resolved-mark {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    color: var(--color-feedback-success-text);
  }
  /* Two lines: enough for a comment to say what it is about, while keeping the
     column scannable. */
  .body {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font: var(--txt-body-m-regular);
    /* A step down from the diff it sits beside: the column is for finding your
       way to a comment, not for reading it. */
    color: var(--color-text-secondary);
  }
  /* A resolved comment is something you have already dealt with, so the whole
     row steps back — author and avatar included, since a column of full-strength
     names reads as a column of things still to do. The checkmark keeps its
     colour: it is the one part that says why the rest is quiet. */
  .card.resolved .author {
    color: var(--color-text-tertiary);
  }
  .card.resolved .caption,
  .card.resolved .body {
    color: var(--color-text-quaternary);
  }
  .card.resolved .line {
    opacity: 0.6;
  }
  /* `UserAvatar` is a generated image, so there is no colour to step down. */
  .card.resolved :global(img) {
    opacity: 0.5;
  }
</style>

<div style:display="flex" style:flex-direction="column" style:width="100%">
  {#each groups as group (group.path)}
    <div class="file" title={group.path}><Path fullPath={group.path} /></div>
    {#each group.threads as thread (thread.root.id)}
      {@const anchor = anchorOf(thread.root.location)}
      {@const isResolved = thread.root.resolved === true}
      {@const lines =
        thread.root.location && formatAnchorLines(thread.root.location)}
      <button
        type="button"
        class="card"
        class:resolved={isResolved}
        class:selected={selectedId === thread.root.id}
        onclick={() => onSelect(thread.root.id, anchor)}>
        <span class="byline">
          <UserAvatar
            nodeId={authorKey(thread.root.author)}
            styleWidth="1rem" />
          <span class="author">{authorName(thread.root.author)}</span>
          <span class="caption">commented</span>
          {#if isResolved}
            <span class="resolved-mark" title={resolvedTitle(thread.root.id)}>
              <Icon name="checkmark" />
            </span>
          {/if}
          {#if lines}
            <span class="line">{lines}</span>
          {/if}
        </span>
        <span class="body">{preview(thread.root)}</span>
      </button>
      {#each thread.replies as reply (reply.id)}
        <!-- A reply shares its root's line, so this scrolls to the same place —
             it is here to read the conversation, not to reach somewhere new. -->
        <button
          type="button"
          class="card reply"
          class:resolved={isResolved}
          class:selected={selectedId === reply.id}
          onclick={() => onSelect(reply.id, anchor)}>
          <span class="byline">
            <UserAvatar nodeId={authorKey(reply.author)} styleWidth="1rem" />
            <span class="author">{authorName(reply.author)}</span>
            <span class="caption">replied</span>
          </span>
          <span class="body">{preview(reply)}</span>
        </button>
      {/each}
    {/each}
  {/each}
</div>
