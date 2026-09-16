<script lang="ts">
  import type { Profile } from "./store.svelte";

  import { didFromPublicKey, truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  import { imageSource } from "./store.svelte";

  interface Props {
    profile: Profile;
    nodeId: string;
    // What the name falls back to before one has been entered.
    fallbackName: string;
  }

  const { profile, nodeId, fallbackName }: Props = $props();

  const avatar = $derived(imageSource(profile.avatar));
  const did = $derived(didFromPublicKey(nodeId));

  let broken = $state(false);
  $effect(() => {
    void avatar;
    broken = false;
  });
</script>

<style>
  /* Inert: this shows the shape of the card other people see, not a working
     one. */
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .avatar {
    width: 3rem;
    height: 3rem;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
  }
  .avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .name {
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .full-name {
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bio {
    color: var(--color-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .did {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
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
  <div class="head">
    <span class="avatar">
      {#if avatar && !broken}
        <img src={avatar} alt="" onerror={() => (broken = true)} />
      {:else}
        <UserAvatar {nodeId} styleWidth="3rem" />
      {/if}
    </span>
    <span class="text">
      <span class="name txt-body-m-medium">
        {profile.displayName || fallbackName}
      </span>
      {#if profile.fullName.trim()}
        <span class="full-name txt-body-m-regular">{profile.fullName}</span>
      {/if}
    </span>
  </div>

  {#if profile.bio.trim()}
    <span class="bio txt-body-m-regular">{profile.bio}</span>
  {/if}

  <span class="did">{truncateId(did)}</span>

  <span class="action txt-body-m-medium">
    View profile
    <Icon name="open-external" />
  </span>
</div>
