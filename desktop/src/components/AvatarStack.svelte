<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import { authorForNodeId } from "@app/lib/utils";

  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    people: Author[];
    avatarSize?: string;
  }

  const { people, avatarSize = undefined }: Props = $props();

  // The cards are portaled out of the stack, so moving onto one ends the
  // stack's hover. Keep it fanned out while any card is still open.
  let hovered = $state(false);
  const cardsOpen: Record<string, boolean> = $state({});
  const fanned = $derived(hovered || Object.values(cardsOpen).some(Boolean));
</script>

<style>
  .avatars {
    display: flex;
    align-items: center;
  }
  /* Positioned so each avatar paints together with its ring; otherwise every
     ring is painted before any image and the one below covers it. */
  .avatar {
    position: relative;
    display: flex;
    border-radius: 2px;
    box-shadow: 0 0 0 2px var(--color-surface-canvas);
    transition: margin-left 150ms ease;
  }
  .avatar + .avatar {
    margin-left: -0.625rem;
  }
  .avatars.fanned .avatar + .avatar {
    margin-left: 0.25rem;
  }
</style>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="avatars"
  class:fanned
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}>
  {#each people as person, index (person.did)}
    <div class="avatar" style:z-index={people.length - index}>
      <NodeId
        {...authorForNodeId(person)}
        avatarOnly
        {avatarSize}
        oncardtoggle={expanded => (cardsOpen[person.did] = expanded)} />
    </div>
  {/each}
</div>
