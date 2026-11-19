<script lang="ts">
  import type { Form } from "./form";

  import UserAvatar from "@radicle-gui/ui/components/UserAvatar.svelte";

  import { publicKeyFromDid, truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    form: Form;
    avatar: string | undefined;
    banner: string | undefined;
    // What the generated avatar is drawn from when there is no picture.
    avatarId: string;
    // The keys whose work Explorer credits to the profile.
    keys: { did: string; alias?: string }[];
    url: string | undefined;
  }

  const { form, avatar, banner, avatarId, keys, url }: Props = $props();

  let avatarBroken = $state(false);
  let bannerBroken = $state(false);
  $effect(() => {
    void avatar;
    avatarBroken = false;
  });
  $effect(() => {
    void banner;
    bannerBroken = false;
  });

  const facts = $derived(
    [form.pronouns, form.location, form.timezone]
      .map(fact => fact.trim())
      .filter(Boolean),
  );
  const links = $derived(form.links.filter(link => link.url.trim()));

  function linkLabel(link: { url: string; label?: string }): string {
    if (link.label?.trim()) return link.label.trim();
    const value = link.url.trim();
    if (value.startsWith("mailto:")) return "Email";
    try {
      return new URL(value).host || value;
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
  /* Across the top, as profile pages usually have one. */
  .banner {
    height: 5rem;
    overflow: hidden;
    background-color: var(--color-surface-subtle);
  }
  .banner img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0.875rem 0.875rem 0;
  }
  /* With a banner, the avatar overlaps its bottom-left edge. */
  .banner + .head {
    margin-top: -2rem;
    padding-top: 0;
  }
  .avatar {
    width: 4rem;
    height: 4rem;
    overflow: hidden;
    border: 3px solid var(--color-surface-canvas);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
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
    gap: 0.625rem;
    padding: 0.5rem 0.875rem 0.875rem;
  }
  .name {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .name.empty {
    color: var(--color-text-tertiary);
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
  .full-name,
  .facts {
    color: var(--color-text-secondary);
  }
  .facts {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .separator {
    color: var(--color-text-quaternary);
  }
  .bio {
    color: var(--color-text-primary);
    overflow-wrap: anywhere;
  }
  /* The page lists keys this way already, so links share the shape. */
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
    <span class="url">{url ?? "Explorer"}</span>
  </div>

  {#if banner && !bannerBroken}
    <div class="banner">
      <img src={banner} alt="" onerror={() => (bannerBroken = true)} />
    </div>
  {/if}

  <div class="head">
    <div class="avatar">
      {#if avatar && !avatarBroken}
        <img src={avatar} alt="" onerror={() => (avatarBroken = true)} />
      {:else}
        <UserAvatar nodeId={avatarId} styleWidth="100%" />
      {/if}
    </div>
    <span class="follow txt-body-m-regular">
      <Icon name="plus" />
      Follow
    </span>
  </div>

  <div class="body">
    <span class="name" class:empty={!form.displayName.trim()}>
      {form.displayName.trim() || "Display name"}
    </span>

    {#if form.fullName.trim()}
      <span class="full-name txt-body-m-regular">{form.fullName}</span>
    {/if}

    {#if facts.length > 0}
      <div class="facts txt-body-m-regular">
        {#each facts as fact, index (index)}
          {#if index > 0}
            <span class="separator">·</span>
          {/if}
          <span>{fact}</span>
        {/each}
      </div>
    {/if}

    {#if form.bio.trim()}
      <span class="bio txt-body-m-regular">{form.bio}</span>
    {/if}

    <div class="rows">
      {#each links as link (link.id)}
        <div class="row txt-body-m-regular">
          <span class="chip">
            <Icon name="link" />
            {linkLabel(link)}
          </span>
          <span class="value">{linkValue(link.url)}</span>
        </div>
      {/each}

      {#each keys as key (key.did)}
        <div class="row txt-body-m-regular">
          <span class="chip">
            <Icon name="key" />
            {key.alias ?? "Unnamed"}
          </span>
          <span class="value">{truncateId(publicKeyFromDid(key.did))}</span>
        </div>
      {/each}
    </div>
  </div>
</div>
