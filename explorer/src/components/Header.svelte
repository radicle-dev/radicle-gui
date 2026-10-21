<script lang="ts" context="module">
  import type { BaseUrl } from "@http-client";

  import { HttpdClient } from "@http-client";

  // Cache of `searchAvailable` per seed so navigating within a seed (which
  // remounts the Header) doesn't refetch /info and flicker the search bar.
  const searchAvailableCache: Record<string, boolean> = {};

  function seedKey(baseUrl: BaseUrl): string {
    return `${baseUrl.scheme}://${baseUrl.hostname}:${baseUrl.port}`;
  }
</script>

<script lang="ts">
  import { activeRouteStore, homeRoute } from "@app/lib/router";
  import config from "@app/lib/config";
  import { isMobile } from "@app/lib/media";
  import { determineSeed, searchSeed } from "@app/views/nodes/SeedSelector";

  import Settings from "@app/App/Settings.svelte";
  import Help from "@app/App/Help.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Link from "@app/components/Link.svelte";
  import Logo from "@app/components/Logo.svelte";
  import Popover from "@app/components/Popover.svelte";
  import HeaderSearch from "@app/views/explore/HeaderSearch.svelte";
  import MobileNav from "@app/marketing/MobileNav.svelte";
  import RepoSearch from "@app/views/explore/RepoSearch.svelte";
  import SeedPicker from "@app/views/explore/SeedPicker.svelte";

  const isNodeHomepage = config.nodes.homepage === "node";
  const isLandingDeployment = config.nodes.homepage === "landing";
  $: hideLogo =
    isNodeHomepage && $activeRouteStore.resource.startsWith("repo.");
  $: isExplore =
    $activeRouteStore.resource === "explore" ||
    $activeRouteStore.resource === "explore.repos";
  // The marketing pages carry their own calls to action, so the header's
  // "Get started" button is hidden there.
  $: isMarketingRoute =
    $activeRouteStore.resource === "landing" ||
    $activeRouteStore.resource === "learn" ||
    $activeRouteStore.resource === "install" ||
    $activeRouteStore.resource === "guides" ||
    $activeRouteStore.resource === "desktop" ||
    $activeRouteStore.resource === "cli" ||
    $activeRouteStore.resource === "principles" ||
    $activeRouteStore.resource === "docs";
  // The explore and marketing routes both use the narrow, centered header
  // layout (fixed, constrained width, inline search) instead of the full-width
  // header used on repo and node views.
  $: isConstrainedHeader = isExplore || isMarketingRoute;

  // Seed selection lives in Settings now, so the header no longer shows a
  // general seed picker. It's kept only on error routes as an escape hatch to
  // a working node, using the route's node when known and otherwise falling
  // back to the currently selected seed, so the picker never disappears and
  // strand the page. (The notFound view renders its own inline picker, so it's
  // excluded here.)
  $: seedPickerBaseUrl =
    $activeRouteStore.resource === "error"
      ? ($activeRouteStore.params.baseUrl ?? determineSeed())
      : undefined;

  // Search always queries the stored search seed, regardless of which seed the
  // current page (e.g. a repo view) was served from.

  // The explore routes already resolved /info during load; reuse it, but only
  // when it describes the same seed we're about to search.
  $: routeSearchAvailable =
    ($activeRouteStore.resource === "explore" ||
      $activeRouteStore.resource === "explore.repos") &&
    seedKey($activeRouteStore.params.baseUrl) === seedKey($searchSeed)
      ? $activeRouteStore.params.searchAvailable
      : undefined;

  let searchAvailable = false;
  $: void resolveSearchAvailable($searchSeed, routeSearchAvailable);

  async function resolveSearchAvailable(
    seed: BaseUrl,
    known: boolean | undefined,
  ) {
    const key = seedKey(seed);
    if (known !== undefined) {
      searchAvailableCache[key] = known;
      searchAvailable = known;
      return;
    }
    if (key in searchAvailableCache) {
      searchAvailable = searchAvailableCache[key];
      return;
    }
    searchAvailable = false;
    try {
      const info = await new HttpdClient(seed).getInfo();
      searchAvailableCache[key] = info.httpd.searchAvailable;
    } catch {
      // Older nodes without /info (or an unreachable seed) have no search.
      searchAvailableCache[key] = false;
    }
    if (seedKey($searchSeed) === key) {
      searchAvailable = searchAvailableCache[key];
    }
  }

  // Inline bar only on the explore/marketing routes at desktop widths;
  // everywhere else (mobile, or a repo/node route) the search collapses into a
  // button.
  $: collapsedSearch = $isMobile || !isConstrainedHeader;
  // Search is offered on every route whose seed exposes the search backend;
  // `booting` renders no header at all, so it needs no explicit exclusion.
  $: showSearch = searchAvailable;
</script>

<style>
  .header-container {
    background-color: var(--color-surface-base);
    border-bottom: 1px solid var(--color-border-subtle);
    height: var(--global-header-height);
    width: 100%;
    position: relative;
    z-index: 200;
    /* Pin the header across navigations: giving it its own transition group
       lifts it out of the root snapshot so it stays put instead of fading and
       sliding with the page content (which briefly flashed the bar). Its named
       children still morph independently within it. */
    view-transition-name: header;
  }
  .header-container.fixed {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
  }
  .header-spacer {
    height: var(--global-header-height);
  }
  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    width: 100%;
    padding: 0 1rem;
    position: relative;
  }
  .header-inner.constrained {
    max-width: 86rem;
    margin: 0 auto;
    padding: 0 2rem;
  }
  .left-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 100%;
  }
  .left-divider {
    width: 1px;
    height: 1.25rem;
    background-color: var(--color-border-subtle);
  }
  .right-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .divider {
    height: 1px;
    width: 100%;
    background-color: var(--color-border-subtle);
  }
  .header-logo {
    display: inline-flex;
    align-items: center;
    view-transition-name: header-logo;
  }
  .get-started {
    text-decoration: none;
    view-transition-name: header-get-started;
  }
  .header-settings {
    display: inline-flex;
    align-items: center;
    view-transition-name: header-settings;
  }
  .header-search {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    width: clamp(18rem, 30vw, 34rem);
  }

  @media (max-width: 720px) {
    .get-started {
      display: none;
    }
    .header-inner.constrained {
      padding: 0 1rem;
    }
    /* The breadcrumbs (e.g. the node/repo trail on repo pages) are hidden on
       mobile for lack of space, so drop the divider that precedes them too. */
    .left-divider {
      display: none;
    }
  }
</style>

<div class="header-container" class:fixed={isConstrainedHeader}>
  <div class="header-inner" class:constrained={isConstrainedHeader}>
    <div class="left-section">
      {#if !hideLogo}
        <Link
          ariaLabel="Radicle"
          route={homeRoute()}
          style="height: 1rem; display: flex; align-items: center;">
          <span class="header-logo"><Logo /></span>
        </Link>
      {/if}
      {#if $$slots.breadcrumbs && !hideLogo}
        <div class="left-divider"></div>
      {/if}
      <slot name="breadcrumbs" />
    </div>

    {#if showSearch && !collapsedSearch}
      <div class="header-search">
        <RepoSearch baseUrl={$searchSeed} />
      </div>
    {/if}

    <div class="right-section">
      {#if showSearch && collapsedSearch}
        <HeaderSearch baseUrl={$searchSeed} />
      {/if}
      {#if seedPickerBaseUrl}
        <SeedPicker baseUrl={seedPickerBaseUrl} mode="node" />
      {/if}
      {#if isMarketingRoute}
        <span class="get-started">
          <Link route={{ resource: "install", params: undefined }}>
            <Button variant="foreground">Get started</Button>
          </Link>
        </span>
      {:else if isLandingDeployment}
        <span class="get-started">
          <Link route={{ resource: "install", params: undefined }}>
            <Button variant="outline">Get started</Button>
          </Link>
        </span>
      {:else}
        <a
          class="get-started"
          href="https://radicle.dev"
          target="_blank"
          rel="noreferrer">
          <Button variant="outline">Get started</Button>
        </a>
      {/if}
      <Popover
        popoverPositionTop="2.5rem"
        popoverPositionRight="0"
        popoverFullWidthOnMobile>
        <IconButton
          slot="toggle"
          let:toggle
          on:click={toggle}
          inline
          ariaLabel="Settings">
          <span class="header-settings"><Icon name="settings" /></span>
        </IconButton>

        <div
          slot="popover"
          style:display="flex"
          style:flex-direction="column"
          style:gap="0.75rem"
          style:align-items="stretch">
          <Settings />
          <div class="divider"></div>
          <Help />
        </div>
      </Popover>
      {#if isMarketingRoute}
        <MobileNav />
      {/if}
    </div>
  </div>
</div>
{#if isConstrainedHeader}
  <div class="header-spacer"></div>
{/if}
