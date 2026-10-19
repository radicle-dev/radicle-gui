<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Comment } from "@app/node/model";

  import { fullDate, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Icon from "./Icon.svelte";
  import Markdown from "./Markdown.svelte";
  import PersonLink from "./PersonLink.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  interface Props {
    rid: string;
    comment: Comment;
    caption?: string;
    badge?: string;
    onReply?: () => void;
    bordered?: boolean;
    actions?: Snippet;
    // Comments whose reactions are stored elsewhere (descriptions) can't be
    // reacted to here.
    reactable?: boolean;
  }

  const {
    rid,
    comment,
    caption = "commented",
    badge,
    onReply,
    bordered = true,
    actions,
    reactable = true,
  }: Props = $props();

  const EMOJI = ["👍", "🎉", "❤️", "👀", "🚀", "😄", "🤔", "👎"];

  function react(emoji: string) {
    node.do({ type: "react", rid, comment: comment.id, emoji });
    closeFocused();
  }
</script>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }
  .card.bordered {
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
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0 0.375rem;
  }
  .resolved {
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
    font: var(--txt-body-s-regular);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.1s ease-in-out;
  }
  .card:is(:hover, :focus-within) .right {
    opacity: 1;
  }
  .icon-button {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.25rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .icon-button:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .body {
    padding: 0 0.75rem;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .reactions {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    padding: 0 0.75rem 0.25rem;
  }
  .reaction {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.5rem;
    padding: 0 0.375rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-regular);
    color: var(--color-text-secondary);
  }
  .reaction:hover {
    background-color: var(--color-surface-subtle);
  }
  .reaction.mine {
    border-color: var(--color-border-brand);
    color: var(--color-text-primary);
  }
  .picker {
    display: flex;
    gap: 0.125rem;
    padding: 0.25rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .picker button {
    all: unset;
    cursor: pointer;
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--border-radius-sm);
  }
  .picker button:hover {
    background: var(--color-surface-subtle);
  }
</style>

<div class="card" class:bordered id={`c-${comment.id}`}>
  <div class="header">
    <PersonLink person={comment.author} size="1rem" />
    <span class="caption">{caption}</span>
    {#if badge}<span class="badge">{badge}</span>{/if}
    <span class="caption" title={fullDate(comment.time)}>{timeAgo(comment.time)}</span>
    {#if comment.resolved}<span class="resolved">Resolved</span>{/if}
    <div class="right">
      {#if reactable}
        <Popover placement="top-end">
          {#snippet toggle(onclick)}
            <button class="icon-button" {onclick} title="React"><Icon name="add-emoji" /></button>
          {/snippet}
          {#snippet popover()}
            <div class="picker">
              {#each EMOJI as e (e)}<button onclick={() => react(e)}>{e}</button>{/each}
            </div>
          {/snippet}
        </Popover>
      {/if}
      {#if onReply}
        <button class="icon-button" onclick={onReply} title="Reply"><Icon name="reply" /></button>
      {/if}
      {@render actions?.()}
    </div>
  </div>
  <div class="body">
    {#if comment.body.trim()}
      <Markdown content={comment.body} compact />
    {:else}
      <span class="caption txt-body-m-regular">No description.</span>
    {/if}
  </div>
  {#if comment.reactions.length > 0}
    <div class="reactions">
      {#each comment.reactions as r (r.emoji)}
        <button
          class="reaction"
          class:mine={r.by.includes("self")}
          title={r.by.map(p => node.person(p).alias).join(", ")}
          onclick={() => react(r.emoji)}>
          {r.emoji} {r.by.length}
        </button>
      {/each}
    </div>
  {/if}
</div>
