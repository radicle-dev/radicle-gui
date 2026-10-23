<script lang="ts">
  import type { DiffLineAnnotation } from "@pierre/diffs";
  import type { Snippet } from "svelte";
  import type { FileDiff as FileDiffData } from "@app/node/diff";

  import type { DiffStyle } from "@app/lib/diffStyle.svelte";

  import { VirtualizedFileDiff } from "@pierre/diffs";
  import { mount, unmount, untrack } from "svelte";

  import {
    acquireVirtualizer,
    getWorkerPool,
    gutterUnsafeCSS,
    surfaceUnsafeCSS,
    themes,
  } from "@app/lib/pierreView";

  import DiffSlot from "./DiffSlot.svelte";

  // One file of a diff, rendered by `@pierre/diffs` the way desktop renders it:
  // the same highlighting, colours and gutters. Only the lines near the visible
  // part of the page are in the DOM, so huge diffs stay quick to scroll.
  interface Props {
    file: FileDiffData;
    // Rendered under new-side lines, e.g. review comments or a draft.
    below?: Snippet<[string, number]>;
    // New-side lines that have something to show below them.
    lines?: number[];
    onAddComment?: (line: number) => void;
    diffStyle?: DiffStyle;
  }

  const {
    file,
    below,
    lines = [],
    onAddComment,
    diffStyle = "unified",
  }: Props = $props();

  // Code at the app's code size, on whole pixels so Pierre's rows line up.
  const LINE_HEIGHT = 20;

  let container = $state<HTMLElement>();
  let view = $state.raw<VirtualizedFileDiff | undefined>(undefined);
  let themeType = $state<"light" | "dark">(currentTheme());

  function currentTheme(): "light" | "dark" {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  }

  // Follows the app's theme switch, which flips `data-theme` on the root.
  $effect(() => {
    const observer = new MutationObserver(() => (themeType = currentTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  });

  // The "+" Pierre shows in the gutter of the hovered line. It lives in
  // Pierre's shadow root, so it carries its own styles.
  function gutterButton(
    getHovered: () => { lineNumber: number; side: string } | undefined,
  ) {
    if (!onAddComment) return undefined;
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Comment on this line";
    button.setAttribute("aria-label", "Comment on this line");
    button.style.cssText = [
      "all: unset",
      "box-sizing: border-box",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "width: 1rem",
      "height: 1rem",
      "border-radius: 2px",
      "cursor: pointer",
      "background: var(--color-surface-brand-primary)",
      "color: var(--color-text-on-brand)",
    ].join(";");
    button.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 3.5V7.5H12.5V8.5H8.5V12.5H7.5V8.5H3.5V7.5H7.5V3.5H8.5Z"/></svg>';
    button.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const row = getHovered();
      // Comments anchor to the new side; a removed line has no place there.
      if (row && row.side === "additions") onAddComment?.(row.lineNumber);
    });
    return button;
  }

  // Annotation contents are Svelte components mounted into the elements
  // Pierre creates. Mounting waits a microtask: Pierre asks from inside a
  // render this component drives from an effect, and a component mounted
  // there would be owned by that effect and torn down when it next runs.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative line→component lookup, never rendered reactively
  const mounted = new Map<
    number,
    { target: HTMLElement; instance?: ReturnType<typeof mount> }
  >();
  let flushQueued = false;

  function renderAnnotation(annotation: DiffLineAnnotation) {
    const target = document.createElement("div");
    mounted.set(annotation.lineNumber, { target });
    if (!flushQueued) {
      flushQueued = true;
      queueMicrotask(() => {
        flushQueued = false;
        for (const [line, entry] of mounted) {
          if (entry.instance || !below) continue;
          entry.instance = mount(DiffSlot, {
            target: entry.target,
            props: { content: below, path: file.path, line },
          });
        }
      });
    }
    return target;
  }

  function clearMounted() {
    for (const entry of mounted.values())
      if (entry.instance) void unmount(entry.instance);
    mounted.clear();
  }

  const annotations = $derived(
    lines.map(lineNumber => ({ side: "additions" as const, lineNumber })),
  );

  function options() {
    return {
      theme: themes,
      themeType,
      diffStyle,
      diffIndicators: "bars" as const,
      lineDiffType: "word-alt" as const,
      disableFileHeader: true,
      unsafeCSS: gutterUnsafeCSS + surfaceUnsafeCSS,
      enableGutterUtility: !!onAddComment,
      renderGutterUtility: gutterButton,
      renderAnnotation,
    };
  }

  $effect(() => {
    const el = container;
    if (!el) return;
    const oldFile =
      file.before === undefined
        ? null
        : { name: file.path, contents: file.before };
    const newFile =
      file.after === undefined
        ? null
        : { name: file.path, contents: file.after };
    return untrack(() => {
      const { virtualizer, release } = acquireVirtualizer(el);
      const instance = new VirtualizedFileDiff(
        options(),
        virtualizer,
        { lineHeight: LINE_HEIGHT, diffHeaderHeight: 0 },
        getWorkerPool(),
      );
      view = instance;
      instance.render({
        oldFile,
        newFile,
        containerWrapper: el,
        lineAnnotations: annotations,
      } as Parameters<VirtualizedFileDiff["render"]>[0]);
      return () => {
        view = undefined;
        clearMounted();
        instance.cleanUp();
        release();
      };
    });
  });

  // New comments or drafts: hand Pierre the new set of annotated lines.
  $effect(() => {
    const next = annotations;
    const instance = view;
    if (!instance) return;
    untrack(() => {
      for (const [line, entry] of mounted) {
        if (!next.some(a => a.lineNumber === line)) {
          if (entry.instance) void unmount(entry.instance);
          mounted.delete(line);
        }
      }
      instance.setLineAnnotations(next);
      instance.rerender();
    });
  });

  $effect(() => {
    void themeType;
    void diffStyle;
    const instance = view;
    if (!instance) return;
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
  style:--diffs-line-height="{LINE_HEIGHT}px">
</div>
