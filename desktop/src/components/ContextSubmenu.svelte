<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";

  import { autoUpdate, computePosition, flip, shift } from "@floating-ui/dom";
  import { tick } from "svelte";

  import { menuFocusIndex } from "@app/lib/menuNavigation";

  import {
    getContextMenu,
    itemSelector,
  } from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    label: string;
    icon: ComponentProps<typeof Icon>["name"];
    children: Snippet;
  }

  const { label, icon, children }: Props = $props();

  const menu = getContextMenu();
  const id = Symbol();
  const open = $derived(menu.openSubmenu === id);

  let triggerEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();

  function items(): HTMLElement[] {
    if (!panelEl) return [];
    return Array.from(
      panelEl.querySelectorAll<HTMLElement>(itemSelector),
    ).filter(el => el.parentElement?.closest('[role="menu"]') === panelEl);
  }

  async function show(focusFirst: boolean) {
    menu.openSubmenu = id;
    if (!focusFirst) return;
    await tick();
    items()[0]?.focus();
  }

  function hide() {
    menu.openSubmenu = undefined;
    triggerEl?.focus();
  }

  function onTriggerKeydown(ev: KeyboardEvent) {
    if (ev.key === "ArrowRight" || ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      ev.stopPropagation();
      void show(true);
    }
  }

  function onPanelKeydown(ev: KeyboardEvent) {
    ev.stopPropagation();
    const typing = ev.target instanceof HTMLInputElement;
    if (ev.key === "Escape" || (ev.key === "ArrowLeft" && !typing)) {
      ev.preventDefault();
      hide();
      return;
    }
    if (typing && (ev.key === "Home" || ev.key === "End")) return;
    const list = items();
    if (list.length === 0) return;
    const current = list.findIndex(el => el === document.activeElement);
    const next = menuFocusIndex(ev.key, current, list.length);
    if (next === undefined) return;
    ev.preventDefault();
    list[next].focus();
  }

  $effect(() => {
    if (!open || !triggerEl || !panelEl) return;
    const trigger = triggerEl;
    const panel = panelEl;
    return autoUpdate(trigger, panel, () => {
      void computePosition(trigger, panel, {
        strategy: "fixed",
        placement: "right-start",
        middleware: [flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        panel.style.left = `${x + 4}px`;
        panel.style.top = `${y - 4}px`;
        panel.style.visibility = "visible";
      });
    });
  });
</script>

<style>
  .label {
    flex: 1;
  }
  .submenu {
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    z-index: 101;
    min-width: 12rem;
    max-width: 20rem;
    max-height: 20rem;
    overflow-y: auto;
    padding: 0.25rem;
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
  }
</style>

<button
  bind:this={triggerEl}
  type="button"
  class="menu-item"
  role="menuitem"
  aria-haspopup="menu"
  aria-expanded={open}
  onpointerenter={() => void show(false)}
  onclick={() => void show(false)}
  onkeydown={onTriggerKeydown}>
  <Icon name={icon} />
  <span class="label">{label}</span>
  <Icon name="chevron-right" />
</button>

{#if open}
  <div
    bind:this={panelEl}
    class="submenu"
    role="menu"
    tabindex="-1"
    onkeydown={onPanelKeydown}>
    {@render children()}
  </div>
{/if}
