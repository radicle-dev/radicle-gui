<script lang="ts">
  import type { ComponentProps } from "svelte";

  import Icon from "./Icon.svelte";

  interface Tab {
    label: string;
    href: string;
    active: boolean;
    icon?: ComponentProps<typeof Icon>["name"];
    count?: number;
  }

  interface Props {
    tabs: Tab[];
  }

  const { tabs }: Props = $props();
</script>

<style>
  nav {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
    overflow-x: auto;
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 0.625rem 0.75rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-secondary);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  a:hover {
    color: var(--color-text-primary);
  }
  a.active {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-text-primary);
  }
  .count {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-full);
    padding: 0 0.4rem;
  }
</style>

<nav>
  {#each tabs as tab (tab.href)}
    <a href={tab.href} class:active={tab.active}>
      {#if tab.icon}<Icon name={tab.icon} />{/if}
      {tab.label}
      {#if tab.count !== undefined}<span class="count">{tab.count}</span>{/if}
    </a>
  {/each}
</nav>
