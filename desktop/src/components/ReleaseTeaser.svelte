<script lang="ts">
  import type { Release } from "@bindings/cob/release/Release";

  import { push } from "@app/lib/router";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
  } from "@app/lib/utils";

  import CobTeaser from "@app/components/CobTeaser.svelte";
  import CountBadge from "@app/components/CountBadge.svelte";
  import DelegateBadge from "@app/components/DelegateBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    delegateIds: Set<string>;
    release: Release;
    rid: string;
  }

  const { delegateIds, release, rid }: Props = $props();

  const releaseTitle = $derived(release.title || release.tagName || release.id);
</script>

<style>
  .tag {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0 0.375rem;
    white-space: nowrap;
  }
</style>

<CobTeaser
  chipColor="var(--color-text-tertiary)"
  onclick={() => {
    void push({
      resource: "repo.release",
      rid,
      release: release.id,
    });
  }}>
  {#snippet icon()}
    <Icon name="parcel" />
  {/snippet}
  {#snippet heading()}
    <div class="global-flex" style:flex-wrap="wrap">
      <InlineTitle content={releaseTitle} />
      {#if release.tagName}
        <span class="tag">{release.tagName}</span>
      {/if}
    </div>
  {/snippet}
  {#snippet meta()}
    <NodeId {...authorForNodeId(release.creator)} />
    {#if delegateIds.has(release.creator.did)}
      <DelegateBadge />
    {/if}
    created
    <Id id={release.id} clipboard={release.id} label="release ID" />
    <span title={absoluteTimestamp(release.createdAt)}>
      {formatTimestamp(release.createdAt)}
    </span>
  {/snippet}
  {#snippet badges()}
    <CountBadge
      icon="attach"
      count={release.artifacts.length}
      title="Artifacts" />
  {/snippet}
</CobTeaser>
