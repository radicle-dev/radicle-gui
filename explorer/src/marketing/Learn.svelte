<script lang="ts">
  import Meta from "@app/marketing/Meta.svelte";
  import Button from "@app/marketing/Button.svelte";

  import { guides } from "@app/marketing/guides";
  import { link } from "@app/marketing/link";

  const learnGuides = [guides[0], guides[2], guides[3]];
</script>

<style>
  h1 {
    max-width: 50rem;
  }

  .section {
    padding-top: var(--section-gap);
  }

  /* Tighten the intro "How it works" section: its top gap (from the page
     header) and its bottom gap (the following Guides section's top padding). */
  #basics.section,
  #guides.section {
    padding-top: 4rem;
  }

  #basics .section-header {
    margin-bottom: 0;
  }

  #basics .section-header h2 {
    margin-bottom: 0;
  }

  #basics .section-all {
    margin-top: 1rem;
  }

  .basics-layout {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 3rem;
    align-items: center;
  }

  .basics-figure {
    --node-blue: var(--color-accent-blue-500);
    --node-green: var(--color-accent-green-600);
    --node-purple: var(--color-accent-purple-500);
    --mesh-line: var(--color-border-strong);
  }

  .basics-figure .diagram {
    width: 100%;
    height: auto;
  }

  .basics-figure .mesh-line {
    stroke: var(--mesh-line);
    stroke-width: 1.5;
  }

  .basics-figure .nd-blue {
    fill: var(--node-blue);
  }
  .basics-figure .nd-green {
    fill: var(--node-green);
  }
  .basics-figure .nd-purple {
    fill: var(--node-purple);
  }

  @media (max-width: 56rem) {
    .basics-layout {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .basics-figure {
      max-width: 16rem;
    }
  }

  .section:last-child {
    padding-bottom: var(--section-gap);
  }

  .section-header {
    margin-bottom: 1.5rem;
  }

  .section-header h2 {
    margin-bottom: 0.5rem;
  }

  .section-header p {
    margin: 0;
  }

  .product-link {
    font: var(--txt-bold-14);
  }

  .guide-thumbs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
    margin-top: 2rem;
  }

  .section-all {
    display: inline-flex;
    margin-top: 2.5rem;
    font: var(--txt-bold-18);
  }

  .guide-thumb {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-decoration: none;
  }

  .guide-thumb-image {
    width: 100%;
    aspect-ratio: 1 / 1.2;
    object-fit: cover;
    border-radius: var(--border-radius-small);
    background: var(--color-surface-subtle);
    margin-bottom: 0.25rem;
  }

  .guide-thumb-title {
    color: var(--color-text-primary);
  }

  .guide-thumb:hover .link-arrow-right {
    transform: translateX(0.15rem);
  }

  .guide-thumb:hover .link-arrow-up-right {
    transform: translate(0.15rem, -0.15rem);
  }

  .guide-thumb-description {
    color: var(--color-text-tertiary);
  }

  @media (max-width: 40rem) {
    .guide-thumbs {
      grid-template-columns: 1fr;
    }

    .section-all {
      font: var(--txt-bold-16);
    }
  }

  .garden-promo {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
    padding: 2rem;
    margin: var(--section-gap) 0;
    background:
      url("/marketing/images/garden.png") no-repeat right center,
      var(--color-accent-citrus-500);
    background-size: cover;
    border-radius: var(--border-radius-tiny);
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
    #basics.section,
    #guides.section {
      padding-top: 2rem;
    }
  }
  @media (max-width: 64rem) {
    #basics.section,
    #guides.section {
      padding-top: 1.5rem;
    }
  }

  @media (max-width: 56rem) {
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
</style>

<svelte:head>
  <title>Learn | Radicle</title>
</svelte:head>

<Meta
  title="Learn | Radicle"
  description="Everything you need to understand, set up, and build on the sovereign code network." />

<main class="page-container">
  <h1 class="txt-bold-32">
    Learn Radicle. <span class="txt-color-tertiary">
      Everything you need to understand, set up, and build on the sovereign code
      network.
    </span>
  </h1>

  <section id="basics" class="section">
    <div class="basics-layout">
      <div class="basics-figure" aria-hidden="true">
        <svg
          class="diagram"
          viewBox="0 0 360 340"
          fill="none"
          aria-hidden="true">
          <g class="mesh-line">
            <line x1="180" y1="55" x2="274" y2="100" />
            <line x1="274" y1="100" x2="297" y2="202" />
            <line x1="297" y1="202" x2="232" y2="283" />
            <line x1="232" y1="283" x2="128" y2="283" />
            <line x1="128" y1="283" x2="63" y2="202" />
            <line x1="63" y1="202" x2="86" y2="100" />
            <line x1="86" y1="100" x2="180" y2="55" />
            <line x1="180" y1="55" x2="232" y2="283" />
            <line x1="274" y1="100" x2="128" y2="283" />
            <line x1="297" y1="202" x2="63" y2="202" />
            <line x1="180" y1="55" x2="297" y2="202" />
            <line x1="232" y1="283" x2="63" y2="202" />
            <line x1="128" y1="283" x2="86" y2="100" />
          </g>
          <rect
            class="nd-blue"
            x="160"
            y="35"
            width="40"
            height="40"
            rx="12"
            fill-opacity="0.13" />
          <rect
            class="nd-green"
            x="254"
            y="80"
            width="40"
            height="40"
            rx="12"
            fill-opacity="0.13" />
          <rect
            class="nd-purple"
            x="277"
            y="182"
            width="40"
            height="40"
            rx="12"
            fill-opacity="0.13" />
          <rect
            class="nd-blue"
            x="212"
            y="263"
            width="40"
            height="40"
            rx="12"
            fill-opacity="0.13" />
          <rect
            class="nd-green"
            x="108"
            y="263"
            width="40"
            height="40"
            rx="12"
            fill-opacity="0.13" />
          <rect
            class="nd-purple"
            x="43"
            y="182"
            width="40"
            height="40"
            rx="12"
            fill-opacity="0.13" />
          <rect
            class="nd-blue"
            x="66"
            y="80"
            width="40"
            height="40"
            rx="12"
            fill-opacity="0.13" />
          <circle class="nd-blue" cx="180" cy="55" r="9" />
          <circle class="nd-green" cx="274" cy="100" r="9" />
          <circle class="nd-purple" cx="297" cy="202" r="9" />
          <circle class="nd-blue" cx="232" cy="283" r="9" />
          <circle class="nd-green" cx="128" cy="283" r="9" />
          <circle class="nd-purple" cx="63" cy="202" r="9" />
          <circle class="nd-blue" cx="86" cy="100" r="9" />
        </svg>
      </div>
      <div class="basics-text">
        <div class="section-header">
          <h2 class="txt-bold-24">How it works</h2>
          <p class="txt-bold-24 txt-color-tertiary">
            The core ideas behind Radicle.
          </p>
        </div>
        <a
          href="/principles"
          class="section-all product-link arrow-link"
          use:link>
          Learn the basics <span class="link-arrow link-arrow-right">→</span>
        </a>
      </div>
    </div>
  </section>

  <section id="guides" class="section">
    <div class="section-header">
      <h2 class="txt-bold-24">Guides</h2>
      <p class="txt-medium-16 txt-color-tertiary">
        Step-by-step tutorials that walk you through Radicle, from your first
        repository to running infrastructure.
      </p>
    </div>
    <div class="guide-thumbs">
      {#each learnGuides as guide}
        <a
          class="guide-thumb"
          href={guide.href}
          target={guide.external ? "_blank" : undefined}
          rel={guide.external ? "noopener noreferrer" : undefined}
          use:link>
          <img class="guide-thumb-image" src={guide.image} alt="" />
          <span class="guide-thumb-title txt-bold-16">
            {guide.title}
            {#if guide.external}
              <span class="link-arrow link-arrow-up-right">↗</span>
            {:else}
              <span class="link-arrow link-arrow-right">→</span>
            {/if}
          </span>
          <span class="guide-thumb-description txt-medium-14">
            {guide.description}
          </span>
        </a>
      {/each}
    </div>
    <a href="/guides" class="section-all product-link arrow-link" use:link>
      View all guides <span class="link-arrow link-arrow-right">→</span>
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
</main>
