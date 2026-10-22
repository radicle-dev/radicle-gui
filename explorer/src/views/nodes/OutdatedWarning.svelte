<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import { releaseDate } from "@http-client/lib/compat";

  export let releasedAt: number;
</script>

<style>
  .banner {
    display: flex;
    align-items: flex-start;
    gap: 0.375rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
  }
  .icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-feedback-warning-text);
  }
</style>

<div class="banner" role="note">
  <span class="icon"><Icon name="warning" /></span>
  <span>
    This node runs a radicle-httpd release from {releaseDate(releasedAt)}, which
    explorer no longer supports, so some pages may not load. If you run this
    node, please upgrade radicle-httpd.
  </span>
</div>
