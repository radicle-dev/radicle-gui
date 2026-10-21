<script lang="ts">
  import AgentCards from "@app/marketing/AgentCards.svelte";
  import CopyCommand from "@app/marketing/CopyCommand.svelte";
  import Meta from "@app/marketing/Meta.svelte";
  import PlatformBadges from "@app/marketing/PlatformBadges.svelte";

  const features = [
    {
      title: "Sovereign identity",
      description:
        "A self-sovereign identity from a key pair, with no accounts and no servers.",
    },
    {
      title: "Repositories",
      description:
        "Initialize, clone, and seed Git repositories across the peer-to-peer network.",
    },
    {
      title: "Patches",
      description:
        "Open, review, update, and merge patches. Radicle’s take on pull requests.",
    },
    {
      title: "Issues",
      description:
        "Track work with issues: create, comment, assign, and close, all from your terminal.",
    },
  ];
</script>

<style>
  .hero-image {
    width: 100%;
    height: auto;
    margin: 2rem 0 var(--section-gap);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-small);
    background: var(--color-surface-subtle);
  }

  .features-heading {
    margin: 2rem 0 2rem;
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

  .get-started {
    padding-top: var(--section-gap);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1.25rem;
  }

  .get-started-heading {
    margin: 0;
  }

  .agents {
    padding-top: var(--section-gap);
  }

  .agents-heading {
    margin: 0 0 2rem;
    max-width: 40rem;
  }

  @media (max-width: 56rem) {
    .features {
      grid-template-columns: 1fr;
    }
  }
</style>

<svelte:head>
  <title>CLI | Radicle</title>
</svelte:head>

<Meta
  title="CLI | Radicle"
  description="Work directly from your terminal to manage code, issues, patches, CI, and your sovereign identity." />

<main class="page-container">
  <header class="page-header">
    <h1 class="txt-bold-32">
      Radicle CLI. <span class="txt-color-tertiary">
        Own your code, identity, and your entire workflow, right from your
        terminal.
      </span>
    </h1>
  </header>

  <img class="hero-image" src="/marketing/images/cli.png" alt="Radicle CLI" />

  <section>
    <h2 class="txt-bold-22 features-heading">Everything, from the terminal</h2>
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

  <section class="get-started">
    <h2 class="txt-bold-22 get-started-heading">Get started</h2>
    <CopyCommand />
    <PlatformBadges />
    <a
      href="https://radicle.dev/guides/user/"
      class="product-link arrow-link"
      target="_blank"
      rel="noopener noreferrer">
      Read the user guide <span class="link-arrow link-arrow-up-right">↗</span>
    </a>
  </section>

  <section class="agents">
    <h2 class="txt-bold-22 agents-heading">
      Don’t feel like learning the CLI? Let an agent drive it for you.
    </h2>
    <div class="card-row">
      <AgentCards />
    </div>
  </section>
</main>
