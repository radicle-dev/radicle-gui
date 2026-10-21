<script lang="ts">
  export let title: string;
  export let description =
    "Radicle is a sovereign code forge for software communities.";
  // Canonical URL for docs copied verbatim from radicle.dev, pointing search
  // engines at the original to avoid duplicate-content penalties.
  export let canonical: string | undefined = undefined;
</script>

<svelte:head>
  <meta name="description" content={description} />

  {#if canonical}
    <link rel="canonical" href={canonical} />
  {/if}

  <meta property="og:url" content="https://radicle.network" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />

  <meta name="twitter:card" content="summary" />
  <meta property="twitter:domain" content="radicle.network" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
</svelte:head>
