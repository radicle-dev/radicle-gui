<script lang="ts">
  import type { Snippet } from "svelte";

  import { cubicIn, cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";

  import { motion } from "@app/lib/motion";
  import { provideSheet } from "@app/lib/sheet";

  interface Props {
    expandHref: string;
    onClose: () => void;
    children: Snippet;
  }

  const { expandHref, onClose, children }: Props = $props();

  let body: HTMLDivElement | undefined = $state();
  provideSheet(() => ({ expandHref, close: onClose }));
  let sheet: HTMLDivElement | undefined = $state();

  function onpointerdown(e: PointerEvent) {
    if (!(e.target instanceof Element) || !sheet) return;
    if (sheet.contains(e.target)) return;
    // Rows switch the sheet to another item; popovers, dialogs and toasts
    // sit above it. An open popover takes the first outside click.
    if (e.target.closest("[data-peek], .popover, dialog, .toasts")) return;
    if (document.querySelector("[data-expanded]")) return;
    onClose();
  }


  $effect(() => {
    void expandHref;
    body?.scrollTo(0, 0);
  });
</script>

<style>
  .sheet {
    position: fixed;
    top: 3.5rem;
    right: 0;
    bottom: 0;
    width: min(46rem, 100vw);
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-canvas);
    border-left: 1px solid var(--color-border-subtle);
    box-shadow: var(--elevation-low);
  }
  /* The padding sits inside the scroller, not on it, so sticky headers in the
     content measure from the sheet's edge. */
  .body {
    flex: 1;
    overflow-y: auto;
  }
  .content {
    padding: 1.5rem;
  }
</style>

<svelte:window
  {onpointerdown}
  onkeydown={e => {
    const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, dialog");
    if (e.key === "Escape" && !e.defaultPrevented && !typing) onClose();
  }} />

<div class="sheet" bind:this={sheet} role="dialog" aria-label="Preview" in:fly|global={motion({ x: "100%", opacity: 1, duration: 320, easing: cubicOut })}
  out:fly|global={motion({ x: "100%", opacity: 1, duration: 220, easing: cubicIn })}>
  <div class="body" bind:this={body}>
    {#key expandHref}
      <div class="content" in:fade|global={motion({ duration: 180, delay: 60 })}>
        {@render children()}
      </div>
    {/key}
  </div>
</div>
