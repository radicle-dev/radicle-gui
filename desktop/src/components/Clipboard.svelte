<svelte:options customElement="radicle-clipboard" />

<script lang="ts">
  import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
  } from "@floating-ui/dom";
  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    text: string;
    noPopover?: boolean;
  }

  const { text, noPopover = false }: Props = $props();

  let icon: "copy" | "checkmark" = $state("copy");
  let tooltip = $state("Click to copy");
  let visible = $state(false);
  let anchorEl: HTMLElement | undefined = $state();
  let floatingEl: HTMLDivElement | undefined = $state();

  const restoreIcon = debounce(() => {
    icon = "copy";
    tooltip = "Click to copy";
    visible = false;
  }, 1000);

  const setVisible = debounce((value: boolean) => {
    visible = value;
  }, 50);

  $effect(() => {
    void tooltip;
    if (floatingEl && anchorEl) {
      const cleanup = autoUpdate(anchorEl, floatingEl, () => {
        void computePosition(anchorEl!, floatingEl!, {
          placement: "top",
          middleware: [offset(6), flip(), shift({ padding: 8 })],
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

  export async function copy() {
    await writeToClipboard(text);
    icon = "checkmark";
    tooltip = "Copied to clipboard";
    if (!noPopover) {
      setVisible(true);
    }
    restoreIcon();
  }
</script>

<style>
  .container {
    display: inline-flex;
  }
  .clipboard {
    width: 1.5rem;
    height: 1.5rem;
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    user-select: none;
  }
  .popover {
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    display: flex;
    align-items: center;
    flex-direction: row;
    gap: 0.5rem;
    justify-content: center;
    z-index: 20;
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    font: var(--txt-body-m-regular);
    white-space: nowrap;
    width: max-content;
    padding: 0.25rem 0.5rem;
  }
</style>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<span
  role="group"
  class="container"
  bind:this={anchorEl}
  onmouseenter={() => !noPopover && setVisible(true)}
  onmouseleave={() => !noPopover && setVisible(false)}>
  <span role="button" tabindex="0" class="clipboard" onclick={copy}>
    <Icon name={icon} />
  </span>
  {#if visible}
    <div bind:this={floatingEl} class="popover">
      <Icon name={icon} />
      {tooltip}
    </div>
  {/if}
</span>
