<script lang="ts">
  import AgentCards from "@app/marketing/AgentCards.svelte";
  import CopyCommand from "@app/marketing/CopyCommand.svelte";
  import DownloadPanel from "@app/marketing/DownloadPanel.svelte";
  import Meta from "@app/marketing/Meta.svelte";
  import PlatformBadges from "@app/marketing/PlatformBadges.svelte";
  import { link } from "@app/marketing/link";
  import { slide } from "svelte/transition";

  let showDownloads = false;

  function toggleDownloads() {
    showDownloads = !showDownloads;
  }

  function handleDesktopAction() {
    if (window.matchMedia("(max-width: 64rem)").matches) {
      const installUrl = `${window.location.origin}/install`;
      const subject = encodeURIComponent("Install Radicle Desktop");
      const body = encodeURIComponent(
        `Open this page on your desktop:\n\n${installUrl}`,
      );
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
      return;
    }

    toggleDownloads();
  }
</script>

<style>
  h1 {
    max-width: 50rem;
  }

  .page-header {
    margin-bottom: 0;
  }

  .platforms {
    margin-top: 2rem;
  }

  @media (max-width: 64rem) {
    .platforms {
      margin-bottom: 2rem;
    }
  }

  .card-row {
    --product-card-gap: var(--marketing-inline-gap);
  }

  .install-separately {
    padding-top: var(--marketing-inline-gap);
  }

  .top-row {
    padding-top: 0;
  }

  .bottom-row {
    padding-top: var(--marketing-inline-gap);
    padding-bottom: var(--section-gap);
  }

  .download-label-mobile {
    display: none;
  }

  .card-actions {
    display: flex;
    gap: 1.5rem;
    min-height: 2.25rem;
    align-items: center;
    min-width: 0;
  }

  .card-actions :global(.wrapper) {
    min-width: 0;
  }

  .card-actions .product-link {
    flex-shrink: 0;
  }

  @media (max-width: 64rem) {
    .download-label-desktop {
      display: none;
    }

    .download-label-mobile {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }
  }
</style>

<svelte:head>
  <title>Install | Radicle</title>
</svelte:head>

<Meta
  title="Install | Radicle"
  description="Everything you need to collaborate on code across the terminal, the desktop, and AI agents." />

<main class="page-container">
  <header class="page-header">
    <h1 class="txt-bold-32">
      Get started with Radicle. <span class="txt-color-tertiary">
        Everything you need to collaborate on code.
      </span>
    </h1>
  </header>

  <div class="platforms">
    <PlatformBadges />
  </div>

  <section class="install-separately">
    <div class="card-row top-row">
      <article id="cli" class="product-card">
        <img class="product-media" src="/marketing/images/cli.png" alt="CLI" />
        <div class="product-card-text">
          <h3 class="product-title">CLI</h3>
          <p class="product-description">
            Work directly from your terminal to manage code, issues, patches, CI
            or even your sovereign identity.
          </p>
          <div class="card-actions">
            <CopyCommand />
            <a href="/cli" class="product-link arrow-link" use:link>
              About the CLI <span class="link-arrow link-arrow-right">→</span>
            </a>
          </div>
        </div>
      </article>

      <article id="desktop" class="product-card">
        <img
          class="product-media"
          src="/marketing/images/desktop.png"
          alt="Desktop" />
        <div class="product-card-text">
          <h3 class="product-title">Desktop</h3>
          <p class="product-description">
            Contribute to the network effortlessly with an intuitive visual
            interface.
          </p>
          <div class="card-actions">
            <button
              class="product-link arrow-link desktop-download-trigger"
              on:click={handleDesktopAction}>
              <span class="download-label-desktop">
                Download <span class="link-arrow link-arrow-down">↓</span>
              </span>
              <span class="download-label-mobile">
                Send to my desktop <span class="link-arrow link-arrow-up-right">
                  ↗
                </span>
              </span>
            </button>
            <a href="/desktop" class="product-link arrow-link" use:link>
              About Desktop <span class="link-arrow link-arrow-right">→</span>
            </a>
          </div>
        </div>
      </article>
    </div>

    {#if showDownloads}
      <div transition:slide={{ duration: 300 }}>
        <DownloadPanel />
      </div>
    {/if}

    <div class="card-row bottom-row">
      <AgentCards />
    </div>
  </section>
</main>
