<script lang="ts">
  import type { DefaultSeedingPolicy } from "@http-client";

  import capitalize from "lodash/capitalize";

  import IconButton from "@app/components/IconButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ScopePolicyExplainer from "@app/components/ScopePolicyExplainer.svelte";

  export let seedingPolicy: DefaultSeedingPolicy | undefined = undefined;

  let expandedNode = false;

  $: shortScope =
    seedingPolicy?.default === "allow" && seedingPolicy?.scope === "all"
      ? "permissive"
      : "restrictive";
</script>

<style>
  .policies {
    font: var(--txt-body-m-regular);
    display: flex;
    flex-direction: column;
  }
  .item {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
</style>

<div class="policies">
  <div class="item">
    <div class="item" style="justify-content: flex-start;">
      <span class="no-wrap">Seeding Policy</span>
    </div>
    <div
      style="display: flex; flex-direction: row; gap: 0.5rem; align-items: center;">
      <div class="txt-body-m-semibold">
        {capitalize(shortScope)}
      </div>
      <IconButton on:click={() => (expandedNode = !expandedNode)}>
        <Icon name={`chevron-${expandedNode ? "up" : "down"}`} />
      </IconButton>
    </div>
  </div>
  {#if expandedNode && seedingPolicy}
    <div style:padding-bottom="1rem">
      <ScopePolicyExplainer {seedingPolicy} />
    </div>
  {/if}
</div>
