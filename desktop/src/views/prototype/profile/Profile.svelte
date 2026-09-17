<script lang="ts">
  import { untrack } from "svelte";

  import { show } from "@app/lib/modal";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { explorerHost } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import Layout from "@app/views/repo/Layout.svelte";

  import EditProfile from "./EditProfile.svelte";
  import EnrollKey from "./EnrollKey.svelte";
  import ExplorerPreview from "./ExplorerPreview.svelte";
  import HoverCard from "./HoverCard.svelte";
  import Keys from "./Keys.svelte";
  import RecoveryKey from "./RecoveryKey.svelte";
  import {
    ACTOR_RID,
    clearProfile,
    clearPrototypeAction,
    controllers,
    pendingApprovals,
    prototype,
    prototypeActions,
    ratify,
    reset,
    setPrototypeAction,
  } from "./store.svelte";
  import { seed } from "./store.svelte";

  interface Props {
    sidebarData: SidebarData;
  }

  const { sidebarData }: Props = $props();

  type Tab = "profile" | "keys";
  // Your profile is never a page of its own to anyone else, so the preview
  // shows the two places it actually surfaces.
  type Surface = "card" | "explorer";

  let tab = $state<Tab>("profile");
  let surface = $state<Surface>("card");

  $effect(() => {
    seed(sidebarData.config.publicKey, sidebarData.config.alias);
  });

  const tabs = $derived<{ value: Tab; label: string; count?: number }[]>([
    { value: "profile", label: "Profile" },
    { value: "keys", label: "Keys", count: prototype.keys.length },
  ]);

  // The form edits a draft, and the preview shows that draft, so what you see
  // is what saving would publish.
  let draft = $state(structuredClone($state.snapshot(prototype.profile)));

  // Reseeded whenever the stored profile changes underneath, which happens on
  // save, on reset, and when an approval applies.
  let lastStored = $state(JSON.stringify($state.snapshot(prototype.profile)));
  $effect(() => {
    const stored = JSON.stringify($state.snapshot(prototype.profile));
    if (stored !== lastStored) {
      lastStored = stored;
      draft = structuredClone($state.snapshot(prototype.profile));
    }
  });

  // Signing as one of the other keys is the one thing a single machine cannot
  // really do, so it lives in the prototype panel whenever something is
  // waiting.
  $effect(() => {
    const next = pendingApprovals()[0];
    // Untracked: the registry is state this effect writes, and reading it here
    // would make the effect depend on its own output.
    untrack(() => {
      if (next) {
        setPrototypeAction("approve", "Sign as another key", () =>
          ratify(next.id),
        );
      } else {
        clearPrototypeAction("approve");
      }
    });
    return () => untrack(() => clearPrototypeAction("approve"));
  });

  const thresholdChoices = $derived(
    Array.from({ length: Math.max(1, controllers().length) }, (_, i) => i + 1),
  );

  function showChanges() {
    tab = "keys";
  }

  function openEnrollment() {
    show({
      component: EnrollKey,
      props: { onproposed: showChanges },
    });
  }

  function openRecovery() {
    show({
      component: RecoveryKey,
      props: { onproposed: showChanges },
    });
  }

  function resetAll() {
    reset();
    tab = "profile";
  }

  function startFirstRun() {
    clearProfile();
    tab = "profile";
  }
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    padding: 0.25rem 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .filter:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .filter.active {
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
  /* Marks the surface as a prototype and carries the switches that stand in
     for state the backend does not have yet. */
  .scenario {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    /* Above the modal portal at 300, so these stay reachable while a modal
       is open. */
    z-index: 400;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .scenario-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
  }
  .scenario-label {
    color: var(--color-text-tertiary);
  }
  .scenario-group {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .steps {
    display: flex;
    align-items: center;
  }
  .inner {
    width: min(100%, 52rem);
    transition: width 0.15s ease;
    margin: 0 auto;
    padding: 1.5rem 1.5rem 7rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .inner.wide {
    width: min(100%, 68rem);
  }
  .columns {
    display: flex;
    align-items: flex-start;
    gap: 2rem;
  }
  .preview-column {
    position: sticky;
    top: 0;
    width: 19rem;
    flex-shrink: 0;
  }
  .form-column {
    flex: 1;
    min-width: 0;
  }
  /* Below this the preview stops earning its column. */
  @media (max-width: 66rem) {
    .columns {
      flex-direction: column;
    }
    .preview-column {
      position: static;
      width: 100%;
      max-width: 22rem;
    }
  }
  .surfaces {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .surface-switch {
    display: flex;
    align-items: center;
  }
  .surface-note {
    color: var(--color-text-secondary);
  }
</style>

<Layout selfScroll>
  <div class="page">
    <Topbar>
      <div class="filters">
        {#each tabs as item (item.value)}
          <button
            type="button"
            class="filter"
            class:active={tab === item.value}
            onclick={() => (tab = item.value)}>
            {item.label}
            {#if item.count}
              <span class="global-counter-badge">{item.count}</span>
            {/if}
          </button>
        {/each}
      </div>
      <div class="topbar-end">
        <span class="actor-label txt-body-m-regular">Actor</span>
        <CopyableId id={ACTOR_RID} styleFont="var(--txt-body-m-regular)">
          {ACTOR_RID}
        </CopyableId>
      </div>
    </Topbar>

    <div class="scenario">
      <span class="scenario-tag txt-body-m-medium">
        <Icon name="lightbulb" />
        Prototype
      </span>

      <div class="scenario-group">
        <span class="scenario-label txt-body-m-regular">Profile threshold</span>
        <div class="steps">
          {#each thresholdChoices as option, index (option)}
            <Button
              variant="ghost"
              styleHeight="1.75rem"
              flatLeft={index > 0}
              flatRight={index < thresholdChoices.length - 1}
              active={prototype.threshold === option}
              styleJustifyContent="center"
              onclick={() => (prototype.threshold = option)}>
              {option}
            </Button>
          {/each}
        </div>
      </div>

      <div class="scenario-group">
        <Button
          variant="ghost"
          styleHeight="1.75rem"
          title="Show the state of a node that has published no profile"
          onclick={startFirstRun}>
          First run
        </Button>
      </div>

      {#each prototypeActions as action (action.id)}
        <div class="scenario-group">
          <Button
            variant="secondary"
            styleHeight="1.75rem"
            onclick={action.run}>
            {action.label}
          </Button>
        </div>
      {/each}

      <div class="scenario-group">
        <Button variant="outline" styleHeight="1.75rem" onclick={resetAll}>
          <Icon name="refresh" />
          Reset
        </Button>
      </div>
    </div>

    <ScrollArea style="height: 100%; min-width: 0;">
      <div class="inner" class:wide={tab === "profile"}>
        {#if tab === "profile"}
          <div class="columns">
            <aside class="preview-column">
              <div class="surfaces">
                <div class="surface-switch">
                  <Button
                    variant="ghost"
                    flatRight
                    active={surface === "card"}
                    onclick={() => (surface = "card")}>
                    Hover card
                  </Button>
                  <Button
                    variant="ghost"
                    flatLeft
                    active={surface === "explorer"}
                    onclick={() => (surface = "explorer")}>
                    Explorer
                  </Button>
                </div>

                {#if surface === "card"}
                  <span class="surface-note txt-body-m-regular">
                    Shown when someone hovers your name in the app.
                  </span>
                  <HoverCard
                    profile={draft}
                    nodeId={prototype.thisKeyId}
                    fallbackName={prototype.alias} />
                {:else}
                  <span class="surface-note txt-body-m-regular">
                    Your profile on {explorerHost(sidebarData.config)}.
                  </span>
                  <ExplorerPreview
                    profile={draft}
                    nodeId={prototype.thisKeyId}
                    fallbackName={prototype.alias}
                    config={sidebarData.config} />
                {/if}
              </div>
            </aside>
            <div class="form-column">
              <EditProfile bind:draft onproposed={showChanges} />
            </div>
          </div>
        {:else}
          <Keys
            onenroll={openEnrollment}
            onrecovery={openRecovery}
            onproposed={showChanges} />
        {/if}
      </div>
    </ScrollArea>
  </div>
</Layout>
