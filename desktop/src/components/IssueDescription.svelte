<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Reaction } from "@bindings/cob/Reaction";
  import type { Embed } from "@bindings/cob/thread/Embed";

  import ExtendedTextarea from "@app/components/ExtendedTextarea.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";
  import Reactions from "@app/components/Reactions.svelte";
  import ReactionSelector from "@app/components/ReactionSelector.svelte";

  interface Props {
    rid: string;
    body: string;
    embeds: Embed[];
    reactions: Reaction[];
    currentUserNid?: string;
    allowedToEdit: boolean;
    editComment: (body: string, embeds: Embed[]) => Promise<void>;
    reactOnComment: (authors: Author[], reaction: string) => Promise<void>;
  }

  const {
    rid,
    body,
    embeds,
    reactions,
    currentUserNid,
    allowedToEdit,
    editComment,
    reactOnComment,
  }: Props = $props();

  let editing = $state(false);
</script>

<style>
  .description {
    position: relative;
    margin: 1rem 0 1.5rem;
  }
  .description-body {
    position: relative;
  }
  .description-body:has(.body-actions) {
    padding-right: 4rem;
  }
  .body-actions {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }
  .body-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 0.25rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-tertiary);
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .description:hover .body-action,
  .description:focus-within .body-action,
  .body-action:focus-visible {
    opacity: 1;
  }
  .body-action:hover,
  .body-action:focus-visible {
    color: var(--color-text-primary);
    background-color: var(--color-surface-subtle);
  }
  .reactions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
</style>

<div class="description">
  {#if editing}
    <ExtendedTextarea
      {rid}
      {body}
      focus
      submitCaption="Save"
      submit={async ({ comment, embeds }) => {
        await editComment(comment, Array.from(embeds.values()));
        editing = false;
      }}
      close={() => (editing = false)} />
  {:else}
    <div class="description-body txt-body-m-regular">
      {#if body.trim() !== ""}
        <Markdown
          {rid}
          breaks
          content={body}
          toggleTaskItem={allowedToEdit
            ? async content => {
                await editComment(content, embeds);
              }
            : undefined} />
      {:else}
        <span style:color="var(--color-text-tertiary)">No description</span>
      {/if}
      <div class="body-actions">
        <div class="body-action">
          <ReactionSelector
            placement="bottom-end"
            {reactions}
            select={async ({ authors, emoji }) => {
              try {
                await reactOnComment(authors, emoji);
              } finally {
                closeFocused();
              }
            }} />
        </div>
        {#if allowedToEdit}
          <button
            type="button"
            class="body-action"
            title="Edit description"
            onclick={() => (editing = true)}>
            <Icon name="edit" />
          </button>
        {/if}
      </div>
    </div>
  {/if}
  {#if reactions.length > 0}
    <div class="reactions">
      <Reactions handleReaction={reactOnComment} {currentUserNid} {reactions} />
    </div>
  {/if}
</div>
