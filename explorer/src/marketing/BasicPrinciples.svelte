<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import Meta from "@app/marketing/Meta.svelte";
  import PrincipleFigure from "@app/marketing/PrincipleFigure.svelte";

  type Principle = {
    id: string;
    kicker: string;
    kickerMuted?: boolean;
    title: string;
    body?: string;
  };

  const principles: Principle[] = [
    {
      id: "status-quo",
      kicker: "Centralized platforms",
      kickerMuted: true,
      title: "Code lives on someone else’s server",
      body: "Your issues, patches and identity are controlled by the platform.",
    },
    {
      id: "nodes",
      kicker: "Radicle",
      title: "Everyone runs a node",
      body: "No central server. Each node hosts and shares Git repositories directly with peers.",
    },
    {
      id: "identity",
      kicker: "Identity",
      title: "Your identity is a key pair",
    },
    {
      id: "networking",
      kicker: "Networking",
      title: "Gossip finds peers, Git moves the code",
    },
    {
      id: "trust",
      kicker: "Trust",
      title: "Every change is cryptographically signed",
      body: "Repositories are self-certifying. Anyone can verify authenticity without trusting a central authority.",
    },
    {
      id: "collaboration",
      kicker: "Collaboration",
      title: "Issues and patches live inside the repo",
      body: "Collaborative Objects are local-first, user-owned and signed, just like your code.",
    },
  ];
</script>

<style>
  .principles {
    --node-green: var(--color-accent-green-600);
  }

  .page-title {
    max-width: 40rem;
  }

  .principle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 3rem;
    padding: 4rem 0;
  }

  .principle + .principle {
    border-top: 1px solid var(--color-border-subtle);
  }

  .principle-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 1.25rem;
    max-width: 34rem;
  }

  .principle-kicker {
    color: var(--color-accent-blue-500);
  }

  .principle-kicker.muted {
    color: var(--color-text-quaternary);
  }

  .principle-title {
    font: var(--txt-bold-24);
    margin: 0;
    color: var(--color-text-primary);
  }

  .principle-body {
    font: var(--txt-medium-18);
    margin: 0;
    max-width: 32rem;
    color: var(--color-text-tertiary);
  }

  .id-points {
    list-style: none;
    margin: 0;
    padding: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .id-points li {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    font: var(--txt-medium-16);
  }
  .id-points strong {
    color: var(--color-text-primary);
    font-weight: 600;
  }
  .id-points .muted {
    color: var(--color-text-tertiary);
  }
  .id-points :global(svg) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    color: var(--node-green);
    transform: translateY(0.05em);
  }

  .net-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-medium-18);
  }
  .net-steps li {
    color: var(--color-text-tertiary);
  }
  .net-steps .num {
    font-weight: 600;
    margin-right: 0.3rem;
  }
  .net-steps li:first-child {
    color: var(--color-accent-blue-500);
    font-weight: 600;
  }

  .principle-visual {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  @media (max-width: 56rem) {
    .principle {
      grid-template-columns: 1fr;
      gap: 2rem;
      padding: 2.5rem 0;
    }

    .principle-visual {
      justify-content: flex-start;
    }

    .id-points {
      font-size: 0.9375rem;
    }
  }
</style>

<svelte:head>
  <title>How it works | Radicle</title>
</svelte:head>

<Meta
  title="How it works | Radicle"
  description="The core ideas behind Radicle." />

<main class="page-container principles">
  <header class="page-header">
    <h1 class="page-title txt-bold-32">
      How it works.
      <br />
      <span class="txt-color-tertiary">The core ideas behind Radicle.</span>
    </h1>
  </header>

  {#each principles as principle (principle.id)}
    <section class="principle">
      <div class="principle-text">
        <span
          class="principle-kicker txt-bold-14"
          class:muted={principle.kickerMuted}>
          {principle.kicker}
        </span>
        <h2 class="principle-title">{principle.title}</h2>

        {#if principle.body}
          <p class="principle-body">{principle.body}</p>
        {/if}

        {#if principle.id === "identity"}
          <ul class="id-points">
            <li>
              <Icon name="offline" />
              <span>
                <strong>Generated offline:</strong>
                <span class="muted">no email, no account, no sign-up</span>
              </span>
            </li>
            <li>
              <Icon name="key" />
              <span>
                <strong>Your public key is your identity:</strong>
                <span class="muted">
                  derived from your key, not assigned by anyone
                </span>
              </span>
            </li>
            <li>
              <Icon name="badge" />
              <span>
                <strong>Sign every action:</strong>
                <span class="muted">so peers can verify it’s really you</span>
              </span>
            </li>
          </ul>
        {:else if principle.id === "networking"}
          <ol class="net-steps">
            <li>
              <span class="num">1.</span>
              Announce updates over gossip
            </li>
            <li>
              <span class="num">2.</span>
              Replicate the data with Git’s own transfer protocol
            </li>
          </ol>
        {/if}
      </div>

      <div class="principle-visual">
        <PrincipleFigure id={principle.id} />
      </div>
    </section>
  {/each}
</main>
