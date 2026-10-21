<script lang="ts">
  import type { BaseUrl } from "@http-client";

  import Layout from "@app/App/Layout.svelte";
  import IconLarge from "@app/components/IconLarge.svelte";
  import SeedPicker from "@app/views/explore/SeedPicker.svelte";

  export let title: string;
  export let description: string | undefined = undefined;
  export let baseUrl: BaseUrl | undefined = undefined;
</script>

<style>
  .container {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }
</style>

<Layout>
  <div class="container">
    <IconLarge name="desert" />
    <div class="title-row txt-heading-m">
      <span>{title}</span>
      {#if baseUrl}
        <!-- This page is always reached from a URL that names a node, and what
             it offers is "try this page on a different node" — a navigation,
             not a change to the stored search seed. -->
        <SeedPicker {baseUrl} mode="node" variant="panel" />
      {/if}
    </div>
    {#if description}
      <div
        class="txt-body-m-regular"
        style:color="var(--color-text-tertiary)"
        style:text-align="center">
        {#each description.split("\n") as line}
          <div>{line}</div>
        {/each}
      </div>
    {/if}
  </div>
</Layout>
