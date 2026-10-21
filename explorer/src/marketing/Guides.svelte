<script lang="ts">
  import Meta from "@app/marketing/Meta.svelte";
  import { guides } from "@app/marketing/guides";
  import { link } from "@app/marketing/link";
</script>

<style>
  .page-header {
    margin-bottom: 2rem;
  }

  .guides-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem 1.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .guide-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-decoration: none;
  }

  .guide-thumb {
    position: relative;
    border-radius: var(--border-radius-small);
    overflow: hidden;
    margin-bottom: 0.25rem;
  }

  .guide-thumb img,
  .guide-thumb-placeholder {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1.2;
    object-fit: cover;
    background: var(--color-surface-subtle);
  }

  .guide-play {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding-left: 0.15rem;
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--color-neutrals-opaque-dark-0) 60%,
      transparent
    );
    color: var(--color-neutrals-opaque-light-0);
  }

  .guide-title {
    color: var(--color-text-primary);
  }

  .guide-description {
    margin: 0;
    color: var(--color-text-tertiary);
  }

  .guide-card:hover .link-arrow-right {
    transform: translateX(0.15rem);
  }

  .guide-card:hover .link-arrow-up-right {
    transform: translate(0.15rem, -0.15rem);
  }

  @media (max-width: 40rem) {
    .guides-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

<svelte:head>
  <title>Guides | Radicle</title>
</svelte:head>

<Meta
  title="Guides | Radicle"
  description="Step-by-step tutorials that walk you through Radicle, from your first repository to running infrastructure." />

<main class="page-container">
  <header class="page-header">
    <h1 class="txt-bold-32">
      Guides. <span class="txt-color-tertiary">
        Step-by-step tutorials that walk you through Radicle, from your first
        repository to running infrastructure.
      </span>
    </h1>
  </header>
  <ul class="guides-grid">
    {#each guides as guide}
      <li>
        <a
          class="guide-card"
          href={guide.href}
          target={guide.external ? "_blank" : undefined}
          rel={guide.external ? "noopener noreferrer" : undefined}
          use:link>
          <span class="guide-thumb">
            {#if guide.image}
              <img src={guide.image} alt="" />
            {:else}
              <span class="guide-thumb-placeholder" aria-hidden="true"></span>
            {/if}
            {#if guide.video}
              <span class="guide-play" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            {/if}
          </span>
          <span class="guide-title txt-bold-16">
            {guide.title}
            {#if guide.external}
              <span class="link-arrow link-arrow-up-right">↗</span>
            {:else}
              <span class="link-arrow link-arrow-right">→</span>
            {/if}
          </span>
          <span class="guide-description txt-medium-14">
            {guide.description}
          </span>
        </a>
      </li>
    {/each}
  </ul>
</main>
