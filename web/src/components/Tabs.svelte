<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { untrack } from "svelte";

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

  let nav: HTMLElement | undefined = $state();
  const links: Record<string, HTMLAnchorElement> = $state({});
  let hovered = $state<string | undefined>(undefined);
  let line = $state<{ left: number; width: number } | undefined>(undefined);
  // Skips the slide when the line first appears.
  let ready = $state(false);

  const active = $derived(tabs.find(t => t.active)?.href);
  const target = $derived(hovered ?? active);

  function measure() {
    const el = target ? links[target] : undefined;
    line = el ? { left: el.offsetLeft, width: el.offsetWidth } : undefined;
  }

  $effect(() => {
    void target;
    void tabs;
    measure();
    untrack(() => {
      if (line && !ready) requestAnimationFrame(() => (ready = true));
    });
  });

  // Watches every item, not just the row: a web font loading or a count
  // changing moves items without changing the row's size.
  $effect(() => {
    if (!nav) return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    for (const el of Object.values(links)) if (el) observer.observe(el);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  });
</script>

<style>
  nav {
    position: relative;
    display: flex;
    gap: 0.25rem;
    box-shadow: inset 0 -1px 0 var(--color-border-subtle);
    overflow-x: auto;
    scrollbar-width: none;
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 0.625rem 0.75rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
  }
  a:hover {
    color: var(--color-text-primary);
  }
  a.active {
    color: var(--color-text-brand);
  }
  .count {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-full);
    padding: 0 0.4rem;
  }
  a.active .count {
    color: var(--color-text-brand);
    background: color-mix(in srgb, var(--color-surface-brand-primary) 14%, transparent);
  }
  /* One line that rests under the current tab and slides to the hovered one. */
  .line {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--color-surface-brand-primary);
    pointer-events: none;
  }
  .line.away {
    background: var(--color-border-strong);
  }
  .line.ready {
    transition:
      transform 0.2s ease,
      width 0.2s ease,
      background-color 0.2s ease;
  }
</style>

<nav bind:this={nav} onmouseleave={() => (hovered = undefined)}>
  {#each tabs as tab (tab.href)}
    <a
      bind:this={links[tab.href]}
      href={tab.href}
      class:active={tab.active}
      onmouseenter={() => (hovered = tab.href)}
      onfocus={() => (hovered = tab.href)}
      onblur={() => (hovered = undefined)}>
      {#if tab.icon}<Icon name={tab.icon} />{/if}
      {tab.label}
      {#if tab.count !== undefined}<span class="count">{tab.count}</span>{/if}
    </a>
  {/each}
  {#if line}
    <span
      class="line"
      class:away={target !== active}
      class:ready
      style:width={`${line.width}px`}
      style:transform={`translateX(${line.left}px)`}></span>
  {/if}
</nav>
