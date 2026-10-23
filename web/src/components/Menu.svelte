<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";

  import { navigate } from "@app/lib/router.svelte";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  interface MenuItem {
    label: string;
    href?: string;
    onclick?: () => void;
    icon?: ComponentProps<typeof Icon>["name"];
    // Shows the org's avatar in place of an icon.
    org?: string;
    danger?: boolean;
    divider?: boolean;
  }

  interface Props {
    trigger: Snippet<[() => void]>;
    items: MenuItem[];
    header?: Snippet;
    placement?: ComponentProps<typeof Popover>["placement"];
  }

  const { trigger, items, header, placement = "bottom-end" }: Props = $props();

  function run(item: MenuItem) {
    closeFocused();
    if (item.href) navigate(item.href);
    item.onclick?.();
  }
</script>

<style>
  .menu {
    min-width: 13rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    padding: 0.25rem;
  }
  button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  button:hover {
    background: var(--color-surface-subtle);
  }
  .danger {
    color: var(--color-feedback-error-text);
  }
  hr {
    border: none;
    border-top: 1px solid var(--color-border-subtle);
    margin: 0.25rem 0;
  }
</style>

<Popover {placement} toggle={trigger}>
  {#snippet popover()}
    <div class="menu">
      {#if header}{@render header()}<hr />{/if}
      {#each items as item (item.label)}
        {#if item.divider}<hr />{/if}
        <button class:danger={item.danger} onclick={() => run(item)}>
          {#if item.org}<Avatar org={item.org} size="1rem" />{:else if item.icon}<Icon name={item.icon} />{/if}
          {item.label}
        </button>
      {/each}
    </div>
  {/snippet}
</Popover>
