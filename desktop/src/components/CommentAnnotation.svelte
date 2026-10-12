<script lang="ts">
  import type { CommentAnnotationState } from "./commentAnnotationState.svelte";
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
  import type { Thread } from "@bindings/cob/thread/Thread";

  import partial from "lodash/partial";

  import {
    formatAnchor,
    formatAnchorLines,
    locationOf,
  } from "@app/lib/pierreComments";
  import * as roles from "@app/lib/roles";

  import CommentToggleInput from "@app/components/CommentToggleInput.svelte";
  import ThreadComponent from "@app/components/Thread.svelte";

  interface Props {
    state: CommentAnnotationState;
  }

  const { state }: Props = $props();

  const threads = $derived(state.annotation?.threads ?? []);
  const composer = $derived(state.annotation?.composer);

  // Which lines the comment is about. A thread sits under the last line it
  // covers, which says nothing about where it starts and little about which line
  // it means once there is a comment or two between it and the code — so it is
  // always spelled out. The file only comes along where the surrounding context
  // does not already give it.
  function anchorLabel(thread: Thread<CodeLocation>): string | undefined {
    const location = thread.root.location;
    if (!location) return undefined;
    return state.comments?.hideThreadFileHeader
      ? formatAnchorLines(location)
      : formatAnchor(location);
  }
</script>

<style>
  .annotation {
    display: flex;
    flex-direction: column;
    font: var(--txt-body-m-regular);
    /* The row Pierre reserves for an annotation is measured from this content,
       so the box has to carry its own spacing rather than relying on the
       surrounding diff — including the inset that keeps the comment's border off
       the edges of the file it sits in. */
    padding: 0.75rem;
    /* Code lines are `pre`-formatted; comments are prose. */
    white-space: normal;
    text-align: left;
  }
  .thread + .thread,
  .thread + .composer {
    margin-top: 0.5rem;
  }
  /* Sits among the captions on the authorship line, so it reads as part of the
     sentence — "commented on R94-R100 6d" — rather than as a heading over the
     comment. */
  .thread-anchor {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-quaternary);
  }
  /* The verdict badge's padding and radius (see `ReviewItem`), so the chips along
     a comment's authorship line are all the one size. No fixed height: the text's
     own line box plus that padding is what sets it, which is how the badge is
     built and what keeps the two the same. */
  .thread-anchor-lines {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-strong);
    color: var(--color-text-secondary);
    font: var(--txt-code-small);
  }
  .composer {
    background-color: var(--color-surface-base);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
  }
</style>

<div class="annotation">
  {#each threads as thread (thread.root.id)}
    {#if state.comments}
      {@const comments = state.comments}
      {@const isDraftThread =
        comments.draftThreadIds?.includes(thread.root.id) ?? false}
      {@const anchor = anchorLabel(thread)}
      <!-- Anchors "jump to this comment" from the draft review bar. Hovering it
           tints the lines it refers to; they are in the diff's shadow root, so
           the host has to do the painting. -->
      <div
        class="thread"
        role="group"
        data-thread-id={thread.root.id}
        onmouseenter={() => state.onHoverThread(thread.root.id)}
        onmouseleave={() => state.onHoverThread(undefined)}>
        <ThreadComponent
          rid={comments.rid}
          currentUserNid={comments.config.publicKey}
          {thread}
          highlightedCommentId={state.highlightedCommentId}
          resolvedBy={comments.resolvedBy}
          inline
          draft={isDraftThread}
          origin={comments.threadOrigins?.[thread.root.id]}
          reactOnComment={isDraftThread ? undefined : comments.reactOnComment}
          createReply={(comments.canReply ?? true)
            ? async (body, embeds) => {
                await comments.createComment(body, embeds, thread.root.id);
              }
            : undefined}
          editComment={comments.editComment}
          canModifyComment={partial(
            roles.isDelegateOrAuthor,
            comments.config.publicKey,
            comments.repoDelegates.map(delegate => delegate.did),
          )}
          deleteComment={comments.deleteComment}
          changeCommentStatus={isDraftThread
            ? undefined
            : comments.changeCommentStatus}
          canResolve={!isDraftThread &&
            Boolean(comments.changeCommentStatus) &&
            (comments.canResolveComment?.(thread.root.id) ?? false)}>
          {#snippet hoverNote()}
            {#if anchor}
              <span class="thread-anchor">
                on
                <span class="thread-anchor-lines">{anchor}</span>
              </span>
            {/if}
          {/snippet}
        </ThreadComponent>
      </div>
    {/if}
  {/each}

  {#if composer && state.comments && state.commit}
    {@const comments = state.comments}
    {@const location = locationOf(state.commit, composer)}
    <div class="composer">
      <CommentToggleInput
        bind:body={
          () => state.composerBody,
          value => {
            state.composerBody = value;
            state.onComposerInput(value);
          }
        }
        disallowEmptyBody
        rid={comments.rid}
        onclose={() => state.onCloseComposer()}
        focus
        placeholder="Leave a comment"
        submitCaption={comments.newCommentCaption}
        submitDescription={comments.newCommentDescription}
        disableAttachments={comments.disableAttachments}
        submit={async (body, embeds) => {
          try {
            await comments.createComment(body, embeds, undefined, location);
          } catch (error) {
            console.error("Comment creation failed", error);
          } finally {
            state.onCloseComposer();
          }
        }}
        secondarySubmit={comments.addCodeCommentDirect
          ? {
              caption: comments.addCodeCommentDirectCaption ?? "Just comment",
              description: comments.addCodeCommentDirectDescription,
              submit: async (body, embeds) => {
                try {
                  await comments.addCodeCommentDirect?.(body, embeds, location);
                } catch (error) {
                  console.error("Comment creation failed", error);
                } finally {
                  state.onCloseComposer();
                }
              },
            }
          : undefined} />
    </div>
  {/if}
</div>
