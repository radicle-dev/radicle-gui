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
  import debounce from "lodash/debounce";

  import { portal } from "@app/lib/portal";

  interface Props {
    popover: Snippet;
    placement?: Placement;
    offset?: number;
    stylePadding?: string;
    toggle: Snippet;
  }

  const {
    popover,
    placement = "top",
    offset: offsetPx = 4,
    stylePadding = "0.5rem 1rem",
    toggle,
  }: Props = $props();

  let visible: boolean = $state(false);
  let anchorEl: HTMLDivElement | undefined = $state();
  let floatingEl: HTMLDivElement | undefined = $state();

  // Whether the pointer is currently over the anchor or popover.
  let hovering = false;
  // Whether focus is inside the anchor or popover, so that a keyboard user can
  // reach any controls the popover holds.
  let focused = false;
  // Whether a text-selection drag started inside the popover is ongoing.
  let selecting = false;

  const show = debounce(() => {
    visible = true;
  }, 100);

  const hide = debounce(() => {
    visible = false;
  }, 200);

  function open() {
    hide.cancel();
    show();
  }

  // Any one of pointer, focus or an ongoing selection drag is enough to keep
  // the popover open, so closing waits until none of them holds it.
  function close() {
    if (!hovering && !focused && !selecting) {
      show.cancel();
      hide();
    }
  }

  function enter() {
    hovering = true;
    open();
  }

  function leave() {
    hovering = false;
    close();
  }

  // Focus crossing between the anchor and the portalled popover leaves and
  // re-enters within one task, which the debounced hide absorbs.
  function focus() {
    focused = true;
    open();
  }

  function blur() {
    focused = false;
    close();
  }

  // A text-selection drag can move the pointer outside the popover and release
  // anywhere, so we follow it for the duration of the drag with a listener that
  // removes itself on release, rather than closing on pointer-leave.
  function endSelection() {
    selecting = false;
    document.removeEventListener("pointerup", endSelection);
    close();
  }

  function startSelection() {
    selecting = true;
    hide.cancel();
    document.addEventListener("pointerup", endSelection);
  }

  $effect(() => {
    if (floatingEl && anchorEl) {
      const cleanup = autoUpdate(anchorEl, floatingEl, () => {
        void computePosition(anchorEl!, floatingEl!, {
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
    display: inline-block;
  }
  .popover {
    background: var(--color-surface-subtle);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--elevation-low);
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    border-radius: var(--border-radius-md);
    z-index: 400;
  }
</style>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="container"
  bind:this={anchorEl}
  onmouseenter={enter}
  onmouseleave={leave}
  onfocusin={focus}
  onfocusout={blur}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="button"
    tabindex="0"
    onclick={e => {
      e.stopPropagation();
    }}>
    {@render toggle()}
  </div>

  {#if visible}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      use:portal
      bind:this={floatingEl}
      class="popover"
      style:padding={stylePadding}
      onmouseenter={enter}
      onmouseleave={leave}
      onfocusin={focus}
      onfocusout={blur}
      onpointerdown={startSelection}
      onclick={e => e.stopPropagation()}>
      {@render popover()}
    </div>
  {/if}
</div>
