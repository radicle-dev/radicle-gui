import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";

import type { ListCacheSnapshot } from "@app/lib/listState";
import { readListState, saveListState } from "@app/lib/listState";
import * as mutexExecutor from "@app/lib/mutexExecutor";
import * as router from "@app/lib/router";

export interface PaginatedListOptions<T> {
  // Scroll-restoration cache key; changes when the list's filter changes.
  key: () => string;
  // The route loader's freshly fetched first page (reactive prop access).
  page: () => PaginatedQuery<T[]>;
  // Fetch a page from the backend; `take === undefined` means all rows.
  fetchPage: (
    skip: number,
    take: number | undefined,
  ) => Promise<PaginatedQuery<T[]>>;
  pageSize: number;
  // Stable identity used to dedupe overlapping pages.
  id: (item: T) => string;
  // Skip persisting scroll state (e.g. while a fuzzy filter is active, since
  // the rendered rows don't match the cached item list).
  skipPersist?: () => boolean;
}

// Paginated list state shared by the Issues/Patches/Commits views: an
// incrementally loaded item list with mutex-guarded page fetches, plus scroll
// restoration for back/forward navigation. Must be called during component
// init (it registers an $effect).
export function createPaginatedList<T>(opts: PaginatedListOptions<T>) {
  // Restore the prior list and scroll position only when arriving via
  // back/forward; a fresh navigation (sidebar, links) starts from the top.
  const restored = router.isHistoryNavigation()
    ? readListState<T>(opts.key())
    : undefined;

  // The snapshot is trusted as a scroll anchor, never as data — its contents
  // are as old as the moment the user left. The route loader re-fetches the
  // first page on every navigation (including history), so a snapshot no
  // deeper than one page is replaced by that fresh page outright, at no
  // extra cost. A deeper snapshot seeds the list for instant paint and the
  // whole restored window is refetched in the background (see the
  // revalidate call below).
  let seedItems: T[];
  let seedMore: boolean;
  let staleWindow: number | undefined;
  if (restored !== undefined && restored.items.length > opts.pageSize) {
    seedItems = restored.items;
    seedMore = restored.more;
    staleWindow = restored.items.length;
  } else {
    seedItems = opts.page().content;
    seedMore = opts.page().more;
  }

  let items = $state(seedItems);
  // Rows fetched so far — used as the pagination offset. Tracked separately
  // from items.length because appends are deduped (overlapping pages, e.g.
  // when the list grows underneath us, must still advance the offset).
  let cursor = seedItems.length;
  let more = $state(seedMore);
  let loadingMore = $state(false);
  let activeKey = opts.key();

  const loader = mutexExecutor.create();
  const abort = async (): Promise<undefined> => undefined;

  // Parent reuses the view across filter changes; a key change resets the
  // pagination state from the loader's fresh page.
  $effect(() => {
    const key = opts.key();
    const fresh = opts.page();
    // Skip the initial mount (state is seeded above, possibly restored); only
    // reset when the key actually changes.
    if (key === activeKey) return;
    activeKey = key;
    items = fresh.content;
    cursor = fresh.content.length;
    more = fresh.more;
    // Abort any in-flight loadMore so it cannot append a page from the
    // previous filter onto the just-reset items. The aborted call leaves
    // `loadingMore` to its superseder — and here that superseder is this
    // abort task, which never clears it, so reset the flag explicitly or
    // load-more stays disabled for the new list forever.
    void loader.run(abort);
    loadingMore = false;
  });

  async function loadMore(all: boolean = false): Promise<void> {
    if (!more) return;
    loadingMore = true;
    let superseded = false;
    try {
      const page = await loader.run(async () =>
        opts.fetchPage(all ? 0 : cursor, all ? undefined : opts.pageSize),
      );

      // Superseded by a newer load (e.g. fuzzy-focus triggered a load-all).
      // Leave items/more alone for the new call. The flag stays set too: the
      // newer call owns it now, and clearing it here would let the
      // virtualizer's auto load-more re-fire and abort that call in turn.
      if (page === undefined) {
        superseded = true;
        return;
      }

      more = page.more;
      if (all) {
        items = page.content;
        cursor = page.content.length;
      } else {
        // Drop ids already shown so duplicate keys never reach the virtual
        // list (which would leave blank, persistent gaps); still advance the
        // offset by the rows fetched so paging keeps moving forward.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local set, never rendered
        const seen = new Set(items.map(opts.id));
        items = [...items, ...page.content.filter(i => !seen.has(opts.id(i)))];
        cursor += page.content.length;
      }
      if (page.content.length === 0) more = false;
    } catch (error) {
      // Callers fire-and-forget (the virtualizer's load-more trigger), so
      // failures are logged here instead of surfacing as unhandled
      // rejections; the finally below re-enables the next attempt.
      console.error("Loading more list items failed: ", error);
    } finally {
      if (!superseded) {
        loadingMore = false;
      }
    }
  }

  // Refetch the first `window` rows in one request and replace the list
  // wholesale: stale-while-revalidate after a history restore, first page
  // after a cache rebuild. `loadingMore` stays set for the duration, which
  // both surfaces the refresh and keeps the virtualizer's auto load-more
  // from racing it and appending a page onto items about to be replaced.
  // A newer load (e.g. fuzzy-focus load-all) superseding the refetch is
  // fine: every competitor fetches a fresher, same-or-larger window.
  async function revalidate(window: number = opts.pageSize): Promise<void> {
    loadingMore = true;
    let superseded = false;
    try {
      const page = await loader.run(async () => opts.fetchPage(0, window));
      if (page === undefined) {
        superseded = true;
        return;
      }
      items = page.content;
      cursor = page.content.length;
      more = page.more;
    } catch (error) {
      // The history-restore call site is fire-and-forget; a failed refresh
      // logs and leaves the snapshot on screen rather than rejecting
      // unhandled.
      console.error("Revalidating the list failed: ", error);
    } finally {
      if (!superseded) {
        loadingMore = false;
      }
    }
  }

  if (staleWindow !== undefined) {
    void revalidate(staleWindow);
  }

  // Persist the loaded list + scroll position so back/forward can restore it.
  // Only the unfiltered list is cached, so its length matches virtua's size
  // snapshot.
  function persistScroll(state: {
    scrollOffset: number;
    cache: ListCacheSnapshot;
  }): void {
    if (opts.skipPersist?.()) return;
    saveListState(opts.key(), {
      items: [...items],
      more,
      scrollOffset: state.scrollOffset,
      cache: state.cache,
    });
  }

  // The restore values are handed out once: VirtualList applies them on its
  // first mount and reports back via consumeRestoredScroll. A later remount
  // of the same list (e.g. the empty-fuzzy-filter branch swapping it out and
  // back) must start fresh instead of re-applying a stale offset against
  // items that may have changed since.
  let restoredScroll = restored
    ? { scrollOffset: restored.scrollOffset, cache: restored.cache }
    : undefined;

  return {
    get items() {
      return items;
    },
    get more() {
      return more;
    },
    get loadingMore() {
      return loadingMore;
    },
    get initialScrollOffset() {
      return restoredScroll?.scrollOffset;
    },
    get initialCache() {
      return restoredScroll?.cache;
    },
    consumeRestoredScroll() {
      restoredScroll = undefined;
    },
    loadMore,
    revalidate,
    persistScroll,
  };
}
