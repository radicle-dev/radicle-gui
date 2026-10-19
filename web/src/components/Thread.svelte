<script lang="ts">
  import type { Comment } from "@app/node/model";

  import CommentView from "./CommentView.svelte";
  import Composer from "./Composer.svelte";

  interface Props {
    rid: string;
    root: Comment;
    replies: Comment[];
    badgeFor?: (comment: Comment) => string | undefined;
    onReply: (body: string, replyTo: string) => void;
  }

  const { rid, root, replies, badgeFor, onReply }: Props = $props();
  let replying = $state(false);
</script>

<style>
  .thread {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .top {
    position: relative;
    z-index: 1;
  }
  .replies {
    position: relative;
    margin-left: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .replies::before {
    content: "";
    position: absolute;
    top: -0.5rem;
    height: calc(100% + 0.5rem);
    left: -0.75rem;
    width: 1px;
    background-color: var(--color-border-subtle);
  }
  .form {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    padding: 0.75rem;
  }
</style>

<div class="thread">
  <div class="top">
    <CommentView {rid} comment={root} badge={badgeFor?.(root)} onReply={() => (replying = true)} />
  </div>
  {#if replies.length > 0 || replying}
    <div class="replies">
      {#each replies as reply (reply.id)}
        <CommentView {rid} comment={reply} caption="replied" badge={badgeFor?.(reply)} />
      {/each}
      {#if replying}
        <div class="form">
          <Composer
            compact
            autofocus
            submitLabel="Reply"
            placeholder="Write a reply"
            onCancel={() => (replying = false)}
            onSubmit={body => {
              onReply(body, root.id);
              replying = false;
            }} />
        </div>
      {/if}
    </div>
  {/if}
</div>
