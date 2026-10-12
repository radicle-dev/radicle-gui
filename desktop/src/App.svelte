<script lang="ts">
  import type { Config } from "@bindings/config/Config";
  import type { ErrorWrapper } from "@bindings/error/ErrorWrapper";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { onDestroy, onMount } from "svelte";
  import { get } from "svelte/store";

  import {
    decreaseFontSize,
    fontSettings,
    increaseFontSize,
    resetFontSize,
  } from "@app/lib/appearance.svelte";
  import { checkAuth, startup } from "@app/lib/auth.svelte";
  import { deepLinksReady, listenForDeepLinks } from "@app/lib/deepLink";
  import { dynamicInterval } from "@app/lib/interval";
  import { invoke } from "@app/lib/invoke";
  import { hide, modalStore, show, toggle } from "@app/lib/modal";
  import * as router from "@app/lib/router";
  import { isLoadedRepoRoute } from "@app/lib/router/definitions";
  import { listenForShortcuts, useShortcuts } from "@app/lib/shortcuts.svelte";
  import {
    createEventEmittersOnce,
    setUnlistenNodeEvents,
    unlistenNodeEvents,
  } from "@app/lib/startup.svelte";
  import { unreachable } from "@app/lib/utils";
  import { dragWindow } from "@app/lib/window";

  import AppSidebar from "@app/components/AppSidebar.svelte";
  import { codeFont } from "@app/components/CodeFontSwitch.svelte";
  import {
    followSystemTheme,
    loadTheme,
    theme,
  } from "@app/components/ThemeSwitch.svelte";
  import CreateIssueModal from "@app/modals/CreateIssue.svelte";
  import GuideView from "@app/modals/Guide.svelte";
  import KeyboardShortcutsModal from "@app/modals/KeyboardShortcuts.svelte";
  import SettingsView from "@app/modals/Settings.svelte";
  import Auth from "@app/views/auth/Auth.svelte";
  import CreateIdentity from "@app/views/auth/CreateIdentity.svelte";
  import InboxView from "@app/views/Inbox.svelte";
  import Identity from "@app/views/repo/Identity.svelte";
  import Issue from "@app/views/repo/Issue.svelte";
  import Issues from "@app/views/repo/Issues.svelte";
  import Patch from "@app/views/repo/Patch.svelte";
  import Patches from "@app/views/repo/Patches.svelte";
  import Release from "@app/views/repo/Release.svelte";
  import Releases from "@app/views/repo/Releases.svelte";
  import RepoCommit from "@app/views/repo/RepoCommit.svelte";
  import RepoCommits from "@app/views/repo/RepoCommits.svelte";
  import RepoHome from "@app/views/repo/RepoHome.svelte";

  import Command from "./components/Command.svelte";
  import ExternalLink from "./components/ExternalLink.svelte";
  import FullscreenModalPortal from "./components/FullscreenModalPortal.svelte";
  import FullWindowError from "./components/FullWindowError.svelte";

  const activeRouteStore = router.activeRouteStore;

  const activeRepo = $derived.by((): RepoInfo | undefined => {
    const route = $activeRouteStore;
    return isLoadedRepoRoute(route) ? route.params.repo : undefined;
  });

  function modalHasTextEntry(): boolean {
    return (
      document.querySelector(
        "[data-modal-content] :is(textarea, [contenteditable='true'], input:not([type='checkbox'], [type='radio'], [type='range'], [type='button']))",
      ) !== null
    );
  }

  onMount(listenForShortcuts);

  useShortcuts(
    {
      shortcut: "help",
      allowInModal: true,
      run: () => {
        // Only toggle our own modal, so an open modal isn't replaced from
        // under the user.
        const open = $modalStore?.component;
        if (open !== undefined && open !== KeyboardShortcutsModal) {
          return false;
        }
        toggle({ component: KeyboardShortcutsModal, props: {} });
      },
    },
    {
      shortcut: "newIssue",
      enabled: () => activeRepo !== undefined,
      run: () => {
        if (activeRepo) {
          show({ component: CreateIssueModal, props: { repo: activeRepo } });
        }
      },
    },
    {
      shortcut: "back",
      run: () => {
        if (get(router.canGoBack)) {
          window.history.back();
        }
      },
    },
    {
      shortcut: "forward",
      run: () => {
        if (get(router.canGoForward)) {
          window.history.forward();
        }
      },
    },
    {
      shortcut: "reload",
      allowInModal: true,
      run: () => {
        // A reload would throw away whatever is being composed in a modal.
        if (!modalHasTextEntry()) {
          // Matches the sidebar's reload button rather than re-fetching per
          // route.
          window.location.reload();
        }
      },
    },
    {
      shortcut: "settings",
      allowInModal: true,
      run: () => toggle({ component: SettingsView, props: {} }),
    },
    {
      shortcut: "increaseFontSize",
      allowInModal: true,
      run: increaseFontSize,
    },
    {
      shortcut: "decreaseFontSize",
      allowInModal: true,
      run: decreaseFontSize,
    },
    {
      shortcut: "resetFontSize",
      allowInModal: true,
      run: resetFontSize,
    },
    {
      shortcut: "closeModal",
      allowInModal: true,
      enabled: () => $modalStore !== undefined,
      run: hide,
    },
  );

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", ({ matches }) => {
      if (get(followSystemTheme)) {
        theme.set(matches ? "dark" : "light");
      }
    });

  if (get(followSystemTheme)) {
    theme.set(loadTheme());
  }

  let profile = $state<Config>();

  $effect(() => {
    if ($activeRouteStore.resource !== "booting" || startup.error) {
      document.getElementById("loading")?.remove();
    }
  });

  onMount(async () => {
    try {
      profile = await invoke<Config>("startup");
    } catch (err) {
      startup.error = err as ErrorWrapper;
      return;
    }

    setUnlistenNodeEvents(await createEventEmittersOnce());

    void listenForDeepLinks();
    try {
      await invoke("authenticate");
      void router.loadFromLocation().finally(deepLinksReady);
      dynamicInterval(
        "auth",
        checkAuth,
        import.meta.env.VITE_AUTH_LONG_DELAY || 30_000,
      );
    } catch (err) {
      startup.error = err as ErrorWrapper;
      void router.push({ resource: "booting" });
      dynamicInterval("auth", checkAuth, 5_000);
    }
  });

  onDestroy(() => {
    if (unlistenNodeEvents) {
      unlistenNodeEvents();
    }
  });

  $effect(() =>
    document.documentElement.style.setProperty(
      "--font-size",
      `${fontSettings.size}px`,
    ),
  );
  $effect(() => document.documentElement.setAttribute("data-theme", $theme));
  $effect(() =>
    document.documentElement.setAttribute("data-codefont", $codeFont),
  );
</script>

<style>
  .layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }
  .content-pane {
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }
</style>

<svelte:document onmousedown={dragWindow} />
<FullscreenModalPortal />

{#if $activeRouteStore.resource === "booting"}
  {#if startup.error?.code === "IdentityError.MissingProfile"}
    <CreateIdentity />
  {:else if startup.error?.code === "PassphraseError.InvalidPassphrase" && profile}
    <Auth profile={{ did: profile.publicKey, alias: profile.alias }} />
  {:else if startup.error}
    <FullWindowError title="An error occurred" error={startup.error}>
      We were unable to load your Radicle identity, or your Radicle installation
      is outdated.
      <br />
      If you have an existing Radicle installation, make sure you have
      <ExternalLink href="https://radicle.dev/download">
        the latest version.
      </ExternalLink>
      <br />
      <br />
      <div
        style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
        To migrate your Radicle storage, make sure to restart your radicle-node
        or run:
        <Command styleWidth="30rem" command="rad cob migrate" />
      </div>
    </FullWindowError>
  {/if}
{:else}
  <div class="layout">
    <AppSidebar
      sidebarData={$activeRouteStore.params.sidebarData}
      {activeRepo} />
    <div class="content-pane">
      {#if $activeRouteStore.resource === "inbox"}
        <InboxView {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "guide"}
        <GuideView {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.home"}
        <RepoHome {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.commits"}
        <RepoCommits {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.commit"}
        <RepoCommit {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.identity"}
        <Identity {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.issue"}
        <Issue {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.issues"}
        <Issues {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.patch"}
        <Patch {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.patches"}
        <Patches {...$activeRouteStore.params} />
      {:else if $activeRouteStore.resource === "repo.release"}
        {#key $activeRouteStore.params.release.id}
          <Release {...$activeRouteStore.params} />
        {/key}
      {:else if $activeRouteStore.resource === "repo.releases"}
        <Releases {...$activeRouteStore.params} />
      {:else}
        {unreachable($activeRouteStore)}
      {/if}
    </div>
  </div>
{/if}
