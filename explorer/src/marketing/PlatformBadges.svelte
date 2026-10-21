<script lang="ts">
  import PlatformIcon from "@app/marketing/PlatformIcon.svelte";
</script>

<style>
  .os-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .os-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    color: var(--color-text-primary);
    font: var(--txt-medium-16);
  }

  .os-note {
    font: var(--txt-medium-12);
    color: var(--color-text-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-round);
    padding: 0.125rem 0.5rem;
  }
</style>

<ul class="os-badges" aria-label="Supported platforms">
  <li class="os-badge">
    <PlatformIcon os="linux" />
    Linux
  </li>
  <li class="os-badge">
    <PlatformIcon os="macos" />
    macOS
  </li>
  <li class="os-badge">
    <PlatformIcon os="windows" />
    Windows
    <span class="os-note">via WSL2</span>
  </li>
</ul>
