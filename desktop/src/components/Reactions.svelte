<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Reaction } from "@bindings/cob/Reaction";

  import { emojiToTwemoji, publicKeyFromDid, truncateId } from "@app/lib/utils";

  interface Props {
    reactions: Reaction[];
    currentUserNid?: string;
    handleReaction?: (authors: Author[], reaction: string) => Promise<void>;
  }

  const { reactions, currentUserNid, handleReaction }: Props = $props();

  function authorsToTooltip(authors: Author[]) {
    return authors.map(a => a.alias ?? a.did).join("\n");
  }

  function isMine(authors: Author[]) {
    if (!currentUserNid) return false;
    return authors.some(a => publicKeyFromDid(a.did) === currentUserNid);
  }

  function formatAuthor(a: Author) {
    const pk = publicKeyFromDid(a.did);
    if (currentUserNid && pk === currentUserNid) {
      return "You";
    }
    return a.alias ?? truncateId(pk);
  }

  function formatAuthors(authors: Author[]) {
    if (authors.length > 3) return `${authors.length}`;
    return authors.map(formatAuthor).join(", ");
  }
</script>

<style>
  .reactions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .reaction {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    padding: 2px 5px;
    border: 1px solid transparent;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
  }
  .reaction.interactive {
    cursor: pointer;
    transition: background-color 0.1s ease-in-out;
  }
  .reaction.interactive:focus {
    outline: none;
  }
  .reaction.interactive:focus-visible {
    outline: 2px solid var(--color-border-brand);
    outline-offset: 1px;
  }
  .reaction.interactive:hover {
    background-color: var(--color-surface-mid);
  }
  .reaction.mine {
    background-color: var(--color-surface-brand-subtle);
    border-color: var(--color-surface-brand-mid);
  }
  .reaction.mine .count {
    color: var(--color-text-brand);
  }
  .reaction.interactive.mine:hover {
    background-color: var(--color-surface-brand-mid);
  }
  .reaction :global(.txt-emoji) {
    width: 16px;
    height: 16px;
    vertical-align: middle;
    margin: 0;
  }
</style>

<div class="reactions">
  {#each reactions as { emoji, authors }}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      role={handleReaction ? "button" : undefined}
      tabindex={handleReaction ? 0 : undefined}
      title={isMine(authors) && handleReaction
        ? "Remove reaction"
        : authorsToTooltip(authors)}
      class="reaction txt-body-s-regular"
      class:interactive={handleReaction}
      class:mine={isMine(authors)}
      onclick={handleReaction
        ? () => handleReaction(authors, emoji)
        : undefined}>
      <span>{@html emojiToTwemoji(emoji, ["21a9"])}</span>
      <span class="count">{formatAuthors(authors)}</span>
    </div>
  {/each}
</div>
