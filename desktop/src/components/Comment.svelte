<script lang="ts" module>
  // Re-exported so the many components that reach for it through this one keep
  // working; it lives in `@app/lib/codeComments` because plain TypeScript
  // modules cannot import a type out of a Svelte component.
  export type { CommentOrigin } from "@app/lib/codeComments";
</script>

<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Edit } from "@bindings/cob/patch/Edit";
  import type { Reaction } from "@bindings/cob/Reaction";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { Snippet } from "svelte";
  import type { ComponentProps } from "svelte";

  import { tick } from "svelte";

  import type { CommentOrigin } from "@app/lib/codeComments";
  import { writeToClipboard } from "@app/lib/invoke";
  import * as utils from "@app/lib/utils";

  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import ExtendedTextarea from "@app/components/ExtendedTextarea.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import Reactions from "@app/components/Reactions.svelte";
  import ReactionSelector from "@app/components/ReactionSelector.svelte";

  interface Props {
    actions?: Snippet;
    beforeTimestamp?: Snippet;
    // An aside on the authorship line, between the caption and the timestamp,
    // shown only while the comment is hovered.
    hoverNote?: Snippet;
    id?: string;
    rid: string;
    currentUserNid?: string;
    author: Author;
    body?: string;
    reactions?: Reaction[];
    embeds?: Map<string, Embed>;
    caption?: string;
    // Marks a comment that is part of an unpublished draft review.
    draft?: boolean;
    // Marks a comment whose thread has been dealt with. The review sidebar says
    // this with a checkmark against a dimmed row; everywhere else the comment is
    // shown at full strength, so it needs to say so itself.
    resolved?: boolean;
    // Names who resolved it, for the badge's tooltip. The comment carries only
    // the flag, so the caller has to look this up (see `resolutionsByComment`);
    // where it cannot, the badge says what it always said.
    resolvedCaption?: string;
    origin?: CommentOrigin;
    timestamp?: number;
    lastEdit?: Edit;
    disallowEmptyBody?: boolean;
    emptyBodyTooltip?: string;
    editComment?: (body: string, embeds: Embed[]) => Promise<void>;
    reactOnComment?: (authors: Author[], reaction: string) => Promise<void>;
    deleteComment?: () => Promise<void>;
    styleWidth?: string;
    // See `ExtendedTextarea`
    disableAttachments?: boolean | string;
  }

  /* eslint-disable prefer-const */
  let {
    actions,
    beforeTimestamp,
    hoverNote,
    id,
    rid,
    currentUserNid,
    author,
    body = $bindable(),
    reactions,
    embeds,
    caption = "commented",
    draft = false,
    resolved = false,
    resolvedCaption,
    origin,
    timestamp,
    lastEdit,
    disallowEmptyBody = false,
    editComment,
    reactOnComment,
    deleteComment,
    styleWidth,
    emptyBodyTooltip,
    disableAttachments,
  }: Props = $props();
  /* eslint-enable prefer-const */

  let mode: "read" | "edit" | "submit" = $state("read");
  let menuExpanded = $state(false);

  // Everything that acts on the comment itself, as opposed to on the
  // conversation: kept behind one button so reacting, resolving and replying
  // stay the visible actions.
  type MenuAction = {
    label: string;
    icon: ComponentProps<typeof Icon>["name"];
    title?: string;
    run: () => void | Promise<void>;
  };

  const menuActions: MenuAction[] = $derived.by(() => {
    const actions: MenuAction[] = [];
    if (id) {
      actions.push({
        label: "Copy ID",
        icon: "copy",
        title: id,
        run: () => writeToClipboard(id),
      });
    }
    if (editComment) {
      actions.push({ label: "Edit", icon: "edit", run: toggleEdit });
    }
    // Gated by whoever passes it, exactly as `editComment` is — the protocol
    // authorizes both the same way (a delegate, or the comment's own author),
    // so a second, stricter rule here would only hide an action the node would
    // have accepted.
    if (deleteComment) {
      actions.push({ label: "Delete", icon: "trash", run: deleteComment });
    }
    return actions;
  });

  async function runMenuAction(action: MenuAction) {
    closeFocused();
    try {
      await action.run();
    } catch (error) {
      console.error(`${action.label} failed`, error);
    }
  }

  async function toggleEdit() {
    if (mode === "read") {
      mode = "edit";
      await tick();
      utils.scrollIntoView(`edit-${id}`, {
        behavior: "smooth",
        block: "center",
      });
    } else if (mode === "edit") {
      mode = "read";
    }
  }
</script>

<style>
  .card {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0;
    gap: 0.5rem;
  }
  .card-header {
    display: flex;
    align-items: center;
    white-space: nowrap;
    flex-wrap: wrap;
    padding: 0 0.75rem;
    min-height: 1.5rem;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .card-metadata {
    color: var(--color-text-quaternary);
    font: var(--txt-body-m-regular);
  }
  .header-right {
    display: flex;
    align-items: center;
    margin-left: auto;
    gap: 0.5rem;
    opacity: 0;
    transition: opacity 0.1s ease-in-out;
    will-change: opacity;
  }
  .card:is(
      :hover,
      :has(:focus-visible),
      :has(:global([data-expanded])),
      .editing
    )
    :is(.header-right, .hover-only) {
    opacity: 1;
  }
  .hover-only {
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.1s ease-in-out;
    will-change: opacity;
  }
  /* Takes no space at rest, rather than fading in place like `.hover-only`:
     sitting mid-sentence, a reserved gap between the caption and the timestamp
     reads as a hole. */
  .hover-note {
    display: none;
    align-items: center;
  }
  .card:is(
      :hover,
      :has(:focus-visible),
      :has(:global([data-expanded])),
      .editing
    )
    .hover-note {
    display: inline-flex;
  }
  .card-body {
    display: flex;
    align-items: center;
    min-height: 1.625rem;
    word-wrap: break-word;
    font: var(--txt-body-m-regular);
    padding: 0 0.75rem;
  }
  .actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem 0.25rem;
  }
  button.caption {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .timestamp,
  .caption {
    font: var(--txt-body-m-regular);
    color: var(--color-text-quaternary);
  }
  /* Shaped and coloured like the verdict badge a review is headed with (see
     `ReviewItem`), so the two green "this went well" marks read as one thing said
     in two places.

     The font is declared rather than inherited: inside a diff this card is
     slotted into Pierre's shadow tree, whose own font size is larger, and the
     captions beside it each set their own — so an inheriting chip came out the
     biggest thing on the line. */
  .resolved-chip {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
    font: var(--txt-body-s-regular);
  }
  .menu {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    padding: 0.25rem;
  }
</style>

<div class="card" class:editing={mode !== "read"} {id} style:width={styleWidth}>
  <div style:position="relative">
    <div class="card-header">
      <NodeId {...utils.authorForNodeId(author)} />
      <span class="caption">{caption}</span>
      {#if draft}
        <span
          class="global-chip"
          title="Not published yet, only visible to you">
          Draft
        </span>
      {/if}
      {#if origin}
        {#if origin.onclick}
          <button
            class="global-link caption"
            type="button"
            title={origin.title}
            onclick={origin.onclick}>
            {origin.text}
          </button>
        {:else}
          <span class="caption" title={origin.title}>{origin.text}</span>
        {/if}
      {/if}
      {#if beforeTimestamp}
        {@render beforeTimestamp()}
      {/if}
      {#if hoverNote}
        <span class="hover-note">{@render hoverNote()}</span>
      {/if}
      {#if timestamp}
        <span class="timestamp" title={utils.absoluteTimestamp(timestamp)}>
          {utils.formatTimestamp(timestamp)}
        </span>
      {/if}
      {#if lastEdit}
        <div
          class="card-metadata"
          title={utils.formatEditedCaption(
            lastEdit.author,
            lastEdit.timestamp,
          )}>
          • edited
        </div>
      {/if}
      {#if resolved}
        <span
          class="resolved-chip"
          title={resolvedCaption ?? "Marked as resolved"}>
          Resolved
        </span>
      {/if}
      <div class="header-right">
        {#if reactions && reactOnComment}
          <ReactionSelector
            placement="top-end"
            {reactions}
            select={async ({ authors, emoji }) => {
              try {
                await reactOnComment(authors, emoji);
              } finally {
                closeFocused();
              }
            }} />
        {/if}
        {@render actions?.()}
        {#if menuActions.length > 0}
          <Popover placement="bottom-end" bind:expanded={menuExpanded}>
            {#snippet toggle(onclick)}
              <span class="global-icon-button" title="Comment actions">
                <Icon name="ellipsis-vertical" {onclick} />
              </span>
            {/snippet}
            {#snippet popover()}
              <div class="menu">
                <DropdownList items={menuActions}>
                  {#snippet item(action)}
                    <DropdownListItem
                      selected={false}
                      styleGap="0.5rem"
                      title={action.title}
                      onclick={() => runMenuAction(action)}>
                      <Icon name={action.icon} />
                      {action.label}
                    </DropdownListItem>
                  {/snippet}
                </DropdownList>
              </div>
            {/snippet}
          </Popover>
        {/if}
      </div>
    </div>
  </div>

  {#if (body === undefined || body?.trim() === "") && mode === "read"}
    <div class="card-body">
      <span class="txt-missing txt-body-m-regular" style:line-height="1.625rem">
        No description.
      </span>
    </div>
  {:else}
    <div class="card-body">
      {#if editComment && mode !== "read"}
        <div id={`edit-${id}`} style:width="100%">
          <ExtendedTextarea
            focus
            inline
            {body}
            {rid}
            {embeds}
            {disallowEmptyBody}
            {emptyBodyTooltip}
            {disableAttachments}
            borderVariant="ghost"
            submitVariant="secondary"
            submitInProgress={mode === "submit"}
            submitCaption="Save"
            placeholder="Leave a comment"
            submit={async ({ comment, embeds }) => {
              mode = "submit";
              try {
                await editComment(comment, Array.from(embeds.values()));
              } finally {
                mode = "read";
              }
            }}
            close={async () => {
              body = body;
              await tick();
              mode = "read";
            }} />
        </div>
      {:else}
        <div style:width="100%">
          <div style:overflow="hidden">
            <Markdown
              {rid}
              breaks
              content={body ?? ""}
              toggleTaskItem={editComment
                ? async content => {
                    await editComment(
                      content,
                      Array.from(embeds?.values() ?? []),
                    );
                  }
                : undefined} />
          </div>
        </div>
      {/if}
    </div>
  {/if}
  {#if reactions && reactions.length > 0}
    <div class="actions">
      <Reactions handleReaction={reactOnComment} {currentUserNid} {reactions} />
      {#if reactOnComment}
        <div class="hover-only">
          <ReactionSelector
            placement="top-start"
            {reactions}
            select={async ({ authors, emoji }) => {
              try {
                await reactOnComment(authors, emoji);
              } finally {
                closeFocused();
              }
            }} />
        </div>
      {/if}
    </div>
  {/if}
</div>
