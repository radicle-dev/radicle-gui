<script lang="ts">
  import type { ComponentProps } from "svelte";

  import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
  } from "@floating-ui/dom";
  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import { portal } from "@app/lib/portal";
  import { formatOid } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    ariaLabel?: string;
    clipboard: string;
    id: string;
    // What the hash is (e.g. "patch ID"), named in the tooltip.
    label?: string;
    shorten?: boolean;
  }

  const { ariaLabel, clipboard, id, label, shorten = true }: Props = $props();

  let icon: ComponentProps<typeof Icon>["name"] = $state("copy");
  let copied = $state(false);
  const tooltip = $derived(
    copied ? "Copied to clipboard" : label ? `Copy ${label}` : "Click to copy",
  );

  const restoreIcon = debounce(() => {
    icon = "copy";
    copied = false;
  }, 1000);

  async function copy() {
    await writeToClipboard(clipboard);
    icon = "checkmark";
    copied = true;
    restoreIcon();
  }

  let visible: boolean = $state(false);
  let anchorEl: HTMLDivElement | undefined = $state();
  let floatingEl: HTMLDivElement | undefined = $state();

  const setVisible = debounce((value: boolean) => {
    visible = value;
  }, 50);

  $effect(() => {
    // Re-run when the tooltip text changes so the wider "Copied to clipboard"
    // text is repositioned and doesn't overflow the viewport edge.
    void tooltip;
    if (floatingEl && anchorEl) {
      const cleanup = autoUpdate(anchorEl, floatingEl, () => {
        void computePosition(anchorEl!, floatingEl!, {
          placement: "top-start",
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
</script>

<style>
  .container {
    display: inline-block;
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
    /* Portaled to the body, so it has to clear the modal layer as well. */
    z-index: 400;
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
  .txt-id:hover {
    color: var(--color-text-primary);
  }
</style>

<div class="container" bind:this={anchorEl}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    onmouseenter={() => {
      setVisible(true);
    }}
    onmouseleave={() => {
      setVisible(false);
    }}
    class="txt-id"
    style:cursor="pointer"
    aria-label={ariaLabel}
    onclick={async event => {
      event.stopPropagation();
      await copy();
      setVisible(true);
    }}
    role="button"
    tabindex="0">
    {#if shorten}
      {formatOid(id)}
    {:else}
      {id}
    {/if}
  </div>

  {#if visible}
    <div use:portal bind:this={floatingEl} class="popover">
      <Icon name={icon} />
      {tooltip}
    </div>
  {/if}
</div>
