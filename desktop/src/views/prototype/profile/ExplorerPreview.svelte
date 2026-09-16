<script lang="ts">
  import type { Profile } from "./store.svelte";
  import type { Config } from "@bindings/config/Config";

  import { entityUrl } from "@app/lib/mentions";
  import { didFromPublicKey, truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  import { boundKeys, imageSource } from "./store.svelte";

  interface Props {
    profile: Profile;
    nodeId: string;
    fallbackName: string;
    config: Config;
  }

  const { profile, nodeId, fallbackName, config }: Props = $props();

  const avatar = $derived(imageSource(profile.avatar));
  const banner = $derived(imageSource(profile.banner));
  // Every key bound to the actor is attributed to it, so the page lists them
  // all. A controller that is not bound never acts as the actor, so it gets
  // no row here.
  const keys = $derived(boundKeys());
  // Built from the configured explorer rather than a fixed host, so the
  // preview shows the address this node would actually link to.
  const url = $derived(entityUrl({ type: "node", nid: nodeId }, config));

  let avatarBroken = $state(false);
  $effect(() => {
    void avatar;
    avatarBroken = false;
  });

  const facts = $derived(
    [profile.pronouns, profile.location, profile.timezone].filter(Boolean),
  );

  function linkLabel(link: { url: string; label: string }): string {
    if (link.label.trim()) return link.label.trim();
    const value = link.url.trim();
    if (value.startsWith("mailto:")) return "Email";
    try {
      return new URL(value).host;
    } catch {
      return value;
    }
  }

  function linkValue(url: string): string {
    const value = url.trim();
    return value.startsWith("mailto:") ? value.slice("mailto:".length) : value;
  }
</script>

<style>
  .browser {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .chrome {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-tertiary);
  }
  .url {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--txt-code-regular);
  }
  /* Spans the page above the columns, which is the only place a wide image
     fits. */
  .banner {
    height: 6rem;
    overflow: hidden;
    background-color: var(--color-surface-subtle);
  }
  .banner img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* The identity column: everything the profile controls lands here. */
  .identity {
    display: flex;
    flex-direction: column;
  }
  .avatar {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background-color: var(--color-surface-subtle);
  }
  .avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .identity-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
  }
  .name-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .name {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .follow {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-secondary);
  }
  .full-name {
    color: var(--color-text-secondary);
  }
  .facts {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
    color: var(--color-text-secondary);
  }
  .separator {
    color: var(--color-text-quaternary);
  }
  .bio {
    color: var(--color-text-primary);
  }
  .about {
    color: var(--color-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
  }
  /* The existing page already uses this shape for the key rows, so links
     joining them keeps one pattern rather than inventing a second. */
  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-secondary);
  }
  .value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-tertiary);
    font: var(--txt-code-regular);
  }
</style>

<div class="browser">
  <div class="chrome">
    <Icon name="globe" />
    <span class="url">{url}</span>
  </div>

  {#if banner}
    <div class="banner"><img src={banner} alt="" /></div>
  {/if}

  <div class="identity">
    <div class="avatar">
      {#if avatar && !avatarBroken}
        <img src={avatar} alt="" onerror={() => (avatarBroken = true)} />
      {:else}
        <UserAvatar {nodeId} styleWidth="100%" />
      {/if}
    </div>

    <div class="identity-body">
      <div class="name-row">
        <span class="name">{profile.displayName || fallbackName}</span>
        <span class="follow txt-body-m-regular">
          <Icon name="plus" />
          Follow
        </span>
      </div>

      {#if profile.fullName.trim()}
        <span class="full-name txt-body-m-regular">{profile.fullName}</span>
      {/if}

      {#if facts.length > 0}
        <div class="facts txt-body-m-regular">
          {#each facts as fact, index (fact)}
            {#if index > 0}
              <span class="separator">·</span>
            {/if}
            <span>{fact}</span>
          {/each}
        </div>
      {/if}

      {#if profile.bio.trim()}
        <span class="bio txt-body-m-regular">{profile.bio}</span>
      {/if}

      {#if profile.readme.trim()}
        <span class="about txt-body-m-regular">{profile.readme}</span>
      {/if}

      <div class="rows">
        {#each profile.links as link (link.id)}
          <div class="row txt-body-m-regular">
            <span class="chip">
              <Icon name="link" />
              {linkLabel(link)}
            </span>
            <span class="value">{linkValue(link.url)}</span>
          </div>
        {/each}

        {#each keys as key (key.id)}
          <div class="row txt-body-m-regular">
            <span class="chip">
              <Icon name="key" />
              {key.alias}
            </span>
            <span class="value">{truncateId(didFromPublicKey(key.id))}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
