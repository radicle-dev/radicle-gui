<script lang="ts">
  import type { FileStatus } from "@app/components/diffFileHeaderState.svelte";
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type {
    AnnotationSide,
    CodeViewDiffItem,
    CodeViewItem,
    CodeViewRenderedItem,
    CodeViewSlotSnapshot,
    DiffLineAnnotation,
    FileDiffLoadedFiles,
    FileDiffMetadata,
    SelectedLineRange,
  } from "@pierre/diffs";
  import type { Snippet } from "svelte";

  import {
    CodeView,
    CUSTOM_HEADER_SLOT_ID,
    getLineAnnotationName,
  } from "@pierre/diffs";
  import { mount, unmount, untrack } from "svelte";

  import { fontSettings } from "@app/lib/appearance.svelte";
  import type { CodeComments } from "@app/lib/codeComments";
  import { forwardPatchActivityContext } from "@app/lib/patchActivityContext";
  import type {
    CommentAnchor,
    ComposerTarget,
    LineAnnotation,
  } from "@app/lib/pierreComments";
  import {
    anchorOf,
    annotationSignature,
    commentedLines,
    composerLines,
    entryStatus,
    fileAnnotations,
    isCommentableStatus,
    itemIds,
  } from "@app/lib/pierreComments";
  import { parsePatch } from "@app/lib/pierreParse";
  import {
    cardUnsafeCSS,
    codeLineHeight,
    getWorkerPool,
    gutterUnsafeCSS,
    surfaceUnsafeCSS,
    themes,
  } from "@app/lib/pierreView";

  import CommentAnnotation from "@app/components/CommentAnnotation.svelte";
  import { CommentAnnotationState } from "@app/components/commentAnnotationState.svelte";
  import DiffFileHeader from "@app/components/DiffFileHeader.svelte";
  import { DiffFileHeaderState } from "@app/components/diffFileHeaderState.svelte";
  import { theme } from "@app/components/ThemeSwitch.svelte";

  interface Props {
    // Unified `git diff` patch text; Pierre renders the diff from this.
    patch: string;
    diffStyle?: "unified" | "split";
    disableBackground?: boolean;
    disableLineNumbers?: boolean;
    wordWrap?: boolean;
    diffIndicators?: "classic" | "bars" | "none";
    lineDiffType?: "word-alt" | "word" | "char" | "none";
    // Content shown above the first file. Handed to CodeView via its
    // `renderCodeViewHeader` API, which renders it non-virtualized at the top of
    // the scroll content, so it scrolls out of view leaving only the sticky file
    // headers pinned. CodeView measures its height itself (ResizeObserver).
    header?: Snippet;
    // Fetch the full old/new contents of a file (by its new-side path) on
    // demand. When provided, it is adapted into Pierre's `loadDiffFiles`
    // loader: the native hunk-expand markers become live, and clicking one
    // makes Pierre hydrate that file's full content lazily (one click, no
    // pre-loading).
    loadFullFile?: (
      path: string,
    ) => Promise<{ oldContents: string; newContents: string }>;
    // Files with no renderable text diff, keyed by new-side path. Pierre has no
    // binary/empty concept, so these get a header note and no expand caret.
    fileNotes?: ReadonlyMap<string, "binary" | "empty">;
    // Per-file change status, keyed by new-side path — renders as a plain text
    // label after the filename (nothing for a plain modification).
    fileStatuses?: ReadonlyMap<
      string,
      "added" | "deleted" | "modified" | "moved" | "copied"
    >;
    // Lazily fetch a single file's raw diff text (by new-side path) for the
    // header's copy-to-clipboard / save-to-disk actions.
    fileDiffText?: (path: string) => Promise<string>;
    // Unique id for this diff (e.g. the commit or revision id). Used as the
    // Pierre `cacheKey` prefix so the shared worker-pool highlight cache does
    // not collide across diffs that share file paths (see `parsePatch`).
    cacheKeyPrefix?: string;
    // A column down the left of the diff (the patch view's commit list). It sits
    // below `header` and sticks to the top of the scroll port once the header has
    // scrolled past. The file cards are inset by its width so they sit beside it
    // rather than under it.
    //
    // The snippet is handed a box of the height it may occupy and owns its own
    // overflow — so whatever frames the content can be the scroll port itself,
    // and anything sticky inside it pins to a border that never moves.
    overlayLeft?: Snippet;
    overlayLeftWidth?: string;
    // A full-width bar that sticks to the top of the scroll port. It is the last
    // thing before the two columns, and everything that pins below — the column
    // and Pierre's own file headers — is offset by its height.
    stickyTop?: Snippet;
    // Content shown above the first file, beside `overlayLeft` rather than
    // across the whole width like `header`. Pierre reserves its height between
    // the header and the first item (`layout.paddingTop`) and accounts for it in
    // its scroll maths, so it can sit in that gap without displacing anything.
    filesHeader?: Snippet;
    // Files (by new-side path) that start collapsed.
    collapsedPaths?: ReadonlySet<string>;
    // Restricts the diff to these files (by new-side path).
    includePaths?: ReadonlySet<string>;
    // Files (by new-side path) marked reviewed. Providing this shows the
    // reviewed toggle in every file header; leave unset to hide it.
    reviewedPaths?: ReadonlySet<string>;
    onToggleReviewed?: (path: string) => void;
    // Resolved/unresolved code-comment counts per new-side path, shown in the
    // file header.
    commentCounts?: ReadonlyMap<
      string,
      { resolved: number; unresolved: number }
    >;
    // Review wiring. Providing it superimposes the code-comment threads on the
    // diff and, if it can create comments, puts a marker in the gutter for
    // writing new ones.
    codeComments?: CodeComments;
    // The commit a new comment is anchored against — the head of the diff on
    // screen. Required alongside `codeComments` to compose a comment.
    commentCommit?: string;
    // A thread to single out, so a jump from elsewhere can say where it landed.
    highlightedCommentId?: string;
  }

  const {
    patch,
    diffStyle = "unified",
    disableBackground = false,
    disableLineNumbers = false,
    wordWrap = false,
    diffIndicators = "bars",
    lineDiffType = "word-alt",
    header = undefined,
    loadFullFile = undefined,
    fileNotes = undefined,
    fileStatuses = undefined,
    fileDiffText = undefined,
    cacheKeyPrefix = undefined,
    overlayLeft = undefined,
    overlayLeftWidth = "21rem",
    stickyTop = undefined,
    filesHeader = undefined,
    collapsedPaths = undefined,
    includePaths = undefined,
    reviewedPaths = undefined,
    onToggleReviewed = undefined,
    commentCounts = undefined,
    codeComments = undefined,
    commentCommit = undefined,
    highlightedCommentId = undefined,
  }: Props = $props();

  // Whether the reader may start a new comment: the host has to supply both an
  // action and the commit to anchor it against.
  const canComment = $derived(
    Boolean(codeComments?.createComment) && commentCommit !== undefined,
  );
  // Threads anchored to a line, in the file they belong to. A file whose content
  // moved cannot carry any: a `CodeLocation` names one path, and which side of
  // the rename it means is ambiguous.
  const commentThreads = $derived.by(() => {
    const threads = codeComments?.threads ?? [];
    if (threads.length === 0) return threads;
    return threads.filter(thread => {
      const anchor = anchorOf(thread.root.location);
      return anchor && isCommentableStatus(fileStatuses?.get(anchor.path));
    });
  });
  // The open new-comment composer, if any. Transient UI state, so it lives here
  // rather than in the threads handed down by the host.
  let composer = $state.raw<ComposerTarget | undefined>(undefined);

  // What has been typed into it, held here rather than in the mounted component:
  // the component goes away when its file leaves the render window, and losing
  // a half-written comment to a scroll is not acceptable.
  let composerBody = $state("");
  function closeComposer(): void {
    composer = undefined;
    composerBody = "";
    view?.clearSelectedLines();
  }

  // Pierre's first-party lazy content loader. It calls this the first time a
  // partial (patch-parsed) file is expanded, hydrates the file's full content
  // in place (flips `isPartial`, reuses the highlight cache), and drives its own
  // expand markers. Stable reference so option updates never re-trigger loader
  // wiring. Pierre only invokes it for changed/renamed files (added/deleted
  // already carry a side).
  const loadDiffFiles = $derived(
    loadFullFile
      ? async (fileDiff: FileDiffMetadata): Promise<FileDiffLoadedFiles> => {
          const { oldContents, newContents } = await loadFullFile(
            fileDiff.name,
          );
          return {
            oldFile: {
              name: fileDiff.prevName ?? fileDiff.name,
              contents: oldContents,
            },
            newFile: { name: fileDiff.name, contents: newContents },
          };
        }
      : undefined,
  );

  // Kept out of `$state` proxying (it is an external stateful instance), but
  // still reactive on reassignment so the option effects re-run once it exists.
  let container = $state<HTMLElement>();
  let headerEl = $state<HTMLElement>();
  let overlayLeftEl = $state<HTMLElement>();
  let filesHeaderEl = $state<HTMLElement>();
  let filesHeaderContentEl = $state<HTMLElement>();
  let stickyTopEl = $state<HTMLElement>();
  let stickyTopContentEl = $state<HTMLElement>();
  // Handed to CodeView's `renderCodeViewHeader`: it mounts this element at the
  // top of the scroll content and tracks its height itself. Stable reference so
  // option updates do not re-trigger header reconciliation.
  //
  // It doubles as the hook for placing `overlayLeft`: Pierre calls this once per
  // header host, right after creating it, which is the first moment the column
  // can be moved to sit after it.
  const renderHeader = (): HTMLElement | undefined => {
    placeAnchors();
    return headerEl;
  };

  // Put the anchors after the header, so their static position is below it and
  // `position: sticky` only takes over once the header has scrolled past. Left
  // where Svelte rendered it, it would sit before the header and cover it. Pierre
  // only ever inserts its own children relative to its item container, so a
  // sibling between the header and that container is left alone. Idempotent,
  // because either can appear first: the host is created on Pierre's first
  // render, the column whenever its content does.
  function placeAnchors(): void {
    const host = view?.getHeaderElement();
    if (!host) {
      return;
    }
    let previous: Element = host;
    for (const anchor of [stickyTopEl, overlayLeftEl, filesHeaderEl]) {
      if (!anchor) {
        continue;
      }
      if (anchor.previousElementSibling !== previous) {
        previous.after(anchor);
      }
      previous = anchor;
    }
  }
  $effect(() => {
    void stickyTopEl;
    void overlayLeftEl;
    void filesHeaderEl;
    void view;
    untrack(placeAnchors);
  });

  // How far everything below the sticky bar has to be pushed down: the column
  // and the files header while it is in flow, and Pierre's file headers once
  // they pin.
  let stickyTopHeight = $state(0);
  $effect(() => {
    const el = stickyTopContentEl;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      stickyTopHeight = el.getBoundingClientRect().height;
    });
    observer.observe(el);
    stickyTopHeight = el.getBoundingClientRect().height;
    return () => observer.disconnect();
  });

  let filesHeaderHeight = $state(0);
  $effect(() => {
    const el = filesHeaderContentEl;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      filesHeaderHeight = el.getBoundingClientRect().height;
    });
    observer.observe(el);
    filesHeaderHeight = el.getBoundingClientRect().height;
    return () => observer.disconnect();
  });

  // The gap between the chrome and the first file, which the sticky bar and
  // `filesHeader` hang in. It is padding on the header element, so it counts as
  // part of the height Pierre measures for it; the anchors that fill it are
  // siblings that come after the header, which puts them at the *bottom* of the
  // gap, and each one is offset back up by this much.
  const reserveHeight = $derived(stickyTopHeight + filesHeaderHeight);
  // Only the header can carry it. Without one there is nowhere to put the gap
  // except `layout.paddingTop`, which desynchronises Pierre's render window —
  // but then there are no anchors to make room for either, so it stays zero.
  const reserveOnHeader = $derived(header !== undefined);

  // One pixel between the bottom of the reserved gap and the first file, where a
  // sticky bar hangs in that gap with nothing under it. The bar is opaque and
  // paints above the diff, so the first card's outset ring — which sits in the
  // row above the card — would otherwise be drawn underneath it and the card
  // would come out with no top edge. Only needed where the bar is the last thing
  // in the gap: with a `filesHeader` below it, that content is transparent and
  // the ring shows through.
  //
  // A pixel is also the most that can safely go on `layout.paddingTop` — see the
  // note on it below for why anything larger slides Pierre's render window out of
  // step with the screen.
  const firstItemGap = $derived(
    stickyTop !== undefined && filesHeader === undefined ? 1 : 0,
  );

  // The column caps its height at the scroll port's, which it cannot express in
  // CSS: it hangs off a zero-height anchor, so a percentage has nothing to
  // resolve against.
  let portHeight = $state(0);
  $effect(() => {
    const el = container;
    if (!el || !overlayLeft) {
      return;
    }
    const observer = new ResizeObserver(() => {
      portHeight = el.clientHeight;
    });
    observer.observe(el);
    portHeight = el.clientHeight;
    return () => observer.disconnect();
  });

  // What is left of the port once the sticky bar has taken its share — the space
  // the column actually has, and exactly its height once the bar is pinned.
  const overlayHeight = $derived(Math.max(portHeight - stickyTopHeight, 0));

  // `DiffFileHeader`'s row height (`2.5rem`), fed to Pierre as the exact
  // `diffHeaderHeight` metric. It must be constant across all files — Pierre
  // estimates each file's position from this single metric (not the measured
  // header), so a varying header height drifts scroll-to-file. Expanded files
  // get a 1px divider above the body but no extra height (inset shadow). The
  // app's root font size is user-configurable (`--font-size`, 14–24px) and one
  // rem equals `fontSettings.size` px, so scale with it rather than hardcoding
  // pixels.
  function fileHeaderHeight(): number {
    return fontSettings.size * 2.5;
  }
  const lineHeightPx = $derived(codeLineHeight(fontSettings.size));
  let view = $state.raw<CodeView<LineAnnotation> | undefined>(undefined);
  // Everything the patch parsed to, kept so `includePaths` can be re-applied
  // without re-parsing.
  let allFiles = $state.raw<FileDiffMetadata[]>([]);
  // The files actually on screen, which is what `scrollToFile` and the comment
  // layer walk.
  let parsedFiles = $state.raw<FileDiffMetadata[]>([]);

  function visibleFiles(files: FileDiffMetadata[]): FileDiffMetadata[] {
    return includePaths
      ? files.filter(file => includePaths.has(file.name))
      : files;
  }

  // Scroll to a logical position in the scroll content, where 0 is the top of
  // the `header`. Pierre reuses a paged scroll scaffold, so the logical position
  // is not the container's `scrollTop` and has to go through `scrollTo`.
  function scrollToPosition(
    position: number,
    behavior: "smooth" | "instant" = "smooth",
  ): void {
    view?.scrollTo({ type: "position", position, behavior });
  }

  // The scroll position that brings the top of the files column — the sticky
  // bar and `filesHeader`, then the first file — up to the top of the port,
  // leaving the chrome just above it. The header element ends in the gap those
  // hang in, so the chrome is what is left of it once the gap is taken off.
  function filesTopPosition(): number | undefined {
    if (!headerEl) {
      return undefined;
    }
    const reserve = reserveOnHeader ? reserveHeight : 0;
    return headerEl.getBoundingClientRect().height - reserve;
  }

  // Bring the top of the files column into view, and only ever come back up to
  // it: a caller asking for the files top wants the diff's first lines on
  // screen, and they already are whenever the port sits above that point.
  // Scrolling down from there would pull the chrome off screen on the reader's
  // behalf, which nothing about picking a commit asks for. Instantly, too — an
  // animated correction runs for half a second against a diff that may still be
  // loading underneath it, and each adjustment it makes on the way reads as the
  // view jumping again.
  export function scrollToFilesTop(): void {
    const position = filesTopPosition();
    if (position === undefined) {
      return;
    }
    const current = view?.getScrollTop();
    if (current !== undefined && current <= position) {
      return;
    }
    scrollToPosition(position, "instant");
  }

  // Nothing that targets a file should scroll the chrome back into view: the
  // caller is pointing at something in the files column, and putting the page
  // header back on screen loses the reader's place in it. Centring a line near
  // the top of the first file does exactly that, because there is not half a
  // viewport of diff above it to centre against.
  //
  // `scrollTo` resolves its destination privately, during the render it queues,
  // so the only way to know where it landed is to let it land and look.
  // `render(true)` runs that render synchronously, which keeps the correction in
  // the same task — the browser paints once, already clamped.
  function clampToFilesTop(): void {
    const instance = view;
    const floor = filesTopPosition();
    const first = parsedFiles[0]?.name;
    if (!instance || floor === undefined || first === undefined) {
      return;
    }
    instance.render(true);
    if (instance.getScrollTop() >= floor) {
      return;
    }
    // Expressed as the first file aligned to the top rather than as the raw
    // position: a `position` target has Pierre's sticky-header offset taken off
    // it, an `item` target does not.
    instance.scrollTo({
      type: "item",
      id: first,
      align: "start",
      offset: reserveOnHeader ? reserveHeight : 0,
    });
  }

  // A scroll target that arrived before the patch finished parsing.
  let pendingScroll: { path: string; anchor?: CommentAnchor } | undefined;

  function applyScroll(target: { path: string; anchor?: CommentAnchor }): void {
    const id = target.path;
    const item = view?.getItem(id);
    if (!item) {
      // The patch is parsed off the main thread, so a caller that switches the
      // diff and immediately scrolls arrives before there are any items. Hold
      // the target and apply it once they exist.
      pendingScroll = target;
      return;
    }
    pendingScroll = undefined;
    // A collapsed file has no line to arrive at (a lockfile or one already
    // marked reviewed starts that way), so open it first.
    if (item?.type === "diff" && item.collapsed === true) {
      setItemCollapsed(item, false);
    }
    if (target.anchor) {
      view?.scrollTo({
        type: "line",
        id,
        lineNumber: target.anchor.line,
        side: target.anchor.side,
        align: "center",
      });
    } else {
      // Offset by the sticky bar, which Pierre does not know about: without it
      // the file header would land behind it.
      view?.scrollTo({
        type: "item",
        id,
        align: "start",
        offset: stickyTopHeight,
      });
    }
    clampToFilesTop();
  }

  // Scroll the diff to a file by its path (item id is its index in the patch).
  export function scrollToFile(path: string): void {
    applyScroll({ path });
  }

  // Scroll the diff to the line a code comment is anchored to.
  export function scrollToAnchor(anchor: CommentAnchor | undefined): void {
    if (!anchor) {
      return;
    }
    applyScroll({ path: anchor.path, anchor });
  }

  // Collapse or expand every file at once (drives the topbar toggle). Renders
  // coalesce, so one pass over all items is fine.
  export function setAllCollapsed(collapsed: boolean): void {
    const instance = view;
    if (!instance) {
      return;
    }
    for (const id of itemIds(parsedFiles.map(file => file.name))) {
      const item = instance.getItem(id);
      if (item) {
        instance.updateItem({
          ...item,
          collapsed,
          version: (item.version ?? 0) + 1,
        });
      }
    }
  }

  // `renderCustomHeader` makes Pierre render only our custom-header slot (it
  // drops its own filename/status-icon/stats), so there is no built-in chrome
  // to override with unsafeCSS. A stable no-op marker enables the slot; we fill
  // it ourselves (see `syncHeaderSlots`). Pierre still supplies the sticky
  // header container and the body's context-expand markers.
  const renderCustomHeader = (): undefined => undefined;

  // One `DiffFileHeader` Svelte component per rendered file, keyed by CodeView
  // item id (not by host element). Pierre pools its `<diffs-container>` host
  // elements, and in container-managed mode its `cleanElement` deliberately
  // leaves our slotted light-DOM child attached on release — so a host only
  // re-enters the reuse pool once *we* detach our wrapper (its `isElementClean`
  // gate is `childNodes.length === 0`). We therefore reconcile against every
  // snapshot: mount for newly-rendered ids, and unmount + detach the wrapper for
  // ids that left, which frees the vacated host for reuse and prevents leaking
  // components across scroll. This mirrors Pierre's own React wrapper, which
  // portals slot content per item id and unmounts it when the id drops out.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative id→component lookup, never rendered reactively
  const mountedHeaders = new Map<
    string,
    {
      state: DiffFileHeaderState;
      instance: ReturnType<typeof mount>;
      // The slot wrapper we appended to the host; detached on removal so the
      // host becomes child-free and poolable again.
      target: HTMLElement;
      // The host this wrapper currently lives in, to detect a recycle.
      host: HTMLElement;
      // The CodeView item this header describes, kept so the header's inputs
      // can be re-pushed when they change without waiting for a new snapshot.
      item: CodeViewDiffItem<LineAnnotation>;
    }
  >();

  function unmountHeaders(): void {
    for (const { instance, target } of mountedHeaders.values()) {
      void unmount(instance);
      target.remove();
    }
    mountedHeaders.clear();
  }

  function statusOf(fileDiff: FileDiffMetadata): FileStatus | undefined {
    return entryStatus(fileStatuses?.get(fileDiff.name), fileDiff.type);
  }

  // Collapse or expand a single file, by CodeView item. Bumps `version`:
  // CodeView ignores an updateItem whose version is unchanged (see
  // syncItemRecord).
  function setItemCollapsed(
    item: CodeViewDiffItem<LineAnnotation>,
    collapsed: boolean,
  ): void {
    view?.updateItem({
      ...item,
      collapsed,
      version: (item.version ?? 0) + 1,
    });
  }

  // Push the current file data into one mounted header's reactive state. Called
  // both from the snapshot callback and whenever an input the header renders
  // changes, since those change independently of which files are rendered.
  function applyHeaderState(entry: {
    state: DiffFileHeaderState;
    host: HTMLElement;
    item: CodeViewDiffItem<LineAnnotation>;
  }): void {
    const { state, host, item } = entry;
    const fileDiff = item.fileDiff;
    state.fileDiff = fileDiff;
    state.status = statusOf(fileDiff);
    // Binary comes from the backend (Pierre can't tell binary from empty —
    // both have no hunks). Any other zero-hunk file (empty/mode-only/pure
    // rename adds like `.gitkeep`) is treated as empty regardless of how the
    // backend labelled its diff.
    const note =
      fileNotes?.get(fileDiff.name) ??
      (fileDiff.hunks.length === 0 ? "empty" : undefined);
    state.note = note;
    state.collapsed = item.collapsed === true;
    // Flag header-only cards (collapsed, binary, or empty — anything with no
    // rendered body) so `cardUnsafeCSS` rounds all four corners of the header
    // instead of only the top two.
    host.toggleAttribute(
      "data-app-no-body",
      item.collapsed === true || note !== undefined,
    );
    state.text = fileDiffText ? () => fileDiffText(fileDiff.name) : undefined;
    state.reviewed = reviewedPaths
      ? reviewedPaths.has(fileDiff.name)
      : undefined;
    const counts = commentCounts?.get(fileDiff.name);
    state.resolvedComments = counts?.resolved ?? 0;
    state.unresolvedComments = counts?.unresolved ?? 0;
    state.onToggleCollapse = () => {
      setItemCollapsed(item, !(item.collapsed === true));
    };
    state.onToggleReviewed = () => {
      const wasReviewed = reviewedPaths?.has(fileDiff.name) === true;
      onToggleReviewed?.(fileDiff.name);
      // Collapse when marking reviewed, re-expand when un-marking.
      setItemCollapsed(item, !wasReviewed);
    };
  }

  // Mounting and updating the slot components is deferred out of whatever is
  // running when the snapshot arrives — Pierre emits it from inside a render,
  // which this component drives from its effects. Svelte parents a `mount()` root
  // to the effect that was running when it was created, and orphans it when that
  // effect next runs; a component mounted that way keeps its DOM but its own
  // `$effect`s stop being reached, which is how a freshly added comment ended up
  // with no author avatar. In a microtask there is no effect to be parented to.
  // Plain variables: imperative bookkeeping, and making them reactive would
  // schedule a Svelte flush for every snapshot Pierre emits while scrolling.
  let pendingSlotItems: CodeViewRenderedItem<LineAnnotation>[] | undefined;
  let slotSyncQueued = false;

  function queueSlotSync(
    items: CodeViewRenderedItem<LineAnnotation>[] | undefined,
  ): void {
    if (!items) {
      return;
    }
    pendingSlotItems = items;
    if (slotSyncQueued) {
      return;
    }
    slotSyncQueued = true;
    queueMicrotask(() => {
      slotSyncQueued = false;
      const items = pendingSlotItems;
      pendingSlotItems = undefined;
      // Torn down between the snapshot and here.
      if (items && view) {
        syncSlots(items);
      }
    });
  }

  function onSlotSnapshot(
    snapshot: CodeViewSlotSnapshot<LineAnnotation> | undefined,
  ): void {
    queueSlotSync(snapshot?.items);
  }

  // For each rendered file, ensure a `DiffFileHeader` is mounted into its
  // custom-header slot and push the current file data into its reactive state;
  // afterwards tear down headers whose file is no longer rendered.
  function syncSlots(items: CodeViewRenderedItem<LineAnnotation>[]): void {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local set, never reactive
    const present = new Set<string>();
    for (const rendered of items) {
      if (rendered.type !== "diff") {
        continue;
      }
      present.add(rendered.id);
      const host = rendered.element;
      let entry = mountedHeaders.get(rendered.id);
      if (!entry) {
        const target = document.createElement("div");
        target.slot = CUSTOM_HEADER_SLOT_ID;
        target.dataset.pierreHeader = "";
        // Transparent wrapper: the component's own `.header` participates in the
        // slot layout directly, without an extra box.
        target.style.display = "contents";
        host.appendChild(target);
        const state = new DiffFileHeaderState();
        const instance = mount(DiffFileHeader, { target, props: { state } });
        entry = { state, instance, target, host, item: rendered.item };
        mountedHeaders.set(rendered.id, entry);
      } else if (entry.host !== host) {
        // Defensive: if Pierre ever moves an id's content onto a different
        // pooled host without dropping it from the snapshot, follow it (as the
        // React wrapper's portal does when its container prop changes).
        host.appendChild(entry.target);
        entry.host = host;
      }

      entry.item = rendered.item;
      applyHeaderState(entry);
    }

    // Reconcile removals: unmount headers whose file left the snapshot and
    // detach their slot wrapper so the vacated host is child-free — only then
    // does Pierre's pool promote it for reuse (see the map comment above).
    for (const [id, entry] of mountedHeaders) {
      if (!present.has(id)) {
        void unmount(entry.instance);
        entry.target.remove();
        mountedHeaders.delete(id);
      }
    }

    syncAnnotationSlots(items);
  }

  // One `CommentAnnotation` per annotation slot Pierre renders, keyed by item id
  // and slot name. Reconciled against every snapshot with the same discipline as
  // the header slots: mount for new slots, unmount *and detach* for slots that
  // left, so the vacated host can re-enter Pierre's element pool.
  // Read during init, so it has to be captured outside the mount callbacks.
  const annotationContext = forwardPatchActivityContext();

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative key→component lookup, never rendered reactively
  const mountedAnnotations = new Map<
    string,
    {
      state: CommentAnnotationState;
      instance: ReturnType<typeof mount>;
      target: HTMLElement;
      host: HTMLElement;
    }
  >();

  // A comment box changing height is the one thing in the diff that resizes
  // without Pierre being told: replying, resolving and — most visibly — swapping
  // the composer for the thread it just created all happen inside a mounted
  // component, behind an annotation set that has not changed.
  //
  // Pierre notices (it watches its own container) and remeasures the file, but
  // stops one step short: the height it wrote on the scroll container is only
  // refreshed by a render, and that resize path does not schedule one. The
  // container then holds the taller content's height while the box inside it is
  // short, and Pierre's sticky offset — which parks the rendered files at the
  // bottom of the port whenever they are shorter than it — drops the whole diff
  // into the slack. On a diff that fills the window it never shows; on a short
  // one the files sink to the middle of the screen.
  //
  // Rendering from the observer callback, rather than from a frame after it,
  // keeps the correction in the same frame as the resize, so nothing is painted
  // adrift. That does mean this has to run *after* Pierre has remeasured, and
  // observers are called in the order they were constructed — hence building
  // this one on demand (always after `CodeView.setup`, which constructs
  // Pierre's) and dropping it again whenever the view is torn down.
  let annotationResizeObserver: ResizeObserver | undefined;
  let annotationResizing = false;

  function observeAnnotation(target: HTMLElement): void {
    annotationResizeObserver ??= new ResizeObserver(() => {
      if (annotationResizing) {
        return;
      }
      annotationResizing = true;
      try {
        view?.render(true);
      } finally {
        annotationResizing = false;
      }
    });
    annotationResizeObserver.observe(target);
  }

  function unmountAnnotations(): void {
    for (const { instance, target } of mountedAnnotations.values()) {
      void unmount(instance);
      target.remove();
    }
    mountedAnnotations.clear();
    annotationResizeObserver?.disconnect();
    annotationResizeObserver = undefined;
  }

  function syncAnnotationSlots(
    items: CodeViewRenderedItem<LineAnnotation>[],
  ): void {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local set, never reactive
    const present = new Set<string>();
    for (const rendered of items) {
      if (rendered.type !== "diff") {
        continue;
      }
      const host = rendered.element;
      // What each slot should show right now, rather than what Pierre happens to
      // be holding: it is only told about the slots themselves, so its copy of
      // the contents goes stale on every reply and resolve.

      const current = new Map(
        (annotationsFor(rendered.item.fileDiff) ?? []).map(annotation => [
          getLineAnnotationName(annotation),
          annotation.metadata,
        ]),
      );
      for (const annotation of rendered.item.annotations ?? []) {
        const slot = getLineAnnotationName(annotation);
        const metadata = current.get(slot);
        // A slot Pierre still has but that has nothing left to show; the item
        // update that removes it is on its way.
        if (!metadata) {
          continue;
        }
        const key = `${rendered.id}|${slot}`;
        present.add(key);
        let entry = mountedAnnotations.get(key);
        if (!entry) {
          const target = document.createElement("div");
          target.slot = slot;
          target.dataset.appAnnotation = "";
          // Pierre's own annotation wrapper does the same: the slot's shadow
          // context is a `pre`, whose `white-space` inherits into slotted
          // content and would hold a comment to one line.
          target.style.whiteSpace = "normal";
          host.appendChild(target);
          const state = new CommentAnnotationState();
          const instance = mount(CommentAnnotation, {
            target,
            props: { state },
            context: annotationContext,
          });
          entry = { state, instance, target, host };
          mountedAnnotations.set(key, entry);
          observeAnnotation(target);
        } else if (entry.host !== host) {
          host.appendChild(entry.target);
          entry.host = host;
        }
        entry.state.annotation = metadata;
        entry.state.comments = codeComments;
        entry.state.highlightedCommentId = highlightedCommentId;
        entry.state.commit = commentCommit;
        entry.state.onHoverThread = (threadId: string | undefined) => {
          const thread = metadata.threads.find(
            candidate => candidate.root.id === threadId,
          );
          if (thread) {
            paintTint(host, thread);
          } else {
            clearTint();
          }
        };
        entry.state.composerBody = composerBody;
        entry.state.onComposerInput = value => {
          composerBody = value;
        };
        entry.state.onCloseComposer = closeComposer;
      }
    }

    for (const [key, entry] of mountedAnnotations) {
      if (!present.has(key)) {
        annotationResizeObserver?.unobserve(entry.target);
        void unmount(entry.instance);
        entry.target.remove();
        mountedAnnotations.delete(key);
      }
    }
  }

  // Header content in the virtualized path is delivered via a slot coordinator,
  // not the render* options. The gutter marker needs no slot: with no
  // `renderGutterUtility` Pierre renders its own.
  function slotCoordinator(hasAnnotations: boolean) {
    return {
      hasHeaderRenderers: true,
      hasAnnotationRenderer: hasAnnotations,
      hasGutterRenderer: false,
      onSnapshotChange: onSlotSnapshot,
    };
  }

  // Whether the diff carries comments can change without the patch changing, and
  // the coordinator decides whether Pierre emits annotation slots at all.
  $effect(() => {
    const hasAnnotations = codeComments !== undefined;
    const instance = view;
    if (!instance) {
      return;
    }
    untrack(() => {
      if (instance.setSlotCoordinator(slotCoordinator(hasAnnotations))) {
        instance.render(true);
      }
    });
  });

  // Header inputs change independently of which files are rendered (marking a
  // file reviewed, say), and the slot coordinator only fires when the rendered
  // set changes — so re-push them into the mounted headers here.
  $effect(() => {
    void fileNotes;
    void fileStatuses;
    void fileDiffText;
    void reviewedPaths;
    void commentCounts;
    untrack(() => {
      for (const entry of mountedHeaders.values()) {
        applyHeaderState(entry);
      }
    });
  });

  function options(
    themeType: "dark" | "light",
    style: "unified" | "split",
    headerHeight: number,
  ) {
    return {
      theme: themes,
      themeType,
      diffStyle: style,
      disableBackground,
      disableLineNumbers,
      overflow: (wordWrap ? "wrap" : "scroll") as "wrap" | "scroll",
      diffIndicators,
      lineDiffType,
      stickyHeaders: true,
      unsafeCSS: gutterUnsafeCSS + surfaceUnsafeCSS + cardUnsafeCSS,
      // The gap the sticky bar and `filesHeader` hang in is *not* reserved here
      // — it rides on the header element's own height instead (see
      // `.pierre-diff-header`). Pierre picks which lines to render from
      // `scrollTop - header.height`, leaving `paddingTop` out of that one
      // calculation while every other measurement it takes includes it. A
      // sizeable value therefore slides the render window out of step with the
      // screen: a file's lines are laid out for a scroll position it is not at,
      // so they drift under their own header and jump in blocks as the window
      // re-quantises. The header's height has no such gap in it.
      layout: {
        paddingTop: reserveOnHeader
          ? firstItemGap
          : stickyTopHeight + filesHeaderHeight + firstItemGap,
        paddingBottom: 8,
        gap: 8,
      },
      // Own the whole file header: Pierre renders only our custom-header slot
      // (mounted per file in `syncHeaderSlots`), so no built-in icon/stat chrome
      // to fight with CSS.
      renderCustomHeader,
      // Lazy full-file hydration for context expansion. Pierre shows live
      // expand markers on the partial diff and calls this only when the user
      // expands — one click, nothing loaded up front.
      ...(loadDiffFiles ? { loadDiffFiles } : {}),
      // Commit metadata as a non-virtualized header at the top of the scroll
      // content. It scrolls away with the diff and CodeView measures its height
      // itself, so no `paddingTop` reservation is needed.
      ...(header ? { renderCodeViewHeader: renderHeader } : {}),
      // Pierre estimates each file's position from these two metrics, so they
      // must equal the real rendered heights or scroll-to-file drifts.
      // `diffHeaderHeight` is passed statically (not measured) so it can't lag
      // behind a font-size change. `lineHeight` must match `--diffs-line-height`
      // (`lineHeightPx`); Pierre's default is a fixed 20px, which only matches at
      // the 16px root font.
      itemMetrics: {
        diffHeaderHeight: headerHeight,
        lineHeight: lineHeightPx,
      },
      // Pierre's own gutter marker for writing a comment: it follows the hovered
      // line and can be dragged down it to cover a range. Line selection is on
      // alongside it so the range being covered is painted while dragging;
      // pointer-down is confined to the line-number column, so selecting the code
      // text itself still works.
      ...(canComment
        ? {
            enableGutterUtility: true,
            enableLineSelection: true,
            onGutterUtilityClick: openComposer,
          }
        : {}),
    };
  }

  function buildItems(
    files: FileDiffMetadata[],
  ): CodeViewItem<LineAnnotation>[] {
    const ids = itemIds(files.map(file => file.name));
    return files.map((fileDiff, index) => ({
      id: ids[index],
      type: "diff",
      fileDiff,
      collapsed: collapsedPaths?.has(fileDiff.name) === true,
      annotations: annotationsFor(fileDiff),
    }));
  }

  function annotationsFor(
    fileDiff: FileDiffMetadata,
  ): DiffLineAnnotation<LineAnnotation>[] | undefined {
    if (
      !codeComments ||
      !isCommentableStatus(fileStatuses?.get(fileDiff.name))
    ) {
      return undefined;
    }
    return fileAnnotations(fileDiff.name, commentThreads, composer);
  }

  // The lines a comment refers to, tinted while the comment is hovered so the
  // code it is about can be picked out without painting the whole diff.
  //
  // Pierre has no public per-line decoration API — the hooks that could do it are
  // protected on its renderer and it builds its own — so this reproduces what its
  // line selection does: mix the line's own computed diff background with a tint.
  // The rules have to be inside the file's shadow root, and they deliberately do
  // not go through Pierre's `unsafeCSS`: it treats any change to that string as a
  // layout change, resetting every file's layout cache and relaying out from the
  // first item, which discards the measured comment heights and throws the reader
  // back to the top of the diff. Injected here instead, and only while hovering,
  // Pierre never has to know. An unlayered stylesheet also beats both of its own
  // layers, so no `@layer` juggling.
  let tintStyle: HTMLStyleElement | undefined;

  function clearTint(): void {
    tintStyle?.remove();
    tintStyle = undefined;
  }

  function tintSelectors(
    side: AnnotationSide,
    line: number,
    column: "content" | "number",
  ): string[] {
    const attribute = column === "content" ? "data-line" : "data-column-number";
    // A unified row shows the new-side number, except on a deleted line where it
    // shows the old one — so matching on the number alone would tint the wrong
    // row for an old-side comment. The line type is what tells the two apart.
    const unified =
      side === "deletions"
        ? '[data-line-type="change-deletion"]'
        : ':not([data-line-type="change-deletion"])';
    // Split lays each side out in its own column, where the numbers are already
    // unambiguous. Both forms are emitted so this works whichever is on screen.
    const split = side === "deletions" ? "data-deletions" : "data-additions";
    return [
      `[data-unified] [${attribute}="${line}"]${unified}`,
      `[${split}] [${attribute}="${line}"]`,
    ];
  }

  function paintTint(host: HTMLElement, thread: Thread<CodeLocation>): void {
    clearTint();
    const location = thread.root.location;
    const anchor = anchorOf(location);
    const shadow = host.shadowRoot;
    if (!location || !anchor || !shadow) {
      return;
    }
    const content: string[] = [];
    const numbers: string[] = [];
    for (const line of commentedLines(location)) {
      content.push(...tintSelectors(anchor.side, line, "content"));
      numbers.push(...tintSelectors(anchor.side, line, "number"));
    }
    if (content.length === 0) {
      return;
    }
    // Mixing against the line's own background rather than replacing it, so the
    // tint reads the same over context, added and deleted lines.
    const mix = (weight: string) =>
      `--diffs-line-bg: color-mix(in lab, var(--diffs-computed-diff-line-bg, var(--diffs-bg)) ${weight}, var(--app-diff-comment-tint));`;
    const style = document.createElement("style");
    style.textContent = `
      ${content.join(",\n")} { ${mix("86%")} }
      ${numbers.join(",\n")} { ${mix("78%")} }
    `;
    shadow.appendChild(style);
    tintStyle = style;
  }

  // Open the new-comment composer on what the gutter marker covers. Pierre
  // reports the line range it was dragged over, on the side it started from.
  function openComposer(
    range: SelectedLineRange,
    context: { item: CodeViewItem<LineAnnotation> },
  ): void {
    const { item } = context;
    if (item.type !== "diff") {
      return;
    }
    const path = item.fileDiff.name;
    if (!isCommentableStatus(fileStatuses?.get(path))) {
      return;
    }
    composer = { path, ...composerLines(range) };
    composerBody = "";
  }

  // Push comment changes onto the items. The threads arrive as new objects on
  // every patch reload, so only a real change in what occupies the slots is
  // published; the mounted components are then refreshed either way, since a
  // reply or a resolve changes what a slot renders without moving it.
  $effect(() => {
    void commentThreads;
    void composer;
    void codeComments;
    void commentCommit;
    void fileStatuses;
    void highlightedCommentId;
    const instance = view;
    if (!instance) {
      return;
    }
    untrack(() => {
      let changed = false;
      for (const id of itemIds(parsedFiles.map(file => file.name))) {
        const item = instance.getItem(id);
        if (item?.type !== "diff") {
          continue;
        }
        const next = annotationsFor(item.fileDiff);
        if (
          annotationSignature(item.annotations) === annotationSignature(next)
        ) {
          continue;
        }
        instance.updateItem({
          ...item,
          annotations: next,
          version: (item.version ?? 0) + 1,
        });
        changed = true;
      }
      if (changed) {
        instance.render(true);
      }
      queueSlotSync(instance.getRenderedItems());
    });
  });

  // `includePaths` is a live filter: deleting the last comment on a file should
  // take the file with it, not leave it behind until the next reload. Compared
  // by name rather than by set identity, since the host rebuilds the set on
  // every reload whether or not its contents moved.
  $effect(() => {
    void includePaths;
    const instance = view;
    if (!instance) {
      return;
    }
    untrack(() => {
      if (allFiles.length === 0) {
        return;
      }
      const shown = visibleFiles(allFiles);
      const before = parsedFiles.map(file => file.name).join("\u0000");
      const after = shown.map(file => file.name).join("\u0000");
      if (before === after) {
        return;
      }
      parsedFiles = shown;
      instance.setItems(buildItems(shown));
      instance.render(true);
    });
  });

  // Structural rebuild: only when the patch text or the container changes.
  //
  // Everything past those two reads is untracked, and has to stay that way. The
  // first render synchronously reaches into the slot syncing, which reads most of
  // this component's props — statuses, notes, comment counts, threads — and a
  // dependency on any of those would rebuild the whole view every time the patch
  // is reloaded and hands down equivalent-but-new objects. Rebuilding empties the
  // scroll container, so the browser clamps the scroll to the top and the reader
  // loses their place. Options and items are kept current by the effects below
  // instead.
  $effect(() => {
    const el = container;
    if (!el) {
      return;
    }
    const p = patch;
    return untrack(() => {
      const instance = new CodeView(
        options($theme, diffStyle, fileHeaderHeight()),
        // Off-thread highlighting; falls back to the main thread if unavailable.
        getWorkerPool(),
        // The container element is owned by this component.
        true,
      );
      instance.setup(el);
      instance.setSlotCoordinator(slotCoordinator(codeComments !== undefined));
      // Published before the first render: that render creates the header host,
      // and `renderHeader` reads `view` to place the sticky column after it.
      view = instance;
      // Mount empty first so the header paints immediately, then fill in the
      // files once the patch has been parsed off the main thread.
      instance.render(true);

      let cancelled = false;
      // A target held for the previous patch must not fire against this one.
      pendingScroll = undefined;
      parsePatch(p, cacheKeyPrefix)
        .then(files => {
          if (cancelled) {
            return;
          }
          allFiles = files;
          const shown = visibleFiles(files);
          parsedFiles = shown;
          instance.setItems(buildItems(shown));
          instance.render(true);
          if (pendingScroll !== undefined) {
            applyScroll(pendingScroll);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            console.error("PierreDiff: failed to parse patch", error);
          }
        });

      return () => {
        cancelled = true;
        view = undefined;
        // Cleared so the `includePaths` filter cannot fire against the outgoing
        // patch's files while the next one is still parsing.
        allFiles = [];
        parsedFiles = [];
        pendingSlotItems = undefined;
        unmountHeaders();
        unmountAnnotations();
        clearTint();
        instance.cleanUp();
      };
    });
  });

  // Theme toggle, layout style, font-size (header-height), and diff-preference
  // changes: update options in place instead of rebuilding (and re-parsing) the
  // diff.
  $effect(() => {
    const themeType = $theme;
    const style = diffStyle;
    // Read reactively (outside `untrack`) so a font-size change re-runs this
    // effect and pushes the new header height to Pierre.
    const headerHeight = fileHeaderHeight();
    // Touch the preference props so a change re-runs this effect; `options()`
    // reads their current values.
    void disableBackground;
    void disableLineNumbers;
    void wordWrap;
    void diffIndicators;
    void lineDiffType;
    void canComment;
    void filesHeaderHeight;
    void stickyTopHeight;
    // The column appearing or going away changes how wide every file card is,
    // and with word wrap on that changes how tall its lines are. Nothing in the
    // options themselves moves, so this is here for the re-render: rendered
    // items reconcile their measured heights into the layout model, and the rest
    // do so as they scroll in.
    void overlayLeft;
    void overlayLeftWidth;
    const instance = view;
    if (!instance) {
      return;
    }
    untrack(() => {
      instance.setOptions(options(themeType, style, headerHeight));
      instance.render(true);
    });
  });

  // `lineDiffType` (inline word/char highlighting) is computed in the highlight
  // worker, and the shared pool caches results keyed by a render-options version
  // that only `setRenderOptions` bumps — `CodeView.setOptions` never reaches the
  // worker, so changing it there has no effect (a stale cache hit is served).
  // Push it to the pool instead (which also clears the highlight cache) and
  // re-render to recompute decorations. The main-thread fallback path (no pool)
  // reads `lineDiffType` from the CodeView options set above.
  $effect(() => {
    const ln = lineDiffType;
    const instance = view;
    const pool = getWorkerPool();
    if (!instance || !pool) {
      return;
    }
    void pool.setRenderOptions({ lineDiffType: ln }).then(() => {
      // Guard against a teardown between the async resolve and here.
      if (view === instance) {
        instance.render(true);
      }
    });
  });
</script>

<style>
  /* Zero-height sticky anchor: it takes no space in the scroll content, and the
     column inside it overflows (absolute) so it overlays the diff rather than
     displacing it. Sitting after the header, its static position is below the
     header — so it scrolls with the content until the header is gone, then pins.
     `sticky` on the column itself cannot do this: inside an absolutely
     positioned box there is nothing to stick to. */
  /* Carries the gap the anchors below hang in, so that it counts towards the
     height Pierre measures for the header rather than towards
     `layout.paddingTop` (see the `layout` option for why that matters). */
  .pierre-diff-header {
    padding-bottom: var(--app-diff-reserve, 0px);
  }
  /* Sticks at the very top; everything that pins below it is offset by its
     height (`--app-sticky-top`). Opaque, so the header scrolls under it.

     It pins when the top of the reserved gap reaches the port, which is a
     gap's worth before the anchor itself gets there — the anchor sits at the
     bottom of the gap, since the gap belongs to the header above it. Sticking
     at `--app-diff-reserve` and lifting the content by the same amount puts it
     at the top of the gap while the chrome is still in view, and at the top of
     the port once it is not. */
  .pierre-diff-sticky-top {
    position: sticky;
    top: var(--app-diff-reserve, 0px);
    height: 0;
    z-index: 4;
  }
  .pierre-diff-sticky-top-content {
    position: absolute;
    top: calc(-1 * var(--app-diff-reserve, 0px));
    left: 0;
    right: 0;
    /* `flow-root` so the bar's own bottom margin counts towards the measured
       height everything below is offset by. */
    display: flow-root;
    padding: 0 1rem;
    background-color: var(--color-surface-canvas);
  }
  /* Sticks at 0 like the bar above it, so the two move in lockstep; the column
     itself is offset down by the bar's height, which is right whether the anchor
     is pinned or still in flow. */
  .pierre-diff-overlay-left {
    position: sticky;
    top: var(--app-diff-reserve, 0px);
    height: 0;
    z-index: 2;
  }
  /* Another zero-height anchor, this one not sticky: it stays put at the foot of
     the reserved gap so its content hangs up into it, beside the column rather
     than across the width. `flow-root` so the content's own bottom margin counts
     towards the measured height that reserves that gap. */
  .pierre-diff-files-header {
    position: relative;
    height: 0;
  }
  .pierre-diff-files-header-content {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flow-root;
    margin-left: var(--app-diff-left-inset, 1rem);
    margin-right: 1rem;
  }
  /* Does not scroll itself — the content does, so that the frame around it
     belongs to the scroll port and anything sticky inside pins to a border that
     never moves. */
  .pierre-diff-overlay-left-column {
    position: absolute;
    /* Lifted out of the reserved gap like the bar above it, then pushed back
       down to sit under the bar — and one pixel further where there is a bar at
       all. The column is ringed by an outset shadow, which is drawn *outside*
       its box: pinned flush against the bar, that pixel row falls under the bar,
       which is opaque and paints above, and the column loses its top edge. It is
       the same pixel Pierre's own pinned file headers are offset by, so this
       also keeps the column and the first header level. */
    top: calc(
      var(--app-sticky-top, 0px) - var(--app-diff-reserve, 0px) +
        var(--app-sticky-gap, 0px)
    );
    left: 1rem;
    display: flex;
    flex-direction: column;
    padding-bottom: 0.5rem;
  }
  .pierre-diff {
    flex: 1;
    min-height: 0;
    min-width: 0;
    /* CodeView attaches its scroll listener to this element but does not set
       `overflow` itself, so it must be the scroll viewport. */
    overflow-y: auto;
  }
</style>

<div
  bind:this={container}
  class="pierre-diff global-pierre-surface"
  style:--diffs-line-height="{lineHeightPx}px"
  style:--app-diff-left-inset={overlayLeft
    ? `calc(${overlayLeftWidth} + 1.5rem)`
    : undefined}
  style:--app-sticky-top="{stickyTopHeight}px"
  style:--app-sticky-gap={stickyTop ? "1px" : undefined}
  style:--app-diff-reserve={reserveOnHeader ? `${reserveHeight}px` : undefined}>
  {#if header}
    <div bind:this={headerEl} class="pierre-diff-header">
      {@render header()}
    </div>
  {/if}
  {#if stickyTop}
    <div bind:this={stickyTopEl} class="pierre-diff-sticky-top">
      <div
        bind:this={stickyTopContentEl}
        class="pierre-diff-sticky-top-content">
        {@render stickyTop()}
      </div>
    </div>
  {/if}
  {#if overlayLeft}
    <div bind:this={overlayLeftEl} class="pierre-diff-overlay-left">
      <!-- The height is published as well as applied. Whatever the column holds
           has to scroll inside it, and for that it needs a definite height of its
           own: a percentage of this box resolves against an indefinite height and
           is dropped, so the content would simply grow past the bottom of the
           port instead of scrolling. -->
      <div
        class="pierre-diff-overlay-left-column"
        style:width={overlayLeftWidth}
        style:max-height="{overlayHeight}px"
        style:--app-diff-overlay-height="{overlayHeight}px">
        {@render overlayLeft()}
      </div>
    </div>
  {/if}
  {#if filesHeader}
    <div bind:this={filesHeaderEl} class="pierre-diff-files-header">
      <div
        bind:this={filesHeaderContentEl}
        class="pierre-diff-files-header-content">
        {@render filesHeader()}
      </div>
    </div>
  {/if}
</div>
