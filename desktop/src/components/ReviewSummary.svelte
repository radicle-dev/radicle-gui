<script lang="ts">
  import type { ReviewEntry } from "@app/lib/reviewSummary";
  import { reviewSummary, summaryTitle } from "@app/lib/reviewSummary";
  import { publicKeyFromDid } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    reviews: ReviewEntry[];
    // How many revisions the patch has, so the summary can tell whether any
    // review still covers the current head. Omitted where the question doesn't
    // arise — the revision picker already shows one revision's own reviews.
    revisionCount?: number;
    // Drops the frame where the summary sits among other columns rather than
    // standing on its own.
    borderless?: boolean;
  }

  const { reviews, revisionCount, borderless = false }: Props = $props();

  const state = $derived(reviewSummary(reviews, revisionCount ?? 0));
</script>

<style>
  .reviews {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 1.5rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .reviews.borderless {
    border: 0;
    padding: 0;
  }
  .reviewer-stack {
    display: inline-flex;
    align-items: center;
  }
  /* Each avatar is wrapped, so the stacking has to sit on the wrapper: with
     the image nested, `img:first-child` matches every one of them and the
     overlap never applies. */
  .reviewer-stack .avatar {
    display: inline-flex;
    align-items: center;
    margin-left: -0.375rem;
  }
  .reviewer-stack .avatar:first-child {
    margin-left: 0;
  }
  .reviewer-stack .avatar :global(img) {
    display: block;
    outline: 1px solid var(--color-surface-canvas);
  }
  .reviewer-overflow {
    margin-left: 0.25rem;
    color: var(--color-text-tertiary);
  }
  .verdict-accept {
    color: var(--color-feedback-success-text);
  }
  .verdict-reject {
    color: var(--color-feedback-error-text);
  }
  /* Nothing here describes the current changes, so the whole chip recedes
     rather than announcing itself with a word. The tooltip has the detail. */
  .reviews.outdated {
    color: var(--color-text-quaternary);
  }
  .revision-hint {
    color: var(--color-text-quaternary);
  }
</style>

{#if state.reviews.length > 0}
  <div
    class="reviews txt-body-m-regular"
    class:borderless
    class:outdated={state.outdated}
    title={summaryTitle(state)}>
    <span
      class:verdict-accept={state.allAccept}
      class:verdict-reject={state.hasReject}>
      <Icon
        name={state.outdated
          ? "clock"
          : state.hasReject
            ? "stop"
            : state.allAccept
              ? "thumbs-up"
              : "comment"} />
    </span>
    <span>{state.reviews.length}</span>
    {#if state.outdated}
      <span
        class="revision-hint"
        aria-label="reviewed at revision {state.latestReviewedRevision}">
        · r{state.latestReviewedRevision}
      </span>
    {/if}
    <span class="reviewer-stack">
      {#each state.authors.slice(0, 3) as author (author.did)}
        <span class="avatar">
          <UserAvatar nodeId={publicKeyFromDid(author.did)} styleWidth="1rem" />
        </span>
      {/each}
      {#if state.authors.length > 3}
        <span class="reviewer-overflow">
          +{state.authors.length - 3}
        </span>
      {/if}
    </span>
  </div>
{/if}
