<script lang="ts">
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type { DiffLineAnnotation } from "@pierre/diffs";

  import { FileDiff, processPatch } from "@pierre/diffs";
  import { mount, unmount, untrack } from "svelte";

  import { fontSettings } from "@app/lib/appearance.svelte";
  import type { CodeComments } from "@app/lib/codeComments";
  import { forwardPatchActivityContext } from "@app/lib/patchActivityContext";
  import type { LineAnnotation } from "@app/lib/pierreComments";
  import {
    annotationSignature,
    fileAnnotations,
  } from "@app/lib/pierreComments";
  import {
    codeLineHeight,
    getWorkerPool,
    gutterUnsafeCSS,
    surfaceUnsafeCSS,
    themes,
  } from "@app/lib/pierreView";

  import CommentAnnotation from "@app/components/CommentAnnotation.svelte";
  import { CommentAnnotationState } from "@app/components/commentAnnotationState.svelte";
  import { theme } from "@app/components/ThemeSwitch.svelte";

  interface Props {
    // Unified `git diff` patch text for exactly one file, already cut down to
    // the lines worth showing.
    patch: string;
    // The file the patch is for, which is what anchors the comments.
    path: string;
    // Must be unique to this exact text: it keys the shared worker pool's
    // highlight cache, and a few lines of a file are not the same content as the
    // whole file at that path. A collision serves a mismatched highlight and the
    // snippet renders blank.
    cacheKey: string;
    // Comments to show under the lines they are anchored to.
    threads?: Thread<CodeLocation>[];
    codeComments?: CodeComments;
    diffIndicators?: "classic" | "bars" | "none";
    lineDiffType?: "word-alt" | "word" | "char" | "none";
  }

  const {
    patch,
    path,
    cacheKey,
    threads = [],
    codeComments,
    diffIndicators = "bars",
    lineDiffType = "word-alt",
  }: Props = $props();

  let container = $state<HTMLElement>();
  let view = $state.raw<FileDiff<LineAnnotation> | undefined>(undefined);
  let error = $state<string | undefined>(undefined);

  const lineHeightPx = $derived(codeLineHeight(fontSettings.size));

  // Always unified: a snippet sits in a card the width of the surrounding page
  // text, which two columns of code do not fit into. Nothing here is
  // virtualized, so there are no `itemMetrics` to keep in step and no scroll
  // port to own — the element grows to the lines it renders.
  function options() {
    return {
      theme: themes,
      themeType: $theme,
      diffStyle: "unified" as const,
      diffIndicators,
      lineDiffType,
      // The host says which file this is; a second header inside every snippet
      // would only repeat it.
      disableFileHeader: true,
      // A snippet is deliberately only the lines a comment is about, cut out of
      // the file, and there is no `loadDiffFiles` behind it to expand into. This
      // is the separator style that carries no expansion affordance at all:
      // Pierre skips the "more context" markers for it outright and emits only a
      // plain divider between hunks, which a one-hunk snippet never reaches.
      hunkSeparators: "simple" as const,
      unsafeCSS: gutterUnsafeCSS + surfaceUnsafeCSS,
      renderAnnotation,
    };
  }

  // One annotation per (side, line), which is all Pierre can address — it names
  // the slot after those two. Only recomputed when the set of lines changes:
  // replacing the array makes Pierre drop and rebuild every annotation element,
  // taking the mounted components with it, and a reply or a resolve changes what
  // a slot renders without moving it.
  const annotationList = $derived.by(() =>
    fileAnnotations(path, threads, undefined),
  );
  const annotationKey = $derived(annotationSignature(annotationList));
  let stableAnnotations = $state.raw<DiffLineAnnotation<LineAnnotation>[]>([]);
  let stableKey: string | undefined;
  $effect(() => {
    const next = annotationList;
    const key = annotationKey;
    if (key === stableKey) {
      return;
    }
    stableKey = key;
    stableAnnotations = next;
  });

  // Mounting is deferred out of whatever is running when Pierre asks for an
  // annotation: it asks from inside a render, which this component drives from
  // its effects, and Svelte parents a `mount()` root to the effect that was
  // running when it was created — orphaning it, and silently stopping its own
  // effects, when that effect next runs. In a microtask there is no effect to be
  // parented to. Plain variables rather than state: purely imperative
  // bookkeeping.
  //
  // Keyed by side and line, which is what identifies an annotation to Pierre.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative key→component lookup, never rendered reactively
  const mounted = new Map<
    string,
    {
      state: CommentAnnotationState;
      instance: ReturnType<typeof mount> | undefined;
      target: HTMLElement;
    }
  >();
  // Read during init, so it has to be captured outside the mount callbacks.
  const annotationContext = forwardPatchActivityContext();
  let flushQueued = false;

  function queueMounts(): void {
    if (flushQueued) {
      return;
    }
    flushQueued = true;
    queueMicrotask(() => {
      flushQueued = false;
      for (const entry of mounted.values()) {
        entry.instance ??= mount(CommentAnnotation, {
          target: entry.target,
          props: { state: entry.state },
          context: annotationContext,
        });
      }
    });
  }

  function renderAnnotation(
    annotation: DiffLineAnnotation<LineAnnotation>,
  ): HTMLElement {
    const key = `${annotation.side}:${annotation.lineNumber}`;
    const existing = mounted.get(key);
    if (existing) {
      return existing.target;
    }
    const target = document.createElement("div");
    // Pierre's own annotation wrapper does the same: the slot's shadow context
    // is a `pre`, whose `white-space` inherits into slotted content and would
    // hold a comment to one line.
    target.style.whiteSpace = "normal";
    const state = new CommentAnnotationState();
    state.annotation = annotation.metadata;
    state.comments = codeComments;
    mounted.set(key, { state, instance: undefined, target });
    queueMounts();
    return target;
  }

  function unmountAnnotations(): void {
    for (const entry of mounted.values()) {
      if (entry.instance) {
        void unmount(entry.instance);
      }
      entry.target.remove();
    }
    mounted.clear();
  }

  // What each mounted annotation shows, pushed in rather than handed to Pierre:
  // it only knows which slots exist, so its copy goes stale on every reply and
  // resolve.
  $effect(() => {
    const list = annotationList;
    const comments = codeComments;
    untrack(() => {
      for (const annotation of list) {
        const entry = mounted.get(
          `${annotation.side}:${annotation.lineNumber}`,
        );
        if (!entry) {
          continue;
        }
        entry.state.annotation = annotation.metadata;
        entry.state.comments = comments;
      }
    });
  });

  // Structural rebuild: only when the text or the container changes. Everything
  // past those is untracked, since the first render reaches straight into
  // `renderAnnotation`, which reads the comment props.
  $effect(() => {
    const el = container;
    if (!el) {
      return;
    }
    const text = patch;
    const key = cacheKey;
    return untrack(() => {
      const instance = new FileDiff<LineAnnotation>(options(), getWorkerPool());
      let fileDiff;
      try {
        fileDiff = processPatch(text, key).files[0];
      } catch (parseError) {
        console.error("PierreSnippet: failed to parse patch", parseError);
      }
      if (!fileDiff) {
        error = "Code unavailable";
        instance.cleanUp();
        return;
      }
      error = undefined;
      view = instance;
      instance.render({
        fileDiff,
        containerWrapper: el,
        lineAnnotations: stableAnnotations,
      });
      return () => {
        view = undefined;
        unmountAnnotations();
        instance.cleanUp();
      };
    });
  });

  // Theme, font size and diff preferences: pushed into the existing instance
  // rather than rebuilding it, which would re-parse and re-highlight.
  $effect(() => {
    void $theme;
    void diffIndicators;
    void lineDiffType;
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

  // A comment appearing on or leaving a line changes which slots there are, so
  // Pierre has to be told; anything else about a comment goes through the
  // mounted components above.
  $effect(() => {
    const list = stableAnnotations;
    const instance = view;
    if (!instance) {
      return;
    }
    untrack(() => {
      instance.setLineAnnotations(list);
      instance.rerender();
    });
  });
</script>

<style>
  .snippet {
    /* Pierre puts the horizontal scroll on its own inner code element, so this
       only has to not stretch the card. */
    min-width: 0;
  }
  .error {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    padding: 0.5rem 0.75rem;
  }
</style>

{#if error}
  <div class="error">{error}</div>
{/if}
<div
  bind:this={container}
  class="snippet global-pierre-surface"
  style:--diffs-line-height="{lineHeightPx}px">
</div>
