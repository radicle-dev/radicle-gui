<script lang="ts">
  import type { Form } from "./form";

  import UserAvatar from "@radicle-gui/ui/components/UserAvatar.svelte";

  import { truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    form: Form;
    avatar: string | undefined;
    banner: string | undefined;
    // What the generated avatar is drawn from when there is no picture.
    avatarId: string;
    // The Profile ID, or this device's key before there is a profile.
    did: string;
  }

  const { form, avatar, banner, avatarId, did }: Props = $props();

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
  /* Inert: the shape of the card other people see, not a working one. */
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
  .did {
    color: var(--color-text-tertiary);
    font: var(--txt-code-regular);
  }
  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-secondary);
  }
</style>

<div class="card">
  {#if banner && !bannerBroken}
    <div class="banner">
      <img src={banner} alt="" onerror={() => (bannerBroken = true)} />
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
      <span
        class="name txt-body-m-medium"
        class:empty={!form.displayName.trim()}>
        {form.displayName.trim() || "Display name"}
      </span>
      {#if form.fullName.trim()}
        <span class="full-name txt-body-m-regular">{form.fullName}</span>
      {/if}
    </span>

    {#if form.bio.trim()}
      <span class="bio txt-body-m-regular">{form.bio}</span>
    {/if}

    <span class="did">{truncateId(did)}</span>

    <span class="action txt-body-m-medium">
      View profile
      <Icon name="open-external" />
    </span>
  </div>
</div>
