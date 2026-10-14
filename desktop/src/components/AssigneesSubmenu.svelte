<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import { publicKeyFromDid, truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    assignees: Author[];
    candidates: Author[];
    save: (assignees: Author[]) => void;
  }

  const { assignees, candidates, save }: Props = $props();

  let selected: Author[] = $derived([...assignees]);

  const options = $derived(
    [...candidates, ...assignees].filter(
      (author, index, all) =>
        all.findIndex(other => other.did === author.did) === index,
    ),
  );

  function isSelected(author: Author): boolean {
    return selected.some(other => other.did === author.did);
  }

  function toggle(author: Author) {
    selected = isSelected(author)
      ? selected.filter(other => other.did !== author.did)
      : [...selected, author];
    save($state.snapshot(selected));
  }
</script>

<style>
  .check {
    display: inline-flex;
    width: 1rem;
    flex-shrink: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

{#each options as author (author.did)}
  {@const checked = isSelected(author)}
  <button
    type="button"
    class="menu-item"
    role="menuitemcheckbox"
    aria-checked={checked}
    title={author.did}
    onclick={() => toggle(author)}>
    <span class="check">
      {#if checked}
        <Icon name="checkmark" />
      {/if}
    </span>
    <UserAvatar nodeId={author.did} styleWidth="1rem" />
    <span class="name">
      {author.alias ?? truncateId(publicKeyFromDid(author.did))}
    </span>
  </button>
{/each}
