<script lang="ts" generics="T">
  import type { Snippet } from "svelte";

  import { useOverlayScrollbars } from "overlayscrollbars-svelte";

  interface Props {
    item: Snippet<[T]>;
    empty?: Snippet;
    items: T[];
    styleDropdownMinWidth?: string;
    styleDropdownMaxHeight?: string;
  }

  const {
    item,
    empty,
    items,
    styleDropdownMinWidth,
    styleDropdownMaxHeight = "60vh",
  }: Props = $props();

  let dropdownElement: HTMLDivElement | undefined = undefined;

  $effect(() => {
    if (dropdownElement) {
      const [initialize] = useOverlayScrollbars({
        options: () => ({
          scrollbars: {
            theme: "global-os-theme-radicle",
            autoHide: "scroll",
          },
        }),
        defer: true,
      });

      initialize({ target: dropdownElement });
    }
  });
</script>

<style>
  .dropdown {
    align-items: center;
    overflow-y: auto;
  }
  .dropdown-item {
    padding: 1px;
    font: var(--txt-body-m-regular);
  }
</style>

<div
  class="dropdown"
  bind:this={dropdownElement}
  style:min-width={styleDropdownMinWidth}
  style:max-height={styleDropdownMaxHeight}>
  {#each items as i}
    <div class="dropdown-item">
      {@render item(i)}
    </div>
  {:else}
    <div class="dropdown-item">
      {@render empty?.()}
    </div>
  {/each}
</div>
