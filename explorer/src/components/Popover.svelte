<script lang="ts" context="module">
  import { writable } from "svelte/store";

  // Stack of currently-open popovers, ordered outermost → innermost. This
  // supports nesting: a popover opened inside another's content is pushed on
  // top and both stay open. Opening an unrelated (sibling) popover drops the
  // ones that aren't its ancestors, so non-nested behaviour is unchanged —
  // only one popover per branch is ever open.
  const focusedStack = writable<HTMLDivElement[]>([]);

  // Close the topmost open popover — what every in-popover action (selecting
  // an item, navigating) wants when it dismisses "the popover I'm in".
  export function closeFocused() {
    focusedStack.update(stack => stack.slice(0, -1));
  }
</script>

<script lang="ts">
  import { onDestroy } from "svelte";

  export let popoverContainerMinWidth: string | undefined = undefined;
  export let popoverBorderRadius: string | undefined = undefined;
  export let popoverPadding: string | undefined = undefined;
  export let popoverPositionBottom: string | undefined = undefined;
  export let popoverPositionLeft: string | undefined = undefined;
  export let popoverPositionRight: string | undefined = undefined;
  export let popoverPositionTop: string | undefined = undefined;
  // On mobile, break out of the (possibly narrow, off-screen) anchored
  // position and span the viewport width, pinned below the header.
  export let popoverFullWidthOnMobile = false;

  export let expanded = false;
  let thisComponent: HTMLDivElement;

  function clickOutside(ev: MouseEvent | TouchEvent) {
    const path = ev.composedPath();
    focusedStack.update(stack => {
      // Pop popovers from the top while the click landed outside them. A
      // click inside a parent but outside its open child closes just the
      // child; a click outside everything closes the whole stack.
      let depth = stack.length;
      while (depth > 0 && !path.includes(stack[depth - 1])) {
        depth -= 1;
      }
      return depth === stack.length ? stack : stack.slice(0, depth);
    });
  }

  function toggle() {
    focusedStack.update(stack => {
      const index = stack.indexOf(thisComponent);
      if (index !== -1) {
        // Closing: also dismiss anything nested inside this popover.
        return stack.slice(0, index);
      }
      // Opening: keep only this popover's open ancestors (drop siblings and
      // unrelated open popovers), then push this one on top.
      const ancestors = stack.filter(c => c.contains(thisComponent));
      return [...ancestors, thisComponent];
    });
  }

  $: expanded = $focusedStack.includes(thisComponent);

  onDestroy(() => {
    focusedStack.update(stack => stack.filter(c => c !== thisComponent));
  });
</script>

<style>
  .container {
    position: relative;
  }
  .popover {
    background: var(--color-surface-canvas);
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--elevation-low);
    padding: 1rem;
    position: absolute;
    z-index: 10;
  }

  @media (max-width: 720px) {
    .popover.full-width-mobile {
      position: fixed;
      top: var(--global-header-height) !important;
      right: 0.5rem !important;
      bottom: auto !important;
      left: 0.5rem !important;
    }
  }
</style>

<svelte:window on:click={clickOutside} on:touchstart={clickOutside} />

<div
  bind:this={thisComponent}
  class="container"
  style:min-width={popoverContainerMinWidth}>
  <slot name="toggle" {expanded} {toggle} />

  {#if expanded}
    <div
      class="popover"
      class:full-width-mobile={popoverFullWidthOnMobile}
      style:bottom={popoverPositionBottom}
      style:left={popoverPositionLeft}
      style:right={popoverPositionRight}
      style:top={popoverPositionTop}
      style:padding={popoverPadding}
      style:border-radius={popoverBorderRadius}>
      <slot name="popover" {toggle} />
    </div>
  {/if}
</div>
