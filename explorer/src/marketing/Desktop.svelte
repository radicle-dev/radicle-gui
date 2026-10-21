<script lang="ts">
  import DownloadPanel from "@app/marketing/DownloadPanel.svelte";
  import Meta from "@app/marketing/Meta.svelte";

  const screenshots = ["01", "02", "03", "04", "05", "06", "07", "08"].map(
    n => `/marketing/images/desktop/${n}.png`,
  );

  const features = [
    {
      title: "Code review",
      description:
        "Review patches with line-by-line comments, right inside the diff.",
    },
    {
      title: "Inbox",
      description:
        "One feed for every patch, review, and mention. Notifications worth checking.",
    },
    {
      title: "Rich text & embeds",
      description:
        "Drop screenshots, videos, and Markdown into issues, patches, and comments.",
    },
    {
      title: "Issues",
      description:
        "Open, discuss, and close issues in a full editor, with labels, assignees, and rich text.",
    },
  ];
</script>

<style>
  .carousel-frame {
    margin: 2rem 0 var(--section-gap);
    padding: 1.5rem;
    border-radius: var(--border-radius-small);
    background: url("/marketing/images/desktop-bg.png") center / cover no-repeat;
  }

  .carousel {
    display: flex;
    gap: 1.5rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: 1rem;
  }

  .carousel-image {
    flex: 0 0 100%;
    width: 100%;
    height: auto;
    scroll-snap-align: center;
  }

  .features-heading {
    margin: 0 0 2rem;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2.5rem 2rem;
  }

  .feature-title {
    margin: 0 0 0.5rem;
    color: var(--color-text-primary);
  }

  .feature-description {
    margin: 0;
    color: var(--color-text-tertiary);
  }

  .download {
    padding-top: var(--section-gap);
  }

  .download-heading {
    margin: 0 0 2rem;
  }

  @media (max-width: 56rem) {
    .features {
      grid-template-columns: 1fr;
    }
  }
</style>

<svelte:head>
  <title>Desktop | Radicle</title>
</svelte:head>

<Meta
  title="Desktop | Radicle"
  description="Radicle Desktop is a simple, local-first desktop app that makes contributing to the Radicle network easier than ever." />

<main class="page-container">
  <header class="page-header">
    <h1 class="txt-bold-32">
      Radicle Desktop. <span class="txt-color-tertiary">
        A simple, local-first desktop app that makes contributing to the Radicle
        network easier than ever.
      </span>
    </h1>
  </header>

  <div class="carousel-frame">
    <div class="carousel">
      {#each screenshots as src}
        <img
          class="carousel-image"
          {src}
          alt="Radicle Desktop screenshot"
          loading="lazy" />
      {/each}
    </div>
  </div>

  <section>
    <h2 class="txt-bold-22 features-heading">Beyond the terminal</h2>
    <div class="features">
      {#each features as feature}
        <div>
          <h3 class="txt-bold-18 feature-title">{feature.title}</h3>
          <p class="txt-medium-16 feature-description">
            {feature.description}
          </p>
        </div>
      {/each}
    </div>
  </section>

  <section class="download">
    <h2 class="txt-bold-22 download-heading">Download</h2>
    <DownloadPanel />
  </section>
</main>
