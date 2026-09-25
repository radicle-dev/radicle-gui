<script lang="ts">
  import type { BaseUrl, Release } from "@http-client";

  import { absoluteTimestamp, formatTimestamp } from "@app/lib/utils";

  import DelegateBadge from "./DelegateBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Link from "@app/components/Link.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  export let baseUrl: BaseUrl;
  export let delegateIds: Set<string>;
  export let release: Release;
  export let repoId: string;
  export let allAuthors: boolean = false;

  // The COB has no title; fall back to the tag name, then the release id.
  $: title = release.title || release.tagName || release.id;
</script>

<style>
  .release-teaser {
    display: flex;
    padding: 1.25rem;
    background-color: var(--color-surface-canvas);
  }
  .release-teaser:hover {
    background-color: var(--color-surface-subtle);
  }
  .content {
    gap: 0.5rem;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .subtitle {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    font: var(--txt-body-m-regular);
    gap: 0.5rem;
  }
  .summary {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    word-break: break-word;
  }
  .match-context {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .match-context mark {
    background-color: var(--color-surface-alpha-mid);
    color: inherit;
    border-radius: var(--border-radius-xs);
  }
  .icon {
    justify-self: center;
    align-self: flex-start;
    margin-right: 0.5rem;
    padding: 0.25rem;
    color: var(--color-text-tertiary);
  }
  .right {
    display: flex;
    margin-left: auto;
    min-height: 1.5rem;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text-tertiary);
  }
  .counter {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>

<div role="button" tabindex="0" class="release-teaser">
  <div class="icon">
    <Icon name="parcel" />
  </div>
  <div class="content">
    <div class="summary">
      <span>
        <Link
          styleHoverState
          route={{
            resource: "repo.release",
            repo: repoId,
            node: baseUrl,
            release: release.id,
            allAuthors,
          }}>
          <InlineTitle
            fontSize="body-m-regular"
            content={title}
            segments={release.matches?.title} />
        </Link>
      </span>
      <div class="right">
        <span class="counter" title="Artifacts">
          <Icon name="attach" />
          {release.artifacts.length}
        </span>
      </div>
    </div>
    {#if release.matches?.context}
      <div class="match-context">
        {#each release.matches.context.segments as segment}
          <!-- prettier-ignore -->
          {#if segment.match}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
        {/each}
      </div>
    {/if}
    <div class="subtitle">
      <div
        style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <NodeId
          {baseUrl}
          nodeId={release.creator.id}
          alias={release.creator.alias} />
        {#if delegateIds.has(release.creator.id)}
          <DelegateBadge />
        {/if}
        released
        <Id id={release.id} />
        <span title={absoluteTimestamp(release.createdAt)}>
          {formatTimestamp(release.createdAt)}
        </span>
      </div>
    </div>
  </div>
</div>
