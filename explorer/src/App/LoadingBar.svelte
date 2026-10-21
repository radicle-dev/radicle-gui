<script lang="ts">
  import { isLoading } from "@app/lib/router";
</script>

<style>
  .loading-bar {
    height: 0.125rem;
    background-color: var(--color-surface-brand-primary);
    width: 0%;
    opacity: 0;
    position: fixed;
    z-index: 300;
    transition: width 2s ease;
  }

  .visible {
    opacity: 1;
    width: 100%;
  }
</style>

<div
  role="progressbar"
  aria-label="Page loading"
  class="loading-bar"
  class:visible={$isLoading}>
</div>
