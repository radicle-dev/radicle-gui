<script lang="ts">
  import type {
    CliRoute,
    DesktopRoute,
    DocsLoadedRoute,
    GuidesRoute,
    InstallRoute,
    LandingRoute,
    LearnRoute,
    PrinciplesRoute,
  } from "./types";

  import Header from "@app/components/Header.svelte";

  import BasicPrinciples from "./BasicPrinciples.svelte";
  import Cli from "./Cli.svelte";
  import Desktop from "./Desktop.svelte";
  import Docs from "./Docs.svelte";
  import Footer from "./Footer.svelte";
  import Guides from "./Guides.svelte";
  import Install from "./Install.svelte";
  import Landing from "./Landing.svelte";
  import Learn from "./Learn.svelte";
  import Sidebar from "./Sidebar.svelte";

  export let route:
    | LandingRoute
    | LearnRoute
    | InstallRoute
    | GuidesRoute
    | DesktopRoute
    | CliRoute
    | PrinciplesRoute
    | DocsLoadedRoute;
</script>

<style>
  .layout {
    display: grid;
    grid-template-columns: 18rem 1fr;
    max-width: 86rem;
    margin: 0 auto;
  }

  .layout :global(.sidebar) {
    position: sticky;
    top: var(--global-header-height);
    height: calc(100vh - var(--global-header-height));
  }

  .main-content {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }

  @media (max-width: 90rem) {
    .layout {
      grid-template-columns: 14rem 1fr;
    }
  }

  @media (max-width: 56rem) {
    .layout {
      grid-template-columns: 1fr;
    }

    .layout :global(.sidebar) {
      display: none;
    }
  }
</style>

<Header />

<div class="marketing">
  <div class="layout">
    <Sidebar />
    <div class="main-content">
      {#if route.resource === "landing"}
        <Landing />
      {:else if route.resource === "learn"}
        <Learn />
      {:else if route.resource === "install"}
        <Install />
      {:else if route.resource === "guides"}
        <Guides />
      {:else if route.resource === "desktop"}
        <Desktop />
      {:else if route.resource === "cli"}
        <Cli />
      {:else if route.resource === "principles"}
        <BasicPrinciples />
      {:else if route.resource === "docs"}
        <Docs page={route.params.page} component={route.params.component} />
      {/if}
      <Footer />
    </div>
  </div>
</div>
