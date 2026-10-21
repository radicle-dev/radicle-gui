<script lang="ts">
  import type { Route } from "@app/lib/router/definitions";
  import type { BaseUrl, RepoListQuery } from "@http-client";

  import { HttpdClient } from "@http-client";
  import { push, routeToPath, useDefaultNavigation } from "@app/lib/router";
  import { searchSeed } from "@app/views/nodes/SeedSelector";

  import CopyCommand from "@app/marketing/CopyCommand.svelte";
  import Meta from "@app/marketing/Meta.svelte";
  import Button from "@app/marketing/Button.svelte";
  import PlatformBadges from "@app/marketing/PlatformBadges.svelte";

  import { renderRepoAvatar } from "@app/lib/avatar";

  interface CarouselRepo {
    name: string;
    description: string;
    rid: string;
    seeding: number;
    issues: number;
    patches: number;
    route: Route;
    avatar: string;
  }

  const exploreRoute: Route = { resource: "explore", params: undefined };

  let carousel: HTMLDivElement | undefined;
  let repos: CarouselRepo[] = [];
  let loading = true;

  const SKELETON_COUNT = 4;

  // Sorted rankings ("most seeded") require the seed to run a search backend.
  // Fall back to "no search" on anything getInfo can't answer so the carousel
  // still tries to show the seed's pinned repos.
  async function detectSearchAvailable(api: HttpdClient): Promise<boolean> {
    try {
      const info = await api.getInfo();
      return info.httpd.searchAvailable;
    } catch {
      return false;
    }
  }

  // Reload whenever the search seed changes (e.g. picked in Settings) so the
  // carousel always reflects the current seed, not just the one resolved on
  // first mount.
  let loadToken = 0;

  // When the selected seed exposes a search backend the carousel shows the
  // most-seeded repositories; otherwise it falls back to the repos pinned on
  // the seed. Either way, links point at the repo on the current deployment.
  async function loadCarousel(seed: BaseUrl) {
    const token = ++loadToken;
    const api = new HttpdClient(seed);
    loading = true;
    try {
      const searchAvailable = await detectSearchAvailable(api);
      const query: RepoListQuery = searchAvailable
        ? { show: "all", sort: "seeding", perPage: 12 }
        : { show: "pinned" };
      const list = await api.repo.getAll(query);
      // Ignore a response that a newer seed selection has superseded.
      if (token !== loadToken) {
        return;
      }
      repos = list
        .filter(r => r.payloads["xyz.radicle.project"])
        .map(r => {
          const project = r.payloads["xyz.radicle.project"];
          return {
            name: project.data.name,
            description: project.data.description,
            rid: r.rid,
            seeding: r.seeding,
            issues: project.meta.issues.open,
            patches: project.meta.patches.open,
            route: { resource: "repo.source", repo: r.rid, node: seed },
            avatar: renderRepoAvatar(project.data.name),
          };
        });
    } catch (error) {
      if (token === loadToken && import.meta.env.DEV) {
        console.warn(
          "Failed to load repositories for the landing page:",
          error,
        );
      }
    } finally {
      if (token === loadToken) {
        loading = false;
      }
    }
  }

  $: void loadCarousel($searchSeed);

  function onRepoClick(event: MouseEvent, route: Route) {
    if (useDefaultNavigation(event)) {
      return;
    }
    event.preventDefault();
    void push(route);
  }

  function shortenRid(rid: string): string {
    // "rad:z6cFWeWpnZNHh9rUW8phgA3b5yGt" → "rad:z6cF..yGt"
    const prefix = rid.slice(0, 8);
    const suffix = rid.slice(-3);
    return `${prefix}..${suffix}`;
  }

  function scrollCarousel(direction: "prev" | "next") {
    if (!carousel) return;
    const firstCard = carousel.querySelector(
      ".repo-card",
    ) as HTMLElement | null;
    const delta = firstCard ? firstCard.offsetWidth + 24 : 320;
    carousel.scrollBy({
      left: direction === "next" ? delta : -delta,
      behavior: "smooth",
    });
  }
</script>

<style>
  /* color inherited from :root, padding from .page-container */

  /* Balance the hero into even lines so the second sentence starts a new line
     instead of leaving a hanging word, without forcing a break when it fits. */
  .hero h1 {
    text-wrap: balance;
  }

  h3 {
    padding-top: 3rem;
    padding-bottom: 1rem;
  }

  .install-heading {
    padding-top: 2rem;
  }

  .platforms {
    margin-top: 1.5rem;
  }

  .hero-image {
    margin-top: 4rem;
    margin-bottom: 2rem;
    width: 100%;
    height: 480px;
    object-fit: cover;
    border-radius: 0.25rem;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
    margin-top: 8rem;
    margin-bottom: 8rem;
  }

  .feature-card {
    display: flex;
    flex-direction: column;
    padding-right: 2.5rem;
  }

  .feature-card h4 {
    padding: 0 0 0.5rem;
  }

  .feature-card p {
    margin: 0;
  }

  /* Most Active Repos Section */
  .most-active {
    padding: 0 0 6rem 0;
    display: flex;
    flex-direction: column;
    gap: 4rem;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 2rem;
  }

  .header-row h2 {
    margin: 0;
  }

  .arrow-buttons {
    display: flex;
    gap: 0.25rem;
  }

  .arrow-buttons button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-radius: var(--border-radius-tiny);
    border: none;
    background: var(--color-surface-canvas);
    cursor: pointer;
    font-size: 1rem;
    color: var(--color-text-primary);
  }

  .arrow-buttons button:hover {
    background: var(--color-surface-mid);
  }

  .arrow-buttons button:active {
    transform: translateY(1px);
  }

  .carousel {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }

  .carousel::-webkit-scrollbar {
    display: none;
  }

  .repo-card {
    flex: 0 0 20rem;
    height: 22.5rem;
    background: var(--color-surface-canvas);
    border-radius: var(--border-radius-tiny);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    scroll-snap-align: start;
    text-decoration: none;
    color: inherit;
    transition: opacity 0.15s ease;
  }

  @media (hover: hover) {
    .carousel:has(.repo-card:hover) .repo-card {
      opacity: 0.45;
    }

    .carousel:has(.repo-card:hover) .repo-card:hover {
      opacity: 1;
    }
  }

  .repo-image {
    width: 100%;
    height: 12.5rem;
    flex: none;
    overflow: hidden;
  }

  .repo-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      var(--color-surface-mid) 0%,
      var(--color-surface-strong) 50%,
      var(--color-surface-mid) 100%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
  }

  .skeleton-avatar {
    width: 100%;
    height: 100%;
  }

  .skeleton-line {
    height: 0.875rem;
    border-radius: var(--border-radius-tiny);
  }

  .skeleton-title {
    height: 1.125rem;
    width: 50%;
  }

  .skeleton-description {
    width: 85%;
  }

  .skeleton-id {
    width: 40%;
  }

  .skeleton-stats {
    width: 8rem;
  }

  .skeleton-seeds {
    width: 3.5rem;
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }

  .repo-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex-grow: 1;
    gap: 1.75rem;
  }

  .repo-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .repo-body h3 {
    margin: 0;
    padding: 0;
    color: var(--color-text-primary);
  }

  .description {
    margin: 0;
    color: var(--color-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .id-link {
    font: var(--txt-code-regular);
    color: var(--color-accent-blue-500);
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .stats {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text-tertiary);
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .time {
    color: var(--color-text-quaternary);
  }

  .all-repos {
    display: inline-flex;
    text-decoration: none;
    color: var(--color-accent-blue-500);
  }

  .all-repos:hover {
    text-decoration: none;
  }

  .garden-promo {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
    padding: 2rem;
    margin-bottom: 6rem;
    position: relative;
    isolation: isolate;
    overflow: hidden;
    container-type: inline-size;
    background-color: var(--color-accent-citrus-500);
    border-radius: var(--border-radius-tiny);
  }

  .garden-promo::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: url("/marketing/images/garden.png") no-repeat right center;
    background-size: cover;
    transition: opacity 0.2s ease;
  }

  @container (max-width: 48rem) {
    .garden-promo::before {
      opacity: 0.4;
    }
  }

  .garden-promo-text h3,
  .garden-promo-text p {
    margin: 0;
    max-width: 32rem;
    color: var(--color-neutrals-opaque-light-900);
  }

  .garden-promo-text h3 {
    padding-top: 0;
    margin-bottom: 0.25rem;
  }

  .garden-promo-action {
    align-self: flex-end;
  }

  @media (max-width: 90rem) {
    .features {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 5rem;
      margin-bottom: 5rem;
    }

    .feature-card {
      padding-right: 0;
    }
  }

  @media (max-width: 56rem) {
    .features {
      grid-template-columns: 1fr;
      gap: 2rem;
      margin-top: 4rem;
      margin-bottom: 4rem;
    }

    .hero-image {
      height: auto;
      aspect-ratio: 3 / 2;
    }

    .garden-promo::before {
      opacity: 0.4;
    }

    .garden-promo {
      flex-direction: column;
      align-items: flex-start;
      gap: 1.5rem;
    }

    .garden-promo-action {
      align-self: flex-start;
    }

    .garden-break {
      display: none;
    }
  }

  @media (max-width: 44rem) {
    .hero h1 {
      font-size: 2.5rem;
      line-height: 2.75rem;
    }
  }
</style>

<svelte:head>
  <title>Radicle</title>
</svelte:head>

<Meta title="Radicle" />

<div class="page-container">
  <section class="hero">
    <h1 class="txt-bold-48">
      The distributed code network. <span class="txt-color-tertiary">
        For humans and machines alike.
      </span>
    </h1>
  </section>
  <section class="hero-media">
    <img
      src="/marketing/images/radicle-bg.jpg"
      alt="Radicle"
      class="hero-image" />
  </section>
  <section class="hero-install">
    <h2 class="txt-bold-32">Peer-to-peer code infrastructure, built on Git.</h2>
    <h3 class="txt-bold-22 install-heading">Install the CLI now</h3>
    <CopyCommand />
    <div class="platforms">
      <PlatformBadges />
    </div>
  </section>
  <section class="features">
    <article class="feature-card">
      <h4 class="txt-bold-18">Local-first</h4>
      <p class="txt-medium-16 txt-color-tertiary">
        Code, issues, and patches all live on your machine. No API limits, no
        latency, no outage to wait out. Your agents work offline and sync when
        ready.
      </p>
    </article>

    <article class="feature-card">
      <h4 class="txt-bold-18">Private</h4>
      <p class="txt-medium-16 txt-color-tertiary">
        Direct peer-to-peer sync and Tor integration are standard. Share what
        you want, with whom you want, without anyone watching.
      </p>
    </article>

    <article class="feature-card">
      <h4 class="txt-bold-18">Signed by default</h4>
      <p class="txt-medium-16 txt-color-tertiary">
        Every change is cryptographically signed: commits, patches, issues,
        comments, all of it. Nothing enters your repo unverified, so the whole
        history is tamper-proof and attributable. Trust cryptography, not the
        platform.
      </p>
    </article>

    <article class="feature-card">
      <h4 class="txt-bold-18">Human-first, agent-scale</h4>
      <p class="txt-medium-16 txt-color-tertiary">
        One person or a thousand agents, same conflict-free workflow. Each gets
        its own namespace, and Collaborative Objects merge concurrent edits
        automatically, every one signed.
      </p>
    </article>

    <article class="feature-card">
      <h4 class="txt-bold-18">Programmable repos</h4>
      <p class="txt-medium-16 txt-color-tertiary">
        Radicle extends Git with conflict-free, programmable data types that
        live inside your repo. Design custom workflows for humans and agents
        that travel with your code, not a vendor’s API.
      </p>
    </article>

    <article class="feature-card">
      <h4 class="txt-bold-18">Sovereign</h4>
      <p class="txt-medium-16 txt-color-tertiary">
        Your code. Your identity. Your infrastructure. Nobody can deplatform
        you, rate-limit you, or revoke your access.
      </p>
    </article>
  </section>

  <section class="most-active">
    <div class="header-row">
      <h2 class="txt-bold-32">Explore repos on the network</h2>

      <div class="arrow-buttons">
        <button
          type="button"
          aria-label="Previous"
          on:click={() => scrollCarousel("prev")}>
          ←
        </button>
        <button
          type="button"
          aria-label="Next"
          on:click={() => scrollCarousel("next")}>
          →
        </button>
      </div>
    </div>

    <div class="carousel" bind:this={carousel}>
      {#if loading}
        {#each Array.from({ length: SKELETON_COUNT }) as _}
          <div class="repo-card" aria-hidden="true">
            <div class="repo-image">
              <div class="skeleton skeleton-avatar"></div>
            </div>
            <div class="repo-body">
              <div class="repo-info">
                <div class="skeleton skeleton-line skeleton-title"></div>
                <div class="skeleton skeleton-line skeleton-description"></div>
                <div class="skeleton skeleton-line skeleton-id"></div>
              </div>
              <div class="meta-row">
                <div class="skeleton skeleton-line skeleton-stats"></div>
                <div class="skeleton skeleton-line skeleton-seeds"></div>
              </div>
            </div>
          </div>
        {/each}
      {:else}
        {#each repos as repo}
          <a
            href={routeToPath(repo.route)}
            on:click={e => onRepoClick(e, repo.route)}
            class="repo-card">
            <div class="repo-image">
              {#if repo.avatar}
                <img src={repo.avatar} alt={repo.name} class="repo-avatar" />
              {/if}
            </div>

            <div class="repo-body">
              <div class="repo-info">
                <h3 class="txt-bold-18">{repo.name}</h3>
                <p class="description txt-medium-14">{repo.description}</p>
                <span class="id-link">{shortenRid(repo.rid)}</span>
              </div>

              <div class="meta-row">
                <div class="stats txt-code-regular">
                  <span class="stat">{repo.issues} issues</span>
                  <span class="stat">{repo.patches} patches</span>
                </div>
                <span class="time txt-medium-14">{repo.seeding} seeds</span>
              </div>
            </div>
          </a>
        {/each}
      {/if}
    </div>

    <a
      href={routeToPath(exploreRoute)}
      on:click={e => onRepoClick(e, exploreRoute)}
      class="all-repos txt-bold-18 arrow-link">
      Explore the network <span class="link-arrow link-arrow-right">→</span>
    </a>
  </section>

  <section class="garden-promo">
    <div class="garden-promo-text">
      <h3 class="txt-bold-22">
        Need a hosted node?
        <br class="garden-break" />
        Try Radicle Garden.
      </h3>
      <p class="txt-medium-16">
        Always-on nodes for your repositories.
        <br class="garden-break" />
        No infrastructure to manage.
      </p>
    </div>
    <div class="garden-promo-action">
      <Button
        href="https://radicle.garden"
        variant="white"
        target="_blank"
        rel="noopener noreferrer">
        Visit radicle.garden
        <span class="link-arrow link-arrow-up-right" aria-hidden="true">↗</span>
      </Button>
    </div>
  </section>
</div>
