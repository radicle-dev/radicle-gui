<script lang="ts">
  import type { PatchStatus } from "@app/views/repo/router";
  import type { Patch } from "@bindings/cob/patch/Patch";

  import { draftReviewStorage } from "@app/lib/draftReviewStorage";
  import { cachedConfig, cachedDiffStats } from "@app/lib/invoke";
  import { entriesFromReviewers } from "@app/lib/reviewSummary";
  import { push } from "@app/lib/router";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
    patchStatusBackgroundColor,
    patchStatusColor,
  } from "@app/lib/utils";

  import CobTeaser from "@app/components/CobTeaser.svelte";
  import CountBadge from "@app/components/CountBadge.svelte";
  import DiffStatBadge from "@app/components/DiffStatBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import Label from "@app/components/Label.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import ReviewSummary from "@app/components/ReviewSummary.svelte";

  interface Props {
    contextActive?: boolean;
    focussed?: boolean;
    oncontextmenu?: (event: MouseEvent) => void;
    patch: Patch;
    rid: string;
    status: PatchStatus | undefined;
  }

  const { contextActive, focussed, oncontextmenu, patch, rid, status }: Props =
    $props();

  // Drafts belong to an identity, so the marker has to know who is signed in.
  // Until the config arrives the marker stays off rather than showing someone
  // else's draft.
  let publicKey: string | undefined = $state();
  $effect(() => {
    let cancelled = false;
    void cachedConfig()
      .then(result => {
        if (!cancelled) publicKey = result.publicKey;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  });

  const hasDraftReview = $derived.by(() => {
    const nid = publicKey;
    if (nid === undefined) return false;
    return patch.revisionIds.some(id =>
      draftReviewStorage.hasForRevision(id, nid),
    );
  });
</script>

<CobTeaser
  {contextActive}
  {focussed}
  {oncontextmenu}
  chipColor={patchStatusColor[patch.state.status]}
  chipBackground={patchStatusBackgroundColor[patch.state.status]}
  onclick={() => {
    void push({
      resource: "repo.patch",
      rid,
      patch: patch.id,
      status,
      reviewId: undefined,
    });
  }}>
  {#snippet icon()}
    <Icon
      name={patch.state.status === "open"
        ? "patch"
        : `patch-${patch.state.status}`} />
  {/snippet}
  {#snippet heading()}
    <InlineTitle content={patch.title} />
  {/snippet}
  {#snippet meta()}
    <NodeId {...authorForNodeId(patch.author)} />
    opened
    <Id id={patch.id} clipboard={patch.id} label="patch ID" />
    <span title={absoluteTimestamp(patch.timestamp)}>
      {formatTimestamp(patch.timestamp)}
    </span>
  {/snippet}
  {#snippet badges()}
    {#if hasDraftReview}
      <div
        class="txt-body-m-regular"
        style:white-space="nowrap"
        style:border="1px solid var(--color-border-subtle)"
        style:border-radius="var(--border-radius-sm)"
        style:padding="0.125rem 0.5rem"
        style:color="var(--color-text-primary)">
        Review in progress
      </div>
    {/if}

    {#await cachedDiffStats(rid, patch.base, patch.head) then stats}
      <DiffStatBadge {stats} />
    {/await}

    {#each patch.labels as label}
      <Label {label} />
    {/each}
    {#if patch.commentCount > 0}
      <CountBadge icon="comment" count={patch.commentCount} title="Comments" />
    {/if}
    <ReviewSummary
      reviews={entriesFromReviewers(patch.reviewers)}
      revisionCount={patch.revisionIds.length} />
    <CountBadge
      icon="revision"
      count={patch.revisionIds.length}
      title="Revisions" />
  {/snippet}
</CobTeaser>
