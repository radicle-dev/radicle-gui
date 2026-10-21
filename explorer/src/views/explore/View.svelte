<script lang="ts">
  import type { BaseUrl } from "@http-client";

  import Header from "@app/components/Header.svelte";

  import Section from "./Section.svelte";
  import { exploreSections, fallbackSections } from "./sections";

  export let baseUrl: BaseUrl;
  export let searchAvailable: boolean;

  $: sections = searchAvailable
    ? exploreSections
    : fallbackSections(baseUrl.hostname);
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - var(--global-header-height));
  }
  .container {
    width: 100%;
    max-width: 86rem;
    margin: 0 auto;
    padding: 2.5rem 1rem 3rem;
  }

  @media (max-width: 900px) {
    .container {
      padding: 1rem;
    }
  }
</style>

<Header />

<div class="page">
  <div class="container">
    {#each sections as section (section.id)}
      <Section {baseUrl} {section} />
    {/each}
  </div>
</div>
