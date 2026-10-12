<script lang="ts" module>
  let focused = $state<
    { id: string; floatingEl: HTMLElement | undefined } | undefined
  >(undefined);

  export function closeFocused() {
    focused = undefined;
  }
</script>

<script lang="ts">
  import type { Placement } from "@floating-ui/dom";
  import type { Snippet } from "svelte";

  import {
    autoUpdate,
    computePosition,
    flip,
    offset as floatingOffset,
    shift,
  } from "@floating-ui/dom";

  import { portal } from "@app/lib/portal";

  interface Props {
    toggle: Snippet<[() => void]>;
    popover: Snippet;
    placement?: Placement;
    offset?: number;
    popoverPadding?: string;
    expanded?: boolean;
    styleDisplay?: string;
    /* Popovers portal to the body at a z-index that sits below the modal
       layer, so one opened from inside a modal needs to be raised above it. */
    styleZIndex?: string;
  }

  /* eslint-disable prefer-const */
  let {
    toggle,
    popover,
    placement = "bottom-start",
    offset: offsetPx = 4,
    popoverPadding,
    expanded = $bindable(false),
    styleDisplay = undefined,
    styleZIndex = undefined,
  }: Props = $props();
  /* eslint-enable prefer-const */

  const id = crypto.randomUUID();
  let containerEl: HTMLDivElement | undefined = $state();
  let floatingEl: HTMLDivElement | undefined = $state();

  function clickOutside(ev: MouseEvent | TouchEvent) {
    if (focused?.id === id) {
      const path = ev.composedPath();
      const insideContainer = containerEl && path.includes(containerEl);
      const insideFloating = floatingEl && path.includes(floatingEl);
      if (!insideContainer && !insideFloating) {
        closeFocused();
      }
    }
  }

  function toggleFn() {
    if (focused?.id === id) {
      closeFocused();
    } else {
      focused = { id, floatingEl: undefined };
    }
  }

  $effect(() => {
    expanded = focused?.id === id;
  });

  $effect(() => {
    if (floatingEl && containerEl) {
      const cleanup = autoUpdate(containerEl, floatingEl, () => {
        void computePosition(containerEl!, floatingEl!, {
          placement,
          middleware: [floatingOffset(offsetPx), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          if (floatingEl) {
            floatingEl.style.left = `${x}px`;
            floatingEl.style.top = `${y}px`;
            floatingEl.style.visibility = "visible";
          }
        });
      });
      return cleanup;
    }
  });
</script>

<style>
  .container {
    position: relative;
  }
  .popover {
    box-shadow: var(--elevation-low);
    border-radius: var(--border-radius-md);
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    z-index: 400;
  }
</style>

<svelte:window onclick={clickOutside} ontouchstart={clickOutside} />

<div
  data-popover-id={id}
  data-expanded={expanded || undefined}
  bind:this={containerEl}
  class="container"
  style:display={styleDisplay}>
  {@render toggle(toggleFn)}

  {#if expanded}
    <div
      use:portal
      bind:this={floatingEl}
      class="popover"
      style:padding={popoverPadding}
      style:z-index={styleZIndex}>
      {@render popover()}
    </div>
  {/if}
</div>
