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

  import JoinActor from "./JoinActor.svelte";
  import Keys from "./Keys.svelte";
  import Notice from "./Notice.svelte";
  import ProfileForm from "./ProfileForm.svelte";

  interface Props {
    sidebarData: SidebarData;
    tab: ProfileTab;
  }

  const { sidebarData, tab }: Props = $props();
  const actor = $derived(sidebarData.actor);
  const localDid = $derived(didFromPublicKey(sidebarData.config.publicKey));

  const tabs = $derived<
    {
      value: ProfileTab;
      label: string;
      icon: ComponentProps<typeof Icon>["name"];
      count?: number;
    }[]
  >([
    { value: "profile", label: "Profile", icon: "badge" },
    { value: "keys", label: "Keys", icon: "key", count: actor?.keys.length },
  ]);

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
  <div class="empty">
    <div class="inner">
      <Notice
        icon="warning"
        title={error.code === "ActorError.Ambiguous"
          ? "More than one profile binds this key"
          : "Could not load the profile"}>
        <span class="txt-body-m-regular">{error.message}</span>
        {#if error.code === "ActorError.Ambiguous"}
          <span class="txt-body-m-regular">
            Revoke this key from one of those profiles, from a machine whose key
            controls it.
          </span>
        {/if}
      </Notice>
    </div>
  </div>
{/snippet}

{#snippet missing(text: string)}
  <div class="txt-missing txt-body-m-regular global-flex" style:gap="0.25rem">
    <Icon name="none" />
    {text}
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
          <span class="actor-label txt-body-m-regular">
            {actor.kind === "agent" ? "Agent" : "Person"}
          </span>

          <CopyableId id={actor.rid} styleFont="var(--txt-body-m-regular)">
            {actor.rid}
          </CopyableId>

          <Button
            variant="ghost"
            title="The identity document of the actor repository"
            onclick={() =>
              router.push({ resource: "repo.identity", rid: actor.rid })}>
            <Icon name="code" />
            Identity
          </Button>
        </div>
      {/if}
    </Topbar>

    <div class="body">
      {#if sidebarData.actorError}
        {@render failed(sidebarData.actorError)}
      {:else if tab === "profile"}
        {#if actor || editing}
          <ScrollArea style="height: 100%; min-width: 0;">
            <div class="inner">
              <ProfileForm
                {actor}
                {localDid}
                alias={sidebarData.config.alias}
                oncancel={() => (editing = false)} />
            </div>
          </ScrollArea>
        {:else if joining}
          <div class="empty">
            <JoinActor
              publicKey={sidebarData.config.publicKey}
              oncancel={() => (joining = false)} />
          </div>
        {:else}
          <div class="empty">
            {@render missing("You have no profile yet.")}

            <div class="global-flex" style:gap="0.5rem">
              <Button
                variant="outline"
                bordered
                onclick={() => (joining = true)}>
                <Icon name="key" />
                Join an existing profile
              </Button>

              <Button variant="secondary" onclick={() => (editing = true)}>
                <Icon name="badge" />
                Create profile
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
          {@render missing("No keys linked to your profile yet.")}
        </div>
      {/if}
    </div>
  </div>
</Layout>
