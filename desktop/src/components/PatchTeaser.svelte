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

  import DiffStatBadge from "@app/components/DiffStatBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import Label from "@app/components/Label.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import ReviewSummary from "@app/components/ReviewSummary.svelte";

  interface Props {
    focussed?: boolean;
    patch: Patch;
    rid: string;
    status: PatchStatus | undefined;
  }

  const { focussed, patch, rid, status }: Props = $props();

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

<style>
  .patch-teaser {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    min-height: 5rem;
    background-color: var(--color-surface-canvas);
    padding: 1rem;
    cursor: pointer;
    font: var(--txt-body-l-regular);
    word-break: break-word;
    width: 100%;
  }
  .patch-teaser:hover {
    background-color: var(--color-surface-subtle);
  }
  .status {
    padding: 0;
    margin-right: 1rem;
  }
  .patch-teaser:first-of-type {
    border-radius: var(--border-radius-sm) var(--border-radius-sm) 0 0;
  }
  .patch-teaser:last-of-type {
    border-radius: 0 0 var(--border-radius-sm) var(--border-radius-sm);
  }
  .patch-teaser:only-of-type {
    border-radius: var(--border-radius-sm);
  }
</style>

{#snippet patchSnippet()}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    tabindex="0"
    role="button"
    class="patch-teaser"
    style:align-items="flex-start"
    style:clip-path={focussed ? "none" : undefined}
    style:padding={focussed ? "1rem" : "1.25rem"}
    onclick={() => {
      void push({
        resource: "repo.patch",
        rid,
        patch: patch.id,
        status,
        reviewId: undefined,
      });
    }}>
    <div class="global-flex" style:align-items="flex-start">
      <div
        class="global-chip status"
        style:color={patchStatusColor[patch.state.status]}
        style:background-color={patchStatusBackgroundColor[patch.state.status]}>
        <Icon
          name={patch.state.status === "open"
            ? "patch"
            : `patch-${patch.state.status}`} />
      </div>
      <div
        class="global-flex"
        style:flex-direction="column"
        style:align-items="flex-start">
        <InlineTitle content={patch.title} />
        <div class="global-flex txt-body-m-regular" style:flex-wrap="wrap">
          <NodeId {...authorForNodeId(patch.author)} />
          opened
          <Id id={patch.id} clipboard={patch.id} label="patch ID" />
          <span title={absoluteTimestamp(patch.timestamp)}>
            {formatTimestamp(patch.timestamp)}
          </span>
        </div>
      </div>
    </div>

    <div class="global-flex" style:margin-left="auto">
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
        <div
          class="txt-body-m-regular global-flex"
          style:gap="0.25rem"
          style:border="1px solid var(--color-border-subtle)"
          style:border-radius="var(--border-radius-sm)"
          style:height="1.5rem"
          style:padding="0 0.5rem"
          style:color="var(--color-text-tertiary)">
          <Icon name="comment" />
          {patch.commentCount}
        </div>
      {/if}
      <ReviewSummary
        reviews={entriesFromReviewers(patch.reviewers)}
        revisionCount={patch.revisionIds.length} />
      <div
        class="txt-body-m-regular global-flex"
        style:gap="0.25rem"
        style:white-space="nowrap"
        style:border="1px solid var(--color-border-subtle)"
        style:border-radius="var(--border-radius-sm)"
        style:height="1.5rem"
        style:padding="0 0.5rem"
        style:color="var(--color-text-tertiary)">
        <Icon name="revision" />
        {patch.revisionIds.length}
      </div>
    </div>
  </div>
{/snippet}

{#if focussed}
  <div
    style:border="1px solid var(--color-border-brand)"
    style:border-radius="var(--border-radius-sm)"
    style:display="flex"
    style:gap="0.5rem"
    style:align-items="center"
    style:background-color="var(--color-surface-canvas)">
    {@render patchSnippet()}
  </div>
{:else}
  {@render patchSnippet()}
{/if}
