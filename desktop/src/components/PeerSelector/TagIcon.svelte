<script lang="ts">
  import type { Tag } from "@bindings/repo/Tag";

  import {
    absoluteTimestamp,
    formatTimestamp,
    gravatarURL,
  } from "@app/lib/utils";

  import HoverPopover from "@app/components/HoverPopover.svelte";
  import Icon from "@app/components/Icon.svelte";

  const { tag }: { tag: Tag } = $props();

  const annotated = $derived(
    tag.tagger !== undefined || tag.message !== undefined,
  );
</script>

<style>
  .tag-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 32rem;
  }
  .tag-tagger {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .tag-avatar {
    width: 1rem;
    height: 1rem;
    border-radius: var(--border-radius-round);
  }
  .tag-message {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font: var(--txt-code-small);
    color: var(--color-text-primary);
  }
</style>

{#if annotated}
  <HoverPopover>
    {#snippet toggle()}
      <Icon name="label" />
    {/snippet}
    {#snippet popover()}
      <div class="tag-details">
        {#if tag.tagger}
          <div
            class="tag-tagger"
            title={`${tag.tagger.name} <${tag.tagger.email}>`}>
            <img
              class="tag-avatar"
              alt="avatar"
              src={gravatarURL(tag.tagger.email)} />
            {tag.tagger.name} tagged
            <span title={absoluteTimestamp(tag.tagger.timestamp * 1000)}>
              {formatTimestamp(tag.tagger.timestamp * 1000)}
            </span>
          </div>
        {/if}
        {#if tag.message}
          <pre class="tag-message txt-selectable">{tag.message}</pre>
        {/if}
      </div>
    {/snippet}
  </HoverPopover>
{:else}
  <Icon name="label" />
{/if}
