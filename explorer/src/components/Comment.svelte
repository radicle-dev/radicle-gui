<script lang="ts">
  import type { BaseUrl, Comment } from "@http-client";

  import debounce from "lodash/debounce";
  import { onMount } from "svelte";

  import * as utils from "@app/lib/utils";

  type Side = "left" | "right";
  type SelectionAnchor = { side: Side; lineNumber: number };
  type SelectionRange = { start: SelectionAnchor; end?: SelectionAnchor };

  import Icon from "@app/components/Icon.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Id from "@app/components/Id.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Reactions from "@app/components/Reactions.svelte";

  export let id: string;
  export let authorId: string;
  export let authorAlias: string | undefined = undefined;
  export let baseUrl: BaseUrl;
  export let body: string;
  export let reactions: Comment["reactions"] | undefined = undefined;
  export let location: Comment["location"] | undefined = undefined;
  export let caption = "commented";
  export let rawPath: string;
  export let timestamp: number;
  export let isReply: boolean = false;
  export let isLastReply: boolean = false;
  export let lastEdit: Comment["edits"][0] | undefined = undefined;

  function rangeAnchorsFromCodeLocation(
    location: Comment["location"] | null,
  ): SelectionRange | undefined {
    if (location?.old?.type === "lines") {
      return {
        start: { side: "left", lineNumber: location.old.range.start },
      };
    } else if (location?.new?.type === "lines") {
      return {
        start: { side: "right", lineNumber: location.new.range.start },
      };
    }
  }
  $: selectionRange = rangeAnchorsFromCodeLocation(location);

  let linkCopied = false;
  let targeted = false;

  const restoreLinkIcon = debounce(() => {
    linkCopied = false;
  }, 1000);

  async function copyLink() {
    const { origin, pathname, search } = window.location;
    await utils.toClipboard(`${origin}${pathname}${search}#${id}`);
    linkCopied = true;
    restoreLinkIcon();
  }

  function updateTargeted() {
    targeted = utils.fragmentId(window.location.hash) === id;
  }

  onMount(updateTargeted);
</script>

<style>
  .card {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0;
    gap: 0.5rem;
    border-radius: var(--border-radius-sm);
    scroll-margin-top: 5rem;
    min-width: 0;
  }
  .card.targeted {
    box-shadow: 0 0 0 2px var(--color-border-brand);
  }
  .copy-link {
    margin-left: auto;
  }
  @media (hover: hover) {
    .copy-link {
      opacity: 0;
    }
    .card:hover .copy-link,
    .copy-link:has(:global(:focus-visible)) {
      opacity: 1;
    }
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
  .code-location {
    font: var(--txt-code-regular);
    background-color: var(--color-surface-mid);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.25rem;
  }
  .reply-dot {
    border-radius: var(--border-radius-full);
    width: 4px;
    height: 4px;
    position: absolute;
    top: 10px;
    left: -2.5px;
    background-color: var(--color-border-subtle);
  }
  .card-metadata {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .card-body {
    display: flex;
    align-items: center;
    min-height: 1.625rem;
    word-wrap: break-word;
    font: var(--txt-body-m-regular);
    padding: 0 2.25rem;
  }
  .card-body-content {
    overflow: hidden;
    width: 100%;
    min-width: 0;
  }
  .card-empty-body {
    padding: 0;
  }
  .actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding-left: 2.25rem;
    margin-left: -0.375rem;
  }
  .timestamp {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .card-header-no-icon {
    padding-left: 1rem;
  }
  .reply .card-body,
  .reply .actions {
    padding-left: 1rem;
  }
  .connector-line {
    width: 1px;
    height: 21px;
    position: absolute;
    top: -9px;
    left: -1px;
    background-color: var(--color-border-subtle);
  }
</style>

<svelte:window on:hashchange={updateTargeted} />

<div
  class="card"
  class:card-empty-body={!body}
  class:targeted
  {id}
  class:reply={isReply}>
  <div style:position="relative">
    {#if isReply}
      <div class="reply-dot"></div>
    {/if}
    {#if isLastReply}
      <div class="connector-line"></div>
    {/if}
    <div class="card-header" class:card-header-no-icon={isReply}>
      <slot class="icon" name="icon" />
      <NodeId {baseUrl} nodeId={authorId} alias={authorAlias} />
      <slot name="caption">{caption}</slot>
      <Id {id} />
      {#if location}
        on change
        <div class="code-location">
          {#if location.path && selectionRange}
            <div class="comment-header">
              {location.path.split("/").length > 1 ? "…/" : ""}{location.path
                .split("/")
                .slice(-1)}:{selectionRange.start.side === "left"
                ? "L"
                : "R"}{selectionRange.start.lineNumber}
              {#if selectionRange.end}
                ->
                {selectionRange.end.side === "left" ? "L" : "R"}{selectionRange
                  .end.lineNumber}
              {/if}
            </div>
          {/if}
        </div>
      {/if}
      <span class="timestamp" title={utils.absoluteTimestamp(timestamp)}>
        {utils.formatTimestamp(timestamp)}
      </span>
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
      <div class="copy-link">
        <IconButton
          title={linkCopied ? "Link copied" : "Copy link to comment"}
          ariaLabel="Copy link to comment"
          stylePadding="0.25rem"
          on:click={copyLink}>
          <Icon name={linkCopied ? "checkmark" : "link"} />
        </IconButton>
      </div>
    </div>
  </div>

  {#if body}
    <div class="card-body">
      <div class="card-body-content">
        <Markdown breaks {rawPath} content={body} />
      </div>
    </div>
  {/if}
  {#if reactions && reactions.length > 0}
    <div class="actions">
      <Reactions {reactions} />
    </div>
  {/if}
</div>
