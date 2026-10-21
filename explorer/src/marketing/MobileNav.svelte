<script lang="ts">
  import type { Route } from "@app/lib/router/definitions";

  import {
    activeUnloadedRouteStore,
    push,
    routeToPath,
    useDefaultNavigation,
  } from "@app/lib/router";

  import Footer from "./Footer.svelte";

  const installRoute: Route = { resource: "install", params: undefined };
  const learnRoute: Route = { resource: "learn", params: undefined };
  const exploreRoute: Route = { resource: "explore", params: undefined };

  let open = false;

  // Close the menu whenever the active route changes (e.g. after tapping a
  // nav card). Depends only on the route store, so toggling `open` doesn't
  // retrigger it.
  $: closeOnNavigation($activeUnloadedRouteStore);

  function closeOnNavigation(_route: Route) {
    open = false;
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
  .mobile-menu {
    display: none;
  }

  .mobile-menu-button {
    display: flex;
    width: 2.5rem;
    height: 2.5rem;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--border-radius-small);
    background: var(--color-surface-mid);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .mobile-menu-button:hover {
    opacity: 0.85;
  }

  .mobile-menu-icon {
    display: block;
    overflow: visible;
    transition: transform 0.2s ease;
    transform-origin: center;
  }

  .mobile-menu-icon circle {
    transition: transform 0.2s ease;
  }

  .mobile-menu-icon.open {
    transform: rotate(45deg);
  }

  .mobile-menu-icon.open .dot-left {
    transform: translateX(-1px);
  }

  .mobile-menu-icon.open .dot-right {
    transform: translateX(1px);
  }

  .mobile-menu-icon.open .dot-top {
    transform: translateY(-1px);
  }

  .mobile-menu-icon.open .dot-bottom {
    transform: translateY(1px);
  }

  .mobile-nav-overlay {
    position: fixed;
    top: var(--global-header-height);
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 90;
    background: var(--color-surface-base);
    padding: 1.5rem;
    overflow-y: auto;
  }

  .mobile-nav-content {
    min-height: calc(100dvh - var(--global-header-height) - 3rem);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 2rem;
  }

  .mobile-nav-main {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .mobile-nav-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border-radius: var(--border-radius-small);
    color: var(--color-text-primary);
    text-decoration: none;
    background: var(--color-surface-subtle);
    min-height: 7.5rem;
  }

  .mobile-nav-card:hover {
    opacity: 0.92;
  }

  .mobile-nav-card.install:not(.button):not(.product-link) {
    background: var(--color-accent-green-500);
    color: #0b0d12;
  }

  .mobile-nav-card.learn:not(.button):not(.product-link) {
    background: var(--color-accent-purple-500);
    color: #ffffff;
  }

  .mobile-nav-card.explore:not(.button):not(.product-link) {
    background: var(--color-accent-blue-500);
    color: #ffffff;
  }

  .mobile-nav-card.garden:not(.button):not(.product-link) {
    background: var(--color-accent-citrus-500);
    color: #0b0d12;
  }

  .mobile-nav-text {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .mobile-nav-title {
    font: var(--txt-bold-16);
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  .mobile-nav-description {
    font: var(--txt-medium-16);
    line-height: 1.3;
  }

  .mobile-nav-footer :global(.footer) {
    padding: 2rem 0 0;
    gap: 2rem;
    margin-top: 0;
  }

  .mobile-nav-footer :global(.footer-links) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  @media (max-width: 56rem) {
    .mobile-menu {
      display: inline-flex;
      align-items: center;
    }
  }

  :global(body:has(.mobile-nav-overlay)) {
    overflow: hidden;
  }
</style>

<div class="marketing mobile-menu">
  <button
    class="mobile-menu-button"
    type="button"
    aria-label={open ? "Close navigation menu" : "Open navigation menu"}
    aria-expanded={open}
    on:click={() => (open = !open)}>
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      class="mobile-menu-icon"
      class:open>
      <circle class="dot-left" cx="2" cy="8" r="2" fill="currentColor" />
      <circle class="dot-top" cx="8" cy="2" r="2" fill="currentColor" />
      <circle class="dot-center" cx="8" cy="8" r="2" fill="currentColor" />
      <circle class="dot-bottom" cx="8" cy="14" r="2" fill="currentColor" />
      <circle class="dot-right" cx="14" cy="8" r="2" fill="currentColor" />
    </svg>
  </button>

  {#if open}
    <nav class="mobile-nav-overlay" aria-label="Mobile navigation">
      <div class="mobile-nav-content">
        <ul class="mobile-nav-main">
          <li>
            <a
              href={routeToPath(installRoute)}
              class="mobile-nav-card install"
              on:click={e => onNav(e, installRoute)}>
              <div class="mobile-nav-text">
                <span class="mobile-nav-title">Install</span>
                <span class="mobile-nav-description">
                  Install Radicle CLI or download the desktop app.
                </span>
              </div>
            </a>
          </li>

          <li>
            <a
              href={routeToPath(learnRoute)}
              class="mobile-nav-card learn"
              on:click={e => onNav(e, learnRoute)}>
              <div class="mobile-nav-text">
                <span class="mobile-nav-title">Learn</span>
                <span class="mobile-nav-description">
                  Everything you need to get started with Radicle.
                </span>
              </div>
            </a>
          </li>

          <li>
            <a
              href={routeToPath(exploreRoute)}
              class="mobile-nav-card explore"
              on:click={e => onNav(e, exploreRoute)}>
              <div class="mobile-nav-text">
                <span class="mobile-nav-title">Explore</span>
                <span class="mobile-nav-description">
                  Browse projects, issues, and patches on the network.
                </span>
              </div>
            </a>
          </li>

          <li>
            <a
              href="https://radicle.garden"
              class="mobile-nav-card garden"
              target="_blank"
              rel="noopener noreferrer">
              <div class="mobile-nav-text">
                <span class="mobile-nav-title">Garden</span>
                <span class="mobile-nav-description">
                  An always-on hosted node that keeps your repositories
                  available 24/7.
                </span>
              </div>
            </a>
          </li>
        </ul>

        <div class="mobile-nav-footer">
          <Footer />
        </div>
      </div>
    </nav>
  {/if}
</div>
