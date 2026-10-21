<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import { homeRoute } from "@app/lib/router";
</script>

<style>
  .mobile-footer {
    width: 100%;
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    z-index: 1;
    gap: 0.5rem;
    border-top: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-base);
  }
</style>

<div class="mobile-footer">
  <Link
    style="width: 100%; display: flex; align-items: center; justify-content: center;"
    route={homeRoute()}>
    <Icon name="seed" />
  </Link>

  <slot />
</div>
