<script lang="ts">
  import type { DefaultSeedingPolicy, SeedingPolicy } from "@http-client";

  import capitalize from "lodash/capitalize";

  export let seedingPolicy: DefaultSeedingPolicy | SeedingPolicy;

  $: [policy, scope] = Object.values(seedingPolicy);
</script>

<style>
  .section {
    padding-bottom: 0.5rem;
  }
  .text {
    padding-right: 2rem;
  }
</style>

<div class="section" style:padding-top="0.5rem">
  Policy:
  <span class="txt-body-m-semibold">{capitalize(policy)}</span>
</div>
<div class="text" style:color="var(--color-text-tertiary)">
  {#if policy === "allow"}
    All discovered repositories will be seeded.
  {:else if policy === "block"}
    Only selected repositories will be seeded.
  {/if}
</div>

{#if policy === "allow"}
  <div class="section" style:padding-top="0.5rem">
    Scope:
    <span class="txt-body-m-semibold">{capitalize(scope)}</span>
  </div>
  <div class="text" style:color="var(--color-text-tertiary)">
    {#if scope === "all"}
      All changes in seeded repositories, made by any peer, will be synced.
    {:else if scope === "followed"}
      Only changes made by explicitly followed peers will be synced.
    {/if}
  </div>
{/if}
