<script lang="ts">
  import type { Snippet } from "svelte";

  import UserAvatar from "@radicle-gui/ui/components/UserAvatar.svelte";

  interface Props {
    // Empty while a profile being typed has no name yet.
    displayName: string;
    fullName?: string;
    bio?: string;
    // The addresses the pictures are shown from, when there are any.
    avatar: string | undefined;
    banner: string | undefined;
    // The profile has a banner whose address is still to come. The card
    // keeps its place, so it does not change shape when the banner arrives,
    // or when it never does.
    bannerExpected?: boolean;
    // What the generated avatar is drawn from when there is no picture.
    avatarId: string;
    // What the card holds under the profile.
    details: Snippet;
  }

  const {
    displayName,
    fullName = undefined,
    bio = undefined,
    avatar,
    banner,
    bannerExpected = false,
    avatarId,
    details,
  }: Props = $props();

  let broken = $state(false);
  let bannerBroken = $state(false);
  $effect(() => {
    void avatar;
    broken = false;
  });
  $effect(() => {
    void banner;
    bannerBroken = false;
  });
</script>

<style>
  .card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
    overflow: hidden;
  }
  .banner {
    height: 3.5rem;
    background-color: var(--color-surface-subtle);
  }
  .banner img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .avatar {
    width: 3rem;
    height: 3rem;
    margin: 0.875rem 0 0 0.875rem;
    overflow: hidden;
    border: 3px solid var(--color-surface-canvas);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
  }
  /* With a banner, the avatar overlaps its bottom-left edge. */
  .banner + .avatar {
    margin-top: -1.5rem;
  }
  .avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem 0.875rem 0.875rem;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .name,
  .full-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    color: var(--color-text-primary);
  }
  .name.empty {
    color: var(--color-text-tertiary);
  }
  .full-name,
  .bio {
    color: var(--color-text-secondary);
  }
  .bio {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>

<div class="card">
  {#if bannerExpected || (banner && !bannerBroken)}
    <div class="banner">
      {#if banner && !bannerBroken}
        <img src={banner} alt="" onerror={() => (bannerBroken = true)} />
      {/if}
    </div>
  {/if}

  <span class="avatar">
    {#if avatar && !broken}
      <img src={avatar} alt="" onerror={() => (broken = true)} />
    {:else}
      <UserAvatar nodeId={avatarId} styleWidth="100%" />
    {/if}
  </span>

  <div class="body">
    <span class="text">
      <span class="name txt-body-m-medium" class:empty={!displayName}>
        {displayName || "Display name"}
      </span>
      {#if fullName}
        <span class="full-name txt-body-m-regular">{fullName}</span>
      {/if}
    </span>

    {#if bio}
      <span class="bio txt-body-m-regular">{bio}</span>
    {/if}

    {@render details()}
  </div>
</div>
