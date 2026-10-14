<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import { publicKeyFromDid, truncateId } from "@app/lib/utils";

  import MenuCheckItem from "@app/components/MenuCheckItem.svelte";
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

{#each options as author (author.did)}
  <MenuCheckItem
    checked={isSelected(author)}
    label={author.alias ?? truncateId(publicKeyFromDid(author.did))}
    title={author.did}
    onclick={() => toggle(author)}>
    {#snippet leading()}
      <UserAvatar nodeId={author.did} styleWidth="1rem" />
    {/snippet}
  </MenuCheckItem>
{/each}
