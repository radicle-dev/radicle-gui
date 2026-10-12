<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import type { VirtualizerHandle } from "virtua/svelte";

  import { Virtualizer } from "virtua/svelte";

  import type { ListCacheSnapshot } from "@app/lib/listState";

  import { getScrollViewport } from "@app/components/ScrollArea.svelte";

  interface Props {
    items: readonly T[];
    row: Snippet<[T, number]>;
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => void;
    getKey?: (item: T, index: number) => string | number;
    // Estimated item size in pixels; reduces scrollbar jump before measurement.
    estimatedItemSize?: number;
    // Extra pixels rendered before/after the viewport.
    bufferSize?: number;
    // Height of any content rendered before this list inside the same scroller.
    startMargin?: number;
    // Measure the list's own offset within the scroll viewport and use it as
    // `startMargin`, kept up to date as content above the list resizes. Use when
    // the list is not the first thing in the scroller (e.g. the patch diff sits
    // below the patch metadata and commit list).
    autoStartMargin?: boolean;
    // Distance from the bottom (in pixels) at which to request the next page.
    prefetchPx?: number;
    // Restore a previously-captured scroll position (used on history nav).
    initialCache?: ListCacheSnapshot;
    initialScrollOffset?: number;
    // Called once the restore has been applied, so the provider can stop
    // handing out the (now stale) values to later remounts of this list.
    onRestored?: () => void;
    // Reports the current scroll position so callers can persist it.
    onState?: (state: {
      scrollOffset: number;
      cache: ListCacheSnapshot;
    }) => void;
    // Reports scroll state for sticky headers: the topmost visible item index,
    // the current scroll offset, and a way to get any item's offset from start.
    onScrollState?: (state: {
      topIndex: number;
      scrollOffset: number;
      itemOffset: (index: number) => number;
    }) => void;
  }

  const {
    items,
    row,
    hasMore = false,
    loadingMore = false,
    onLoadMore = undefined,
    getKey = undefined,
    estimatedItemSize = undefined,
    bufferSize = undefined,
    startMargin = undefined,
    autoStartMargin = false,
    prefetchPx = 800,
    initialCache = undefined,
    initialScrollOffset = undefined,
    onRestored = undefined,
    onState = undefined,
    onScrollState = undefined,
  }: Props = $props();

  const getViewport = getScrollViewport();
  // Resolves once ScrollArea publishes its viewport (set in OverlayScrollbars'
  // `initialized`, which is deferred).
  const viewport = $derived(getViewport());

  let handle = $state<VirtualizerHandle | undefined>(undefined);
  let restored = false;

  // A zero-height marker placed right before the virtualizer; its position
  // tells us how far down the list starts inside the scroll viewport.
  let anchorEl = $state<HTMLElement | undefined>(undefined);
  let measuredStartMargin = $state(0);
  const effectiveStartMargin = $derived(
    autoStartMargin ? measuredStartMargin : startMargin,
  );

  function measureStartMargin() {
    if (!autoStartMargin || !anchorEl || !viewport) return;
    // Offset within the scroll content (scroll-invariant: the moving rect top is
    // cancelled by scrollTop), so it only changes when content above resizes.
    const offset =
      anchorEl.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top +
      viewport.scrollTop;
    const next = Math.max(0, Math.round(offset));
    if (next !== measuredStartMargin) {
      measuredStartMargin = next;
    }
  }

  $effect(() => {
    const vp = viewport;
    if (!autoStartMargin || !vp) return;
    // The content above the list lives in sibling/ancestor elements, not in this
    // component, so observe the viewport's direct children: any height change
    // upstream resizes the child that contains it. A MutationObserver keeps the
    // observed set current if those children are added/removed.
    const refresh = () => {
      measureStartMargin();
      // The list may not have scrolled, so re-report so sticky-header math picks
      // up the new margin immediately.
      reportScrollState();
    };
    const ro = new ResizeObserver(refresh);
    const observeChildren = () => {
      ro.disconnect();
      for (const child of Array.from(vp.children)) {
        ro.observe(child);
      }
    };
    const mo = new MutationObserver(() => {
      observeChildren();
      refresh();
    });
    observeChildren();
    mo.observe(vp, { childList: true });
    measureStartMargin();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  });

  $effect(() => {
    // Restore the saved scroll offset once, after the virtualizer has mounted
    // with the restored size cache (so the offset maps to the right item).
    if (restored || !handle) return;
    restored = true;
    if (initialScrollOffset) {
      handle.scrollTo(initialScrollOffset);
    }
    onRestored?.();
  });

  /// Scroll a given item into view, rendering it first if virtualisation has
  /// it unmounted. Callers reach this through `bind:this`.
  export function scrollToIndex(
    index: number,
    opts?: { align?: "start" | "center" | "end"; smooth?: boolean },
  ) {
    handle?.scrollToIndex(index, opts);
  }

  function reportState() {
    if (!handle || !onState) return;
    onState({
      scrollOffset: handle.getScrollOffset(),
      cache: handle.getCache(),
    });
  }

  function reportScrollState() {
    const h = handle;
    if (!h || !onScrollState) return;
    // `getScrollOffset` is the raw viewport scrollTop; `findItemIndex` expects it
    // raw (it subtracts the start margin internally). `getItemOffset` is
    // list-relative, so the reported offset is too, letting callers mix the two.
    const raw = h.getScrollOffset();
    onScrollState({
      topIndex: h.findItemIndex(raw),
      scrollOffset: raw - (effectiveStartMargin ?? 0),
      itemOffset: index => h.getItemOffset(index),
    });
  }

  function onScroll() {
    maybeLoadMore();
    reportScrollState();
  }

  function maybeLoadMore() {
    if (!onLoadMore || !hasMore || loadingMore) return;
    const el = viewport;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - prefetchPx) {
      onLoadMore();
    }
  }

  $effect(() => {
    // After the dataset grows (or the viewport first appears), the list may not
    // fill the viewport yet, so no scroll event would fire. Re-check on the next
    // frame, once Virtualizer has sized the scroll container.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    (items.length, hasMore, loadingMore, viewport);
    const id = requestAnimationFrame(() => {
      maybeLoadMore();
      reportScrollState();
      measureStartMargin();
    });
    return () => cancelAnimationFrame(id);
  });
</script>

{#if viewport}
  <div bind:this={anchorEl} style:height="0"></div>
  <Virtualizer
    bind:this={handle}
    data={items}
    scrollRef={viewport}
    {getKey}
    itemSize={estimatedItemSize}
    {bufferSize}
    startMargin={effectiveStartMargin}
    cache={initialCache}
    onscroll={onScroll}
    onscrollend={reportState}>
    {#snippet children(item: T, index: number)}
      {@render row(item, index)}
    {/snippet}
  </Virtualizer>
{/if}
