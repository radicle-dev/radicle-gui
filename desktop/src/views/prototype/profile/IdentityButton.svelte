<script lang="ts">
  import type { Config } from "@bindings/config/Config";

  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import * as router from "@app/lib/router";
  import { didFromPublicKey, explorerHost, truncateDid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  import { imageSource, prototype } from "./store.svelte";

  interface Props {
    config: Config;
  }

  const { config }: Props = $props();

  let popoverExpanded: boolean = $state(false);
  let copyIcon: "copy" | "checkmark" = $state("copy");
  const restoreCopyIcon = debounce(() => {
    copyIcon = "copy";
  }, 1000);

  const activeRoute = router.activeRouteStore;
  const onProfile = $derived($activeRoute.resource === "prototype.profile");

  // Once a profile exists the name is a link to it, and the dropdown goes
  // away: everything in it lives on the profile page.
  const name = $derived(
    prototype.hasProfile
      ? prototype.profile.displayName || config.alias
      : config.alias,
  );
  const avatar = $derived(
    prototype.hasProfile ? imageSource(prototype.profile.avatar) : undefined,
  );

  let avatarBroken = $state(false);
  $effect(() => {
    void avatar;
    avatarBroken = false;
  });

  async function openProfile() {
    await router.push({ resource: "prototype.profile" });
  }

  async function startSetup() {
    closeFocused();
    await router.push({ resource: "prototype.profile" });
  }
</script>

<style>
  .avatar {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    overflow: hidden;
  }
  .avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* Picks up the brand colour of the nudge dot, so opening the dropdown lands
     on the thing the dot was pointing at. Ruled off from the list below, which
     is reference rather than action. */
  .setup-action {
    padding-bottom: 0.25rem;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  /* Marks the identity button while no profile has been published, so the
     dropdown is worth opening. */
  .nudge {
    margin-left: auto;
    width: 0.375rem;
    height: 0.375rem;
    flex-shrink: 0;
    border-radius: var(--border-radius-full);
    background-color: var(--color-surface-brand-secondary);
  }
</style>

{#if prototype.hasProfile}
  <Button
    variant="naked"
    styleWidth="100%"
    styleJustifyContent="flex-start"
    title="Your profile"
    active={onProfile}
    onclick={openProfile}>
    <span class="avatar">
      {#if avatar && !avatarBroken}
        <img src={avatar} alt="" onerror={() => (avatarBroken = true)} />
      {:else}
        <UserAvatar nodeId={config.publicKey} styleWidth="1rem" />
      {/if}
    </span>
    <span class="label">{name}</span>
  </Button>
{:else}
  <Popover placement="bottom-start" bind:expanded={popoverExpanded}>
    {#snippet toggle(onclick)}
      <Button
        variant="naked"
        styleWidth="100%"
        styleJustifyContent="flex-start"
        active={popoverExpanded}
        {onclick}>
        <UserAvatar nodeId={config.publicKey} styleWidth="1rem" />
        <span class="label">{name}</span>
        <span class="nudge" title="No profile yet"></span>
        <span class="label" style:color="var(--color-text-tertiary)">
          <Icon name={popoverExpanded ? "chevron-up" : "chevron-down"} />
        </span>
      </Button>
    {/snippet}
    {#snippet popover()}
      <div
        style:border="1px solid var(--color-border-subtle)"
        style:border-radius="var(--border-radius-md)"
        style:background-color="var(--color-surface-canvas)"
        style:padding="0.25rem">
        <div class="setup-action">
          <Button variant="secondary" styleWidth="100%" onclick={startSetup}>
            <Icon name="badge" />
            Set up profile
          </Button>
        </div>
        <DropdownListItem
          styleGap="0.5rem"
          styleWidth="100%"
          selected={false}
          onclick={async () => {
            await writeToClipboard(didFromPublicKey(config.publicKey));
            copyIcon = "checkmark";
            restoreCopyIcon();
            closeFocused();
          }}>
          <Icon name="avatar-incognito" />
          {truncateDid(config.publicKey)}
          <span style:margin-left="auto"><Icon name={copyIcon} /></span>
        </DropdownListItem>
        <a
          style:text-decoration="none"
          style:width="100%"
          onclick={closeFocused}
          href={entityUrl({ type: "node", nid: config.publicKey }, config)}
          target="_blank">
          <DropdownListItem
            styleGap="0.5rem"
            styleWidth="100%"
            selected={false}>
            <Icon name="seed" />
            Open in {explorerHost(config)}
            <span style:margin-left="auto"><Icon name="open-external" /></span>
          </DropdownListItem>
        </a>
      </div>
    {/snippet}
  </Popover>
{/if}
