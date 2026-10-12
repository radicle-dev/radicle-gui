<script lang="ts" module>
  import { getContext } from "svelte";

  const SCROLL_VIEWPORT_CONTEXT = Symbol("scroll-viewport");

  export function getScrollViewport(): () => HTMLElement | undefined {
    return (
      getContext<() => HTMLElement | undefined>(SCROLL_VIEWPORT_CONTEXT) ??
      (() => undefined)
    );
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import { OverlayScrollbarsComponent } from "overlayscrollbars-svelte";
  import { setContext } from "svelte";

  interface Props {
    children: Snippet;
    style?: string;
  }

  const { children, style = "height: 100%;" }: Props = $props();

  let viewport: HTMLElement | undefined = $state(undefined);
  setContext(SCROLL_VIEWPORT_CONTEXT, () => viewport);
</script>

<OverlayScrollbarsComponent
  element="div"
  {style}
  options={{
    scrollbars: { theme: "global-os-theme-radicle", autoHide: "scroll" },
  }}
  events={{
    initialized: instance => {
      viewport = instance.elements().viewport;
    },
  }}
  defer>
  {@render children()}
</OverlayScrollbarsComponent>
