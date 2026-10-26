<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import {
    minimumSupportedVersion,
    releaseNumber,
  } from "@http-client/lib/compat";

  export let version: string;
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
    This node runs radicle-httpd {releaseNumber(version)}, but explorer needs
    {minimumSupportedVersion} or newer, so some pages may not load. If you run this
    node, please upgrade radicle-httpd.
  </span>
</div>
