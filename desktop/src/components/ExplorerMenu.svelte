<script module lang="ts">
  export interface MenuPosition {
    x: number;
    y: number;
    target: HTMLElement;
  }

  export function keepSelection(event: MouseEvent) {
    if (event.button === 2) event.preventDefault();
  }

  export function menuPosition(event: MouseEvent): MenuPosition {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    return {
      x: event.clientX,
      y: event.clientY,
      target: event.currentTarget as HTMLElement,
    };
  }
</script>

<script lang="ts">
  import type { Config } from "@bindings/config/Config";

  import { writeToClipboard } from "@app/lib/invoke";
  import { seedRepo } from "@app/lib/seedRepo";
  import { explorerHost } from "@app/lib/utils";

  import ContextMenu from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    x: number;
    y: number;
    target: HTMLElement;
    url?: string;
    uri: string;
    /** A repo that isn't on this node, offered for seeding. */
    seedRid?: string;
    config: Config;
    onclose: () => void;
  }

  const { x, y, target, url, uri, seedRid, config, onclose }: Props = $props();
</script>

<ContextMenu {x} {y} {target} {onclose}>
  {#if url}
    <a
      class="menu-item"
      role="menuitem"
      href={url}
      target="_blank"
      rel="noreferrer noopener">
      <Icon name="open-external" />
      Open in {explorerHost(config)}
    </a>
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => writeToClipboard(url)}>
      <Icon name="link" />
      Copy link to {explorerHost(config)}
    </button>
    <div class="menu-separator"></div>
  {/if}
  <button
    class="menu-item"
    role="menuitem"
    onclick={() => writeToClipboard(uri)}>
    <Icon name="copy" />
    Copy rad: URI
  </button>
  {#if seedRid}
    <div class="menu-separator"></div>
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => void seedRepo(seedRid).catch(console.error)}>
      <Icon name="seed" />
      Seed repository
    </button>
  {/if}
</ContextMenu>
