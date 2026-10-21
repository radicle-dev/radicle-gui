<script lang="ts">
  import type { ComponentProps } from "svelte";
  import debounce from "lodash/debounce";

  import Icon from "@app/components/Icon.svelte";

  import { formatObjectId } from "@app/lib/utils";
  import { toClipboard } from "@app/lib/utils";

  export let id: string;
  export let shorten: boolean = true;
  export let ariaLabel: string | undefined = undefined;
  export let styleWidth: string | undefined = undefined;
  export let title: string | undefined = undefined;
  // Keep a long id on one line and end it with an ellipsis instead of
  // wrapping, for ids shown in a width-constrained column.
  export let truncate: boolean = false;

  let icon: ComponentProps<Icon>["name"] = "copy";
  const text = "Click to copy";
  let tooltip = text;

  const restoreIcon = debounce(() => {
    icon = "copy";
    tooltip = text;
    visible = false;
  }, 1000);

  async function copy() {
    await toClipboard(id);
    icon = "checkmark";
    tooltip = "Copied to clipboard";
    restoreIcon();
  }

  let visible: boolean = false;
  export let debounceTimeout = 50;

  const setVisible = debounce((value: boolean) => {
    visible = value;
  }, debounceTimeout);
</script>

<style>
  .container {
    position: relative;
    display: inline-block;
  }
  .container.truncate {
    display: block;
    min-width: 0;
    max-width: 100%;
  }
  .txt-id.truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .popover {
    position: absolute;
    left: 1rem;
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

<div class="container" class:truncate style:width={styleWidth} {title}>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    style:display={truncate ? "block" : "inline-flex"}
    style:flex-wrap="wrap"
    on:mouseenter={() => {
      setVisible(true);
    }}
    on:mouseleave={() => {
      setVisible(false);
    }}
    class="txt-id"
    class:truncate
    style:cursor="copy"
    aria-label={ariaLabel}
    on:click|preventDefault|stopPropagation={async () => {
      await copy();
      setVisible(true);
    }}
    role="button"
    tabindex="0">
    <slot>
      {#if shorten}
        {formatObjectId(id)}
      {:else}
        {id}
      {/if}
    </slot>
  </div>

  {#if visible}
    <div style:position="absolute" style:top="-2rem">
      <div class="popover">
        <Icon name={icon} />
        {tooltip}
      </div>
    </div>
  {/if}
</div>
