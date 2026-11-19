<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";

  import UserAvatar from "@radicle-gui/ui/components/UserAvatar.svelte";
  import { onDestroy } from "svelte";

  import { RepoImages } from "@app/lib/repoImages";

  interface Props {
    // The profile whose picture is shown. Without a profile, or without a
    // picture that can be shown, the pattern generated from an ID stands in:
    // the profile's, or `fallbackId` when there is no profile.
    actor: Pick<ActorInfo, "rid" | "head" | "profile"> | null;
    fallbackId?: string;
    styleWidth: string;
  }

  const { actor, fallbackId, styleWidth }: Props = $props();

  const images = new RepoImages();
  onDestroy(() => images.dispose());

  const rid = $derived(actor?.rid);
  const head = $derived(actor?.head);
  // A value with a colon is a web address. It is not fetched: that would
  // tell its host who is looking, each time the picture is shown.
  const path = $derived.by(() => {
    const named = actor?.profile?.avatar?.trim();

    return named && !named.includes(":") ? named : undefined;
  });

  // The picture shown and the profile it belongs to. A save moves `head`
  // whether or not it changed the picture, so the one shown stays until the
  // next has loaded.
  let src = $state<string>();
  let shownOf: string | undefined;
  let broken = $state(false);
  // The profile names a picture, so the pattern stands in only once that
  // picture has failed to load: it must not show for a moment before it.
  const named = $derived(Boolean(rid && head && path));
  let failed = $state(false);

  function showPicture(url: string | undefined) {
    src = url;
    broken = false;
    failed = url === undefined;
    // Releases the pictures loaded before this one.
    images.sweep();
  }

  $effect(() => {
    if (rid !== shownOf) {
      shownOf = rid;
      src = undefined;
    }
    if (!rid || !head || !path) {
      showPicture(undefined);
      return;
    }

    let gone = false;
    void images
      .load(rid, head, path)
      .then(image => {
        if (!gone) showPicture(image?.url);
      })
      .catch((e: unknown) => {
        console.warn("Could not load the profile's avatar", e);
        if (!gone) showPicture(undefined);
      });

    return () => {
      gone = true;
    };
  });

  const patternId = $derived(actor?.rid ?? fallbackId);
</script>

<style>
  img {
    display: block;
    object-fit: cover;
  }
</style>

{#if src && !broken}
  <img
    style:width={styleWidth}
    style:height={styleWidth}
    {src}
    alt="Avatar"
    onerror={() => (broken = true)} />
{:else if patternId && (!named || failed || broken)}
  <UserAvatar nodeId={patternId} {styleWidth} />
{/if}
