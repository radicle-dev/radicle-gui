<script lang="ts">
  import type { BaseUrl, Comment } from "@http-client";

  import CommentComponent from "@app/components/Comment.svelte";
  import Icon from "./Icon.svelte";

  export let thread: {
    root: Comment;
    replies: Comment[];
  };
  export let rawPath: string;
  export let baseUrl: BaseUrl;

  $: root = thread.root;
  $: replies = thread.replies;
</script>

<style>
  .comments {
    display: flex;
    flex-direction: column;
    box-shadow: 0 0 0 1px var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .top-level-comment {
    background-color: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
  }
  .has-replies {
    border-bottom: 1px solid var(--color-border-subtle);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .replies {
    margin-left: 1.25rem;
  }
  @media (max-width: 719.98px) {
    .comments {
      border-radius: 0;
    }
  }
</style>

<div class="comments">
  <div class="top-level-comment" class:has-replies={replies.length > 0}>
    <CommentComponent
      {baseUrl}
      {rawPath}
      id={root.id}
      lastEdit={root.edits.length > 1 ? root.edits.at(-1) : undefined}
      authorId={root.author.id}
      authorAlias={root.author.alias}
      location={root.location}
      reactions={root.reactions}
      timestamp={root.timestamp}
      body={root.body}>
      <Icon name="comment" slot="icon" />
    </CommentComponent>
  </div>
  {#if replies.length > 0}
    <div class="replies">
      {#each replies as reply}
        <CommentComponent
          {baseUrl}
          {rawPath}
          lastEdit={reply.edits.length > 1 ? reply.edits.at(-1) : undefined}
          id={reply.id}
          authorId={reply.author.id}
          authorAlias={reply.author.alias}
          caption="replied"
          isReply
          isLastReply={replies[replies.length - 1] === reply}
          reactions={reply.reactions}
          timestamp={reply.timestamp}
          body={reply.body} />
      {/each}
    </div>
  {/if}
</div>
