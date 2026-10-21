<script lang="ts">
  import type { Route } from "@app/lib/router/definitions";

  import {
    activeUnloadedRouteStore,
    push,
    routeToPath,
    useDefaultNavigation,
  } from "@app/lib/router";

  const installRoute: Route = { resource: "install", params: undefined };
  const cliRoute: Route = { resource: "cli", params: undefined };
  const desktopRoute: Route = { resource: "desktop", params: undefined };
  const learnRoute: Route = { resource: "learn", params: undefined };

  const piRepoUrl =
    "https://radicle.network/nodes/hdh.radicle.garden/rad%3AzSM6rc7C18JjDxn4tj1r7PuP9QHc";
  const claudeRepoUrl =
    "https://radicle.network/nodes/seed.radicle.garden/rad:zvBj4kByGeQSrSy2c4H7fyK42cS8";
  const principlesRoute: Route = { resource: "principles", params: undefined };
  const guidesRoute: Route = { resource: "guides", params: undefined };
  const exploreRoute: Route = { resource: "explore", params: undefined };
  const glossaryRoute: Route = {
    resource: "docs",
    params: { page: "glossary" },
  };

  $: pathname = routeToPath($activeUnloadedRouteStore);

  // Only show a section's sub-nav while the viewer is within that section.
  $: installOpen = ["/install", "/cli", "/desktop"].includes(pathname);
  $: learnOpen =
    ["/learn", "/principles", "/glossary"].includes(pathname) ||
    pathname.startsWith("/guides");

  // Flag the document element only when a section actually opens or closes, so
  // the sub-nav unfurl gradient (see marketing.css) fires on expand/collapse
  // but not when navigating within an already-open section.
  let sidebarStateInitialised = false;
  let unfurlTimeout: ReturnType<typeof setTimeout>;
  $: flagSectionChange(installOpen, learnOpen);
  function flagSectionChange(_installOpen: boolean, _learnOpen: boolean) {
    if (!sidebarStateInitialised) {
      sidebarStateInitialised = true;
      return;
    }
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.add("sidebar-unfurling");
    clearTimeout(unfurlTimeout);
    unfurlTimeout = setTimeout(() => {
      document.documentElement.classList.remove("sidebar-unfurling");
    }, 500);
  }

  function onNav(event: MouseEvent, route: Route) {
    if (useDefaultNavigation(event)) {
      return;
    }
    event.preventDefault();
    void push(route);
  }
</script>

<style>
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6rem 1.5rem 1.5rem 2rem;
    gap: 1rem;
    overflow-y: auto;
    /* Pin the sidebar so it stays put while the main content fades and slides
       beneath it; only the active-indicator dot animates within it. */
    view-transition-name: marketing-sidebar;
  }

  .top-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .nav-section {
    display: flex;
    flex-direction: column;
  }

  .section-header {
    font: var(--txt-bold-16);
    letter-spacing: -0.005em;
    color: var(--color-text-tertiary);
    text-decoration: none;
    position: relative;
  }

  .section-header:hover {
    color: var(--color-text-secondary);
  }

  .section-header.active {
    color: var(--color-text-primary);
  }

  .nav-links {
    display: flex;
    flex-direction: column;
  }

  .nav-link {
    font: var(--txt-bold-16);
    letter-spacing: -0.005em;
    color: var(--color-text-tertiary);
    text-decoration: none;
    padding-left: 0.5rem;
    margin-top: 0.5rem;
    position: relative;
  }

  .nav-link:hover {
    color: var(--color-text-secondary);
  }

  .nav-link.active {
    color: var(--color-text-primary);
  }

  .external-links {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .external-link {
    font: var(--txt-bold-16);
    letter-spacing: -0.005em;
    color: var(--color-text-tertiary);
    text-decoration: none;
  }

  .external-link:hover {
    color: var(--color-text-secondary);
  }

  /* A single active-indicator dot lives inside whichever nav item is active.
     Its `view-transition-name` lets the browser morph it between positions as
     the active item changes across navigation (see marketing.css for the
     enter/exit slide). */
  .dot {
    position: absolute;
    top: 50%;
    margin-top: -2.5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background-color: var(--color-accent-blue-500);
    view-transition-name: sidebar-dot;
  }

  .section-header .dot {
    left: -0.75rem;
  }

  .nav-link .dot {
    left: -0.25rem;
  }
</style>

<aside class="sidebar">
  <nav class="top-section">
    <div class="nav-section" style="view-transition-name: install-section;">
      <a
        href={routeToPath(installRoute)}
        class="section-header"
        class:active={pathname === "/install"}
        on:click={e => onNav(e, installRoute)}>
        {#if pathname === "/install"}
          <span class="dot"></span>
        {/if}
        Install
      </a>
      {#if installOpen}
        <div class="nav-links">
          <a
            href={routeToPath(cliRoute)}
            class="nav-link"
            class:active={pathname === "/cli"}
            on:click={e => onNav(e, cliRoute)}>
            {#if pathname === "/cli"}
              <span class="dot"></span>
            {/if}
            CLI
          </a>
          <a
            href={routeToPath(desktopRoute)}
            class="nav-link"
            class:active={pathname === "/desktop"}
            on:click={e => onNav(e, desktopRoute)}>
            {#if pathname === "/desktop"}
              <span class="dot"></span>
            {/if}
            Desktop
          </a>
          <a
            href={piRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="nav-link arrow-link">
            Pi agent <span class="link-arrow link-arrow-up-right">↗</span>
          </a>
          <a
            href={claudeRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="nav-link arrow-link">
            Claude skill <span class="link-arrow link-arrow-up-right">↗</span>
          </a>
        </div>
      {/if}
    </div>

    <div class="nav-section" style="view-transition-name: learn-section;">
      <a
        href={routeToPath(learnRoute)}
        class="section-header"
        class:active={pathname === "/learn"}
        on:click={e => onNav(e, learnRoute)}>
        {#if pathname === "/learn"}
          <span class="dot"></span>
        {/if}
        Learn
      </a>
      {#if learnOpen}
        <div class="nav-links">
          <a
            href={routeToPath(principlesRoute)}
            class="nav-link"
            class:active={pathname === "/principles"}
            on:click={e => onNav(e, principlesRoute)}>
            {#if pathname === "/principles"}
              <span class="dot"></span>
            {/if}
            How it works
          </a>
          <a
            href={routeToPath(guidesRoute)}
            class="nav-link"
            class:active={pathname.startsWith("/guides")}
            on:click={e => onNav(e, guidesRoute)}>
            {#if pathname.startsWith("/guides")}
              <span class="dot"></span>
            {/if}
            Guides
          </a>
          <a
            href={routeToPath(glossaryRoute)}
            class="nav-link"
            class:active={pathname === "/glossary"}
            on:click={e => onNav(e, glossaryRoute)}>
            {#if pathname === "/glossary"}
              <span class="dot"></span>
            {/if}
            Glossary
          </a>
        </div>
      {/if}
    </div>

    <div class="external-links" style="view-transition-name: sidebar-external;">
      <a
        href={routeToPath(exploreRoute)}
        class="external-link arrow-link"
        on:click={e => onNav(e, exploreRoute)}>
        Explore <span class="link-arrow link-arrow-right">→</span>
      </a>
      <a
        href="https://radicle.garden"
        target="_blank"
        rel="noopener noreferrer"
        class="external-link arrow-link">
        Garden <span class="link-arrow link-arrow-up-right">↗</span>
      </a>
    </div>
  </nav>
</aside>
