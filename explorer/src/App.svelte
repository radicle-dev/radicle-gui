<script lang="ts">
  import * as router from "@app/lib/router";
  import { unreachable } from "@app/lib/utils";

  import {
    codeFont,
    followSystemTheme,
    loadTheme,
    theme,
  } from "@app/lib/appearance";

  import FullscreenModalPortal from "./App/FullscreenModalPortal.svelte";
  import Hotkeys from "./App/Hotkeys.svelte";
  import LoadingBar from "./App/LoadingBar.svelte";

  import Commit from "@app/views/repos/Commit.svelte";
  import Explore from "@app/views/explore/View.svelte";
  import ExploreRepos from "@app/views/explore/ReposView.svelte";
  import History from "@app/views/repos/History.svelte";
  import Issue from "@app/views/repos/Issue.svelte";
  import Issues from "@app/views/repos/Issues.svelte";
  import Marketing from "@app/marketing/Marketing.svelte";
  import Nodes from "@app/views/nodes/View.svelte";
  import NotFound from "@app/views/NotFound.svelte";
  import Patch from "@app/views/repos/Patch.svelte";
  import Patches from "@app/views/repos/Patches.svelte";
  import Release from "@app/views/repos/Release.svelte";
  import Releases from "@app/views/repos/Releases.svelte";
  import Source from "@app/views/repos/Source.svelte";
  import Users from "@app/views/users/View.svelte";

  import Error from "@app/views/error/View.svelte";
  import Loading from "@app/components/Loading.svelte";

  const activeRouteStore = router.activeRouteStore;

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", ({ matches }) => {
      if ($followSystemTheme) {
        theme.set(matches ? "dark" : "light");
      }
    });

  // Detect any change to the system theme on first load.
  if ($followSystemTheme) {
    theme.set(loadTheme());
  }

  void router.loadFromLocation();

  $: document.documentElement.setAttribute("data-codefont", $codeFont);
  $: document.documentElement.setAttribute("data-theme", $theme);
  $: document.documentElement.setAttribute(
    "data-repo-view",
    $activeRouteStore.resource.startsWith("repo.") ? "true" : "false",
  );
</script>

<style>
  .loading {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    align-items: center;
  }
</style>

{#if $activeRouteStore.resource !== "booting"}
  <LoadingBar />
{/if}

<FullscreenModalPortal />
<Hotkeys />

{#if $activeRouteStore.resource === "booting"}
  <div class="loading" role="progressbar" aria-label="App loading">
    <Loading />
  </div>
{:else if $activeRouteStore.resource === "nodes"}
  <Nodes {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "explore"}
  <Explore {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "explore.repos"}
  <ExploreRepos {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "landing" || $activeRouteStore.resource === "learn" || $activeRouteStore.resource === "install" || $activeRouteStore.resource === "guides" || $activeRouteStore.resource === "desktop" || $activeRouteStore.resource === "cli" || $activeRouteStore.resource === "principles" || $activeRouteStore.resource === "docs"}
  <Marketing route={$activeRouteStore} />
{:else if $activeRouteStore.resource === "users"}
  <Users {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.source"}
  <Source {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.history"}
  <History {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.commit"}
  <Commit {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.issues"}
  <Issues {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.issue"}
  <Issue {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.patches"}
  <Patches {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.patch"}
  <Patch {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.releases"}
  <Releases {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "repo.release"}
  <Release {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "error"}
  <Error {...$activeRouteStore.params} />
{:else if $activeRouteStore.resource === "notFound"}
  <NotFound {...$activeRouteStore.params} />
{:else}
  {unreachable($activeRouteStore)}
{/if}
