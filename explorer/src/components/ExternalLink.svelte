<svelte:options customElement="radicle-external-link" />

<script lang="ts">
  import Icon from "./Icon.svelte";

  export let href: string;
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
    color: var(--color-text-tertiary);
    position: relative;
    bottom: 1px;
  }

  a:hover .icon {
    color: var(--color-surface-brand-secondary);
  }
</style>

<!-- prettier-ignore -->
<a {href} target="_blank" rel="noreferrer"><slot>{href}</slot><span class="icon"><Icon name="open-external" /></span></a>
