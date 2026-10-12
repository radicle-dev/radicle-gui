<script lang="ts">
  import { File } from "@pierre/diffs";
  import { untrack } from "svelte";

  import { fontSettings } from "@app/lib/appearance.svelte";
  import {
    codeLineHeight,
    getWorkerPool,
    gutterUnsafeCSS,
    surfaceUnsafeCSS,
    themes,
  } from "@app/lib/pierreView";

  import { theme } from "@app/components/ThemeSwitch.svelte";

  interface Props {
    contents: string;
    path: string;
    // Keys the shared worker pool's highlight cache, so it must be unique to
    // this exact text.
    cacheKey: string;
  }

  const { contents, path, cacheKey }: Props = $props();

  let container = $state<HTMLElement>();
  let view = $state.raw<File | undefined>(undefined);

  const lineHeightPx = $derived(codeLineHeight(fontSettings.size));

  function options() {
    return {
      theme: themes,
      themeType: $theme,
      disableFileHeader: true,
      unsafeCSS: gutterUnsafeCSS + surfaceUnsafeCSS,
    };
  }

  $effect(() => {
    const el = container;
    if (!el) {
      return;
    }
    const file = { name: path, contents, cacheKey };
    return untrack(() => {
      const instance = new File(options(), getWorkerPool());
      view = instance;
      instance.render({ file, containerWrapper: el });
      return () => {
        view = undefined;
        instance.cleanUp();
      };
    });
  });

  $effect(() => {
    void $theme;
    void lineHeightPx;
    const instance = view;
    if (!instance) {
      return;
    }
    untrack(() => {
      instance.setOptions(options());
      instance.rerender();
    });
  });
</script>

<style>
  .file {
    min-width: 0;
  }
</style>

<div
  bind:this={container}
  class="file global-pierre-surface"
  style:--diffs-line-height="{lineHeightPx}px">
</div>
