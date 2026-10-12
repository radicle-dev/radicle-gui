<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  const {
    href,
    title,
    children,
  }: { href: string; title?: string; children?: Snippet } = $props();
</script>

<style>
  a {
    color: inherit;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
    color: var(--color-text-brand);
  }

  .icon {
    color: var(--color-text-secondary);
    position: relative;
    bottom: 1px;
  }

  a:hover .icon {
    color: var(--color-text-brand);
  }
</style>

<a {href} {title} target="_blank" rel="noreferrer">
  {#if children}
    {@render children()}
    <span class="icon"><Icon name="open-external" /></span>
  {:else}
    <Icon name="open-external" />
  {/if}
</a>
