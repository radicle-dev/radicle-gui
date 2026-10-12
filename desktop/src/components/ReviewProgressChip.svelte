<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    // Given when the chip navigates somewhere; otherwise it is a plain marker,
    // as in the revision dropdown where the whole row is already clickable.
    onclick?: () => void;
    // Set where the column is too narrow for the wording: the chip shrinks to
    // a pencil and this avatar, keeping the same colours.
    nid?: string;
  }

  const { onclick, nid }: Props = $props();
</script>

<style>
  .chip {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0.125rem 0.375rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  /* No fill and no accent at this size: the pencil and avatar read as a pair
     of glyphs beside the review pairs rather than as a pill. */
  .chip.compact {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    background-color: transparent;
    color: var(--color-text-tertiary);
  }
  button.chip {
    cursor: pointer;
  }
  button.chip:hover,
  button.chip:focus-visible {
    background-color: var(--color-feedback-warning-text);
    color: var(--color-feedback-warning-bg);
  }
</style>

{#if nid}
  <span
    class="chip compact"
    title="You have an unpublished review of this revision">
    <Icon name="edit" />
    <UserAvatar nodeId={nid} styleWidth="1rem" />
  </span>
{:else if onclick}
  <button
    type="button"
    class="chip txt-body-s-medium"
    title="Go to your review in progress"
    onclick={e => {
      e.stopPropagation();
      onclick();
    }}>
    Review in progress
  </button>
{:else}
  <span
    class="chip txt-body-s-medium"
    title="You have an unpublished review of this revision">
    Review in progress
  </span>
{/if}
