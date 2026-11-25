<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import { profileName } from "@app/lib/keyProfiles.svelte";
  import { publicKeyFromDid, truncateId } from "@app/lib/utils";

  import KeyAvatar from "@app/components/KeyAvatar.svelte";
  import MenuCheckItem from "@app/components/MenuCheckItem.svelte";

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

  // Two keys of one profile share its name, so the alias, or the key
  // without one, tells them apart.
  function label(author: Author): string {
    const name = profileName(author.did);
    const device = author.alias ?? truncateId(publicKeyFromDid(author.did));

    return name === undefined ? device : `${name} · ${device}`;
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
    label={label(author)}
    title={author.did}
    onclick={() => toggle(author)}>
    {#snippet leading()}
      <KeyAvatar nodeId={author.did} styleWidth="1rem" />
    {/snippet}
  </MenuCheckItem>
{/each}
