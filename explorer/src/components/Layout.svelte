<script lang="ts">
  import Header from "@app/components/Header.svelte";

  export let stylePaddingBottom: string = "0";
</script>

<style>
  .content {
    width: 100%;
    display: grid;
    grid-template-columns: var(--global-left-sidebar-width) auto;
    grid-template-areas: "left center";
    height: calc(100vh - var(--global-header-height));
  }
  .center {
    overflow-y: auto;
  }
  .left {
    grid-area: left;
    background-color: var(--color-surface-base);
    height: calc(100vh - var(--global-header-height));
  }
  .center {
    grid-area: center;
    min-width: 23rem;
    border-left: 1px solid var(--color-border-subtle);
  }

  @media (max-width: 719.98px) {
    .content {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: visible;
    }
    .left {
      position: relative;
      height: auto;
      width: 100%;
      overflow-y: visible;
      z-index: 100;
    }
    .center {
      position: relative;
      height: 100%;
      width: 100%;
      overflow-y: visible;
    }
  }
</style>

{#if $$slots.breadcrumbs}
  <Header>
    <svelte:fragment slot="breadcrumbs">
      <slot name="breadcrumbs" />
    </svelte:fragment>
  </Header>
{:else}
  <Header />
{/if}
<div class="content">
  <div class="left">
    <slot name="sidebar" />
  </div>

  <div class="center" style:padding-bottom={stylePaddingBottom}>
    <slot name="center" />
  </div>
</div>
