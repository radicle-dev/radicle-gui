<script lang="ts">
  import type { ComponentProps } from "svelte";

  import * as router from "@app/lib/router";
  import type { ProfileTab, SidebarData } from "@app/lib/router/definitions";
  import { didFromPublicKey } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import Layout from "@app/views/repo/Layout.svelte";

  import { createActor } from "./actor";
  import JoinActor from "./JoinActor.svelte";
  import Keys from "./Keys.svelte";
  import Notice from "./Notice.svelte";
  import ProfileForm from "./ProfileForm.svelte";
  import SeveralProfiles from "./SeveralProfiles.svelte";

  interface Props {
    sidebarData: SidebarData;
    tab: ProfileTab;
  }

  const { sidebarData, tab }: Props = $props();
  const current = createActor(() => sidebarData);
  const actor = $derived(current.actor);
  const localDid = $derived(didFromPublicKey(sidebarData.config.publicKey));

  const tabs = $derived<
    {
      value: ProfileTab;
      label: string;
      icon: ComponentProps<typeof Icon>["name"];
      count?: number;
    }[]
  >([
    { value: "profile", label: "Profile", icon: "avatar-incognito" },
    { value: "keys", label: "Keys", icon: "key", count: actor?.keys.length },
  ]);

  // The user may well have a profile on another device, so this speaks only
  // of this one.
  const NO_PROFILE = "This device has no profile yet.";

  let editing = $state(false);
  let joining = $state(false);

  // A profile that arrives while the form is up, as after a create, ends the
  // choice.
  $effect(() => {
    if (actor) {
      editing = false;
      joining = false;
    }
  });
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .tab:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .tab.active {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .topbar-end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .actor-label {
    color: var(--color-text-tertiary);
  }
  .chip {
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .body {
    flex: 1;
    min-height: 0;
  }
  .inner {
    width: min(100%, 52rem);
    margin: 0 auto;
    padding: 1.5rem 1.5rem 7rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  /* Room for the preview beside the form. */
  .inner.wide {
    width: min(100%, 68rem);
  }
  .missing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
    color: var(--color-text-secondary);
  }
  .missing-icon {
    display: flex;
    margin-bottom: 0.5rem;
    color: var(--color-text-tertiary);
  }
  .missing-title {
    color: var(--color-text-primary);
  }
  .empty {
    display: flex;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }
</style>

{#snippet failed(error: { code: string; message: string })}
  {#if error.code === "ActorError.Ambiguous"}
    <ScrollArea style="height: 100%; min-width: 0;">
      <div class="inner">
        <SeveralProfiles {localDid} message={error.message} />
      </div>
    </ScrollArea>
  {:else}
    <div class="empty">
      <div class="inner">
        <Notice icon="warning" tone="error" title="Could not load the profile">
          <span class="txt-body-m-regular">{error.message}</span>
        </Notice>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet missing(text: string)}
  <div class="missing">
    <span class="missing-icon"><Icon name="avatar-incognito" size="32" /></span>
    <span class="missing-title txt-body-l-medium">{text}</span>
    <span class="txt-body-m-regular">
      A profile ties your devices together under one name.
    </span>
  </div>
{/snippet}

<Layout selfScroll>
  <div class="page">
    <Topbar>
      <div class="tabs">
        {#each tabs as t (t.value)}
          <a
            class="tab"
            class:active={tab === t.value}
            href={router.routeToPath({ resource: "profile", tab: t.value })}>
            <Icon name={t.icon} />
            {t.label}
            {#if t.count}
              <span class="global-counter-badge">{t.count}</span>
            {/if}
          </a>
        {/each}
      </div>

      {#if actor}
        <div class="topbar-end">
          {#if actor.kind === "agent"}
            <span class="chip txt-body-m-regular">Automated agent</span>
          {/if}

          <span class="actor-label txt-body-m-regular">Profile ID</span>

          <CopyableId id={actor.rid} styleFont="var(--txt-body-m-regular)">
            {actor.rid}
          </CopyableId>

          <Button
            variant="ghost"
            title="The identity document of this profile"
            onclick={() =>
              router.push({ resource: "repo.identity", rid: actor.rid })}>
            <Icon name="code" />
            Identity
          </Button>
        </div>
      {/if}
    </Topbar>

    <div class="body">
      {#if current.actorError}
        {@render failed(current.actorError)}
      {:else if tab === "profile"}
        {#if actor || editing}
          <ScrollArea style="height: 100%; min-width: 0;">
            <div class="inner wide">
              <ProfileForm
                {actor}
                {localDid}
                config={sidebarData.config}
                oncancel={() => (editing = false)} />
            </div>
          </ScrollArea>
        {:else if joining}
          <div class="empty">
            <JoinActor
              publicKey={sidebarData.config.publicKey}
              alias={sidebarData.config.alias}
              oncancel={() => (joining = false)} />
          </div>
        {:else}
          <div class="empty">
            {@render missing(NO_PROFILE)}

            <div
              class="global-flex"
              style:gap="0.5rem"
              style:margin-top="0.5rem">
              <Button
                variant="outline"
                bordered
                onclick={() => (joining = true)}>
                Join existing profile
              </Button>

              <Button variant="secondary" onclick={() => (editing = true)}>
                Create a new profile
              </Button>
            </div>
          </div>
        {/if}
      {:else if actor}
        <ScrollArea style="height: 100%; min-width: 0;">
          <div class="inner">
            <Keys {actor} {localDid} />
          </div>
        </ScrollArea>
      {:else}
        <div class="empty">
          {@render missing(NO_PROFILE)}
        </div>
      {/if}
    </div>
  </div>
</Layout>
