<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";

  import UserAvatar from "@radicle-gui/ui/components/UserAvatar.svelte";

  import {
    pictureFile,
    useSharedRepoImage,
  } from "@app/lib/useSharedRepoImage.svelte";

  interface Props {
    // The profile whose picture is shown. Without a profile, or without a
    // picture that can be shown, the pattern generated from an ID stands in:
    // the profile's, or `fallbackId` when there is no profile.
    actor: Pick<ActorInfo, "rid" | "head" | "profile"> | null;
    fallbackId?: string;
    styleWidth: string;
  }

  const { actor, fallbackId, styleWidth }: Props = $props();

  const file = $derived(pictureFile(actor, "avatar"));

  // A save moves `head` whether or not it changed the picture, so the one
  // shown stays until the next has loaded.
  const image = useSharedRepoImage(() => file);

  let broken = $state(false);

  $effect(() => {
    void image.url;
    broken = false;
  });

  // The profile names a picture, so the pattern stands in only once that
  // picture has failed to load: it must not show for a moment before it.
  const named = $derived(file !== undefined);

  const patternId = $derived(actor?.rid ?? fallbackId);
</script>

<style>
  img {
    display: block;
    object-fit: cover;
  }

  .loading {
    display: block;
    flex-shrink: 0;
  }
</style>

{#if image.url && !broken}
  <img
    style:width={styleWidth}
    style:height={styleWidth}
    src={image.url}
    alt="Avatar"
    onerror={() => (broken = true)} />
{:else if patternId && (!named || image.failed || broken)}
  <UserAvatar nodeId={patternId} {styleWidth} />
{:else}
  <!-- Holds the picture's place while it loads, so that nothing beside it
       moves when it arrives. -->
  <span class="loading" style:width={styleWidth} style:height={styleWidth}>
  </span>
{/if}
