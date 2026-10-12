<script lang="ts">
  import type { Release } from "@bindings/cob/release/Release";
  import type { ReleaseScope } from "@bindings/cob/release/ReleaseScope";

  import { push } from "@app/lib/router";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
  } from "@app/lib/utils";

  import DelegateBadge from "@app/components/DelegateBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    scope: ReleaseScope;
    delegateIds: Set<string>;
    release: Release;
    rid: string;
  }

  const { scope, delegateIds, release, rid }: Props = $props();

  const title = $derived(release.title || release.tagName || release.id);
</script>

<style>
  .release-teaser {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    min-height: 5rem;
    background-color: var(--color-surface-canvas);
    padding: 1rem;
    cursor: pointer;
    font: var(--txt-body-l-regular);
    word-break: break-word;
    width: 100%;
  }
  .release-teaser:hover {
    background-color: var(--color-surface-subtle);
  }
  .icon {
    padding: 0;
    margin-right: 1rem;
    color: var(--color-text-tertiary);
  }
  .tag {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0 0.375rem;
    white-space: nowrap;
  }
  .counter {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    height: 1.5rem;
    padding: 0 0.5rem;
    color: var(--color-text-tertiary);
  }
</style>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  tabindex="0"
  role="button"
  class="release-teaser"
  onclick={() => {
    void push({
      resource: "repo.release",
      rid,
      release: release.id,
      scope,
    });
  }}>
  <div class="global-chip icon">
    <Icon name="parcel" />
  </div>
  <div
    class="global-flex"
    style:flex-direction="column"
    style:align-items="flex-start">
    <div class="global-flex" style:flex-wrap="wrap">
      <InlineTitle content={title} />
      {#if release.tagName}
        <span class="tag">{release.tagName}</span>
      {/if}
    </div>
    <div class="global-flex txt-body-m-regular" style:flex-wrap="wrap">
      <NodeId {...authorForNodeId(release.creator)} />
      {#if delegateIds.has(release.creator.did)}
        <DelegateBadge />
      {/if}
      created
      <Id id={release.id} clipboard={release.id} label="release ID" />
      <span title={absoluteTimestamp(release.createdAt)}>
        {formatTimestamp(release.createdAt)}
      </span>
    </div>
  </div>

  <div class="global-flex" style:margin-left="auto">
    <div class="counter" title="Artifacts">
      <Icon name="attach" />
      {release.artifacts.length}
    </div>
  </div>
</div>
