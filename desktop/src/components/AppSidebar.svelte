<script lang="ts">
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onDestroy, onMount, tick } from "svelte";
  import { backOut, cubicOut } from "svelte/easing";
  import { fade, scale } from "svelte/transition";
  import { boolean } from "zod";

  import { checkRadicleCLI } from "@app/lib/checkRadicleCLI.svelte";
  import { hints } from "@app/lib/hints";
  import { dynamicInterval } from "@app/lib/interval";
  import { modalStore, show } from "@app/lib/modal";
  import {
    badgeCount,
    notificationCount,
    refreshNotificationCount,
  } from "@app/lib/notificationCount.svelte";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { ariaKeyShortcuts, useShortcuts } from "@app/lib/shortcuts.svelte";
  import {
    commitSidebarWidth,
    discardSidebarWidthPreview,
    previewSidebarWidth,
    RAIL_WIDTH_REM,
    renderedSidebarWidth,
    rootFontSize,
    setSidebarWidth,
    sidebarCollapsed as collapsed,
    sidebarResizing,
    sidebarWidth,
    toggleSidebar,
  } from "@app/lib/sidebar.svelte";
  import { doublePressDetector, dragResult } from "@app/lib/sidebarResize";
  import { updateChecker } from "@app/lib/updateChecker.svelte";
  import useLocalStorage from "@app/lib/useLocalStorage.svelte";
  import { isMac } from "@app/lib/utils";

  import ArtifactNodeStatusButton from "@app/components/ArtifactNodeStatusButton.svelte";
  import { badgeCounter } from "@app/components/BadgeCounterSwitch.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IdentityButton from "@app/components/IdentityButton.svelte";
  import NodeStatusButton from "@app/components/NodeStatusButton.svelte";
  import SidebarRepoList from "@app/components/SidebarRepoList.svelte";
  import SettingsView from "@app/modals/Settings.svelte";

  interface Props {
    sidebarData: SidebarData;
    activeRepo?: RepoInfo;
  }

  const { sidebarData, activeRepo = undefined }: Props = $props();

  const COLLAPSE_MS = 200;

  // The rail and the expanded sidebar cross as whole views. Each is pinned to a
  // width for the crossing -- the one leaving to what it had, the one arriving
  // to where it lands -- so the frame moving underneath cannot drag it sideways.
  const SWAP_SCALE_FROM = 0.9;

  function swap(
    node: Element,
    {
      duration,
      rise = 0,
      width,
    }: { duration: number; rise?: number; width?: number },
  ) {
    const pinned = width ?? (node as HTMLElement).offsetWidth;
    const scale = (t: number) => SWAP_SCALE_FROM + (1 - SWAP_SCALE_FROM) * t;

    return {
      duration,
      easing: cubicOut,
      css: (t: number, u: number) =>
        `opacity: ${t};
         width: ${pinned}px;
         transform: scale(${scale(t)}) translateY(${u * rise}px);
         transform-origin: top left;`,
    };
  }

  const toggleShortcut = isMac() ? "⌘B" : "Ctrl+B";

  useShortcuts({
    shortcut: "toggleSidebar",
    allowInModal: true,
    run: toggleSidebar,
  });
  const dragStripHeight = isMac() ? "2rem" : "1.75rem";

  const mini = $derived(collapsed.value);

  let railStretch = $state(0);

  // What `.slot` is animating towards.
  const bodyTargetWidth = $derived(
    (mini ? RAIL_WIDTH_REM + railStretch : renderedSidebarWidth.value) *
      rootFontSize(),
  );

  // Crossing the threshold is a jump between two widths rather than tracking
  // the pointer, so the transition is switched back on to carry it. Matches the
  // width transition on .slot.
  const SNAP_DURATION_MS = 200;
  let snapping = $state(false);
  let snapTimeout: ReturnType<typeof setTimeout> | undefined;

  // Below this a press is a click, not a drag.
  const DRAG_SLOP_PX = 3;

  function snapWidth() {
    snapping = true;
    if (snapTimeout !== undefined) clearTimeout(snapTimeout);
    snapTimeout = setTimeout(() => (snapping = false), SNAP_DURATION_MS);
  }

  // Held so unmounting mid-drag doesn't leave listeners and the body class
  // behind.
  let endDrag: (() => void) | undefined;

  // Two small drags in quick succession shouldn't also count as a double-press.
  let lastPressResized = false;

  let slotEl = $state<HTMLElement | undefined>();

  // The width at which nothing truncates and no slack is left over. The style is
  // restored before this returns, so `max-content` is measured but never
  // painted.
  function measureFitWidth(slot: HTMLElement): number {
    const { maxWidth, transition, width } = slot.style;
    // Where the sidebar visually is -- mid-animation if it is still opening.
    // The fit animates from here.
    const current = slot.getBoundingClientRect().width;

    slot.style.transition = "none";
    // Lifted to measure the true content width; the result is clamped anyway.
    slot.style.maxWidth = "none";
    slot.style.width = "max-content";
    const fit = slot.getBoundingClientRect().width;

    slot.style.maxWidth = maxWidth;
    slot.style.width = `${current}px`;
    // Flushed while the transition is off, so the animation starts from where
    // the sidebar was and not from `max-content`.
    void slot.offsetWidth;
    slot.style.transition = transition;
    // Back to Svelte's binding, which the caller is about to update; both land
    // before the next frame, so this animates once.
    slot.style.width = width;

    return fit;
  }

  async function fitSidebarToContent() {
    if (collapsed.value) {
      collapsed.value = false;
      // The rail renders different markup; nothing to fit until it is gone.
      await tick();
    }
    if (!slotEl) return;
    // Rounded up: the measurement is fractional, and landing a hair short would
    // leave an ellipsis on the row we just fitted to.
    setSidebarWidth(Math.ceil(measureFitWidth(slotEl)) / rootFontSize());
  }

  // A second press in quick succession fits the sidebar. Detected here rather
  // than with `dblclick`, because the pointerdown below is cancelled to stop a
  // Tauri window drag, which suppresses the mouse events `dblclick` comes from.
  const isDoublePress = doublePressDetector();

  function onEdgePointerDown(e: PointerEvent) {
    // Primary button only; a right-click here would otherwise start a drag.
    if (e.button !== 0) return;
    e.preventDefault();

    if (isDoublePress(e, lastPressResized)) {
      void fitSidebarToContent();
      return;
    }

    const edge = e.currentTarget as HTMLElement;
    // Capture so the drag survives the pointer leaving the window: a pointerup
    // out there never arrives, and the resize would never end.
    edge.setPointerCapture(e.pointerId);

    sidebarResizing.value = true;
    document.body.classList.add("resizing-sidebar");

    const startX = e.clientX;
    // From the rail's own width when collapsed, so reopening starts where the
    // edge visually sits rather than at the stored expanded width.
    const startWidth = collapsed.value ? RAIL_WIDTH_REM : sidebarWidth.value;
    const pxPerRem = rootFontSize();
    let dragged = false;

    const onMove = (ev: PointerEvent) => {
      if (!dragged) {
        if (Math.abs(ev.clientX - startX) <= DRAG_SLOP_PX) return;
        dragged = true;
      }
      const drag = dragResult(startWidth, ev.clientX - startX, pxPerRem);
      if (collapsed.value !== drag.collapse) {
        collapsed.value = drag.collapse;
        snapWidth();
      }
      railStretch = drag.railStretch;
      if (drag.collapse) {
        // Anything previewed before the threshold was crossed is on the way to
        // collapsing, not a width to remember.
        discardSidebarWidthPreview();
      } else {
        // Off storage; persisted once when the drag ends.
        previewSidebarWidth(drag.width);
      }
    };

    const finish = () => {
      endDrag = undefined;
      edge.removeEventListener("pointermove", onMove);
      edge.removeEventListener("pointerup", finish);
      edge.removeEventListener("pointercancel", finish);
      if (edge.hasPointerCapture(e.pointerId)) {
        edge.releasePointerCapture(e.pointerId);
      }
      sidebarResizing.value = false;
      railStretch = 0;
      document.body.classList.remove("resizing-sidebar");
      commitSidebarWidth();
      lastPressResized = dragged;
    };

    endDrag = finish;
    edge.addEventListener("pointermove", onMove);
    edge.addEventListener("pointerup", finish);
    edge.addEventListener("pointercancel", finish);
  }

  onDestroy(() => {
    endDrag?.();
    if (snapTimeout !== undefined) clearTimeout(snapTimeout);
  });

  const firstLaunchStorage = useLocalStorage(
    "appFirstLaunch",
    boolean(),
    true,
    !window.localStorage,
  );

  onMount(async () => {
    try {
      await checkRadicleCLI();
    } catch {
      dynamicInterval("checkRadicleCLI", checkRadicleCLI, 1_000);
    }

    const isDefaultRoute =
      window.location.pathname === "/" || window.location.pathname === "/inbox";
    if (firstLaunchStorage.value === true && isDefaultRoute) {
      await router.push({ resource: "guide" });
      firstLaunchStorage.value = false;
    }

    await refreshNotificationCount();
    dynamicInterval("notificationCount", refreshNotificationCount, 3_000);
  });

  $effect(() => {
    if (window.__TAURI_INTERNALS__) {
      void getCurrentWindow().setBadgeCount(
        badgeCount(notificationCount.value, $badgeCounter),
      );
    }
  });

  const activeRoute = router.activeRouteStore;
  const canGoBack = router.canGoBack;
  const canGoForward = router.canGoForward;

  function isInbox(): boolean {
    return $activeRoute.resource === "inbox";
  }

  function isGuide(): boolean {
    return $activeRoute.resource === "guide";
  }

  function isSettings(): boolean {
    return $modalStore?.component === SettingsView;
  }

  let confirmingGuideDismiss = $state(false);
</script>

<style>
  .slot {
    position: relative;
    height: 100%;
    min-height: 0;
    flex-shrink: 0;
    transition: width 0.2s ease;
    /* Backstop for MAX_VIEWPORT_FRACTION, for when the window is resized after
       the width was set. */
    max-width: 40vw;
  }
  .slot.resizing {
    transition: none;
  }

  .sidebar {
    /* Containing block for the resize edge. Isolated so it layers against the
       sidebar, not against portalled popovers. */
    position: relative;
    isolation: isolate;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-right: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-base);
    transition: background-color 0.2s ease;
    /* One cell the two views stack in. Tracks are sized from the sidebar, not
       from its content: an `auto` track would hold both at the wider width. */
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    overflow: hidden;
  }
  .sidebar.mini {
    background-color: var(--color-surface-canvas);
  }
  .view {
    grid-area: 1 / 1;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* The collapse contract: `.label` anywhere in the sidebar is text that gives
     up its space on the rail. Opted into by class alone, so a child that wants
     its text to survive the collapse must not use it. Non-interactive, so the
     part overflowing the collapsed square is not a phantom hover target. */
  .sidebar :global(.label) {
    white-space: nowrap;
    pointer-events: none;
  }
  /* A label still fading at full width would push its icon off the rail's
     centre line, so it gives up the space too. */
  .view.mini :global(.label) {
    opacity: 0;
    width: 0;
    min-width: 0;
    overflow: hidden;
  }

  .drag-strip {
    flex-shrink: 0;
  }
  .controls {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0 0.5rem 0.25rem;
    flex-shrink: 0;
    /* Height comes from the content -- zero when expanded, the button column
       when collapsed -- and is animated by the FLIP in the script, since a CSS
       transition can't reach `auto`. Top-aligned in both states so the toggle
       stays put while the rest reflow. */
  }
  .window-controls {
    display: flex;
    gap: 0.25rem;
  }
  /* Expanded, the controls lift into the drag strip beside the traffic lights.
     They stay in the row's DOM so the same elements survive the toggle and can
     glide into the rail's column. */
  .view:not(.mini) .window-controls {
    position: absolute;
    top: 0;
    right: 0.5rem;
    /* Centred on the traffic lights, not on the strip, which is taller and
       would sit these too low. Their centre is ~16px down, matched here by a
       2rem box; macOS draws them, so it can't be read from the page. */
    height: 2rem;
    align-items: center;
  }
  /* Nothing left in flow once they lift, so dropping the padding collapses the
     row to nothing and gives the space back to the nav. */
  .view:not(.mini) .controls {
    padding: 0;
  }
  .view.mini .controls,
  .view.mini .window-controls {
    flex-direction: column;
    gap: 0.125rem;
    align-items: center;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .nav {
    flex: 1;
    overflow: visible;
    /* No top padding: the 2rem drag strip above is already the gap. */
    padding: 0 0.5rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 0;
  }
  .bottom {
    /* Tighter on top: the nav's padding and the scroll area's fade runway
       already sit above. */
    padding: 0.25rem 0.5rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  /* The rail is one centred column. */
  .view.mini .nav {
    align-items: center;
  }
  /* The rail carries navigation only. */
  .view.mini .bottom {
    display: none;
  }
  /* One 2rem square per row, so the hover/selected highlight is a uniform
     square rather than a full-width bar. Rows only: a `min-width` here would
     outrank the 1.5rem squares the icon buttons set inline. */
  .view.mini :global(.nav-item) {
    width: 2rem;
    min-width: 2rem;
    height: 2rem;
    box-sizing: border-box;
    border-radius: var(--border-radius-sm);
    /* Otherwise held open by the zero-width label. */
    gap: 0;
  }
  .view.mini :global(.button),
  .view.mini :global(.filter-button) {
    justify-content: center;
    gap: 0;
  }
  /* `margin-left: auto` on a centred square drags the icon off centre. */
  .view.mini :global(.update-badge) {
    display: none;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    cursor: pointer;
    width: 100%;
    text-decoration: none;
    white-space: nowrap;
  }
  .nav-item:hover {
    background-color: var(--color-surface-subtle);
  }
  .nav-item.active {
    background-color: var(--color-surface-subtle);
  }
  .nav-item .global-counter-badge {
    margin-left: auto;
  }
  .icon {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }
  .window-controls :global(.button.disabled .icon) {
    color: var(--color-text-quaternary);
  }
  .update-badge {
    margin-left: auto;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .guide-item {
    position: relative;
    display: flex;
  }
  .guide-dismiss {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.1s ease;
  }
  .guide-item:hover .guide-dismiss,
  .guide-dismiss:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }
  .guide-dismiss:hover {
    color: var(--color-text-primary);
  }
  .guide-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .guide-confirm-actions {
    display: flex;
    gap: 0.25rem;
  }

  /* Inside the sidebar rather than straddling the border, which put an
     invisible grab target over the edge of the content pane. Drag resizes and a
     double-press fits; collapsing is the toggle button's job. */
  .edge {
    position: absolute;
    top: 0;
    right: 0;
    width: 6px;
    height: 100%;
    /* Above its siblings; the isolated stacking context keeps it below
       popovers and modals. */
    z-index: 1;
    cursor: col-resize;
  }
  /* The pointer leaves the edge as soon as the drag starts. */
  :global(body.resizing-sidebar),
  :global(body.resizing-sidebar *) {
    cursor: col-resize !important;
  }
</style>

<div
  bind:this={slotEl}
  class="slot"
  class:resizing={sidebarResizing.value && !snapping}
  style:width={collapsed.value
    ? `${RAIL_WIDTH_REM + railStretch}rem`
    : `${renderedSidebarWidth.value}rem`}>
  <div class="sidebar" class:mini role="navigation">
    {#key mini}
      <!-- Captured per view, so the outgoing one is not restyled mid-exit. -->
      {@const isMini = mini}
      <div
        class="view"
        class:mini={isMini}
        in:swap={{ duration: COLLAPSE_MS, rise: 8, width: bodyTargetWidth }}
        out:swap={{ duration: COLLAPSE_MS }}>
        <div
          class="drag-strip"
          style:height={dragStripHeight}
          data-tauri-drag-region>
        </div>

        <div class="controls">
          <span class="window-controls">
            <Button
              variant="naked"
              title="{collapsed.value
                ? 'Expand'
                : 'Collapse'} sidebar ({toggleShortcut})"
              ariaLabel="{collapsed.value ? 'Expand' : 'Collapse'} sidebar"
              keyShortcuts={ariaKeyShortcuts("toggleSidebar")}
              onclick={toggleSidebar}
              styleWidth={isMini ? "2rem" : "1.5rem"}
              styleHeight={isMini ? "2rem" : "1.5rem"}
              stylePadding="0">
              <span class="icon"><Icon name="sidebar-left" /></span>
            </Button>
            <Button
              variant="naked"
              title="Back"
              ariaLabel="Back"
              disabled={!$canGoBack}
              onclick={() => window.history.back()}
              styleWidth={isMini ? "2rem" : "1.5rem"}
              styleHeight={isMini ? "2rem" : "1.5rem"}
              stylePadding="0">
              <span class="icon"><Icon name="arrow-left" /></span>
            </Button>
            <Button
              variant="naked"
              title="Forward"
              ariaLabel="Forward"
              disabled={!$canGoForward}
              onclick={() => window.history.forward()}
              styleWidth={isMini ? "2rem" : "1.5rem"}
              styleHeight={isMini ? "2rem" : "1.5rem"}
              stylePadding="0">
              <span class="icon"><Icon name="arrow-right" /></span>
            </Button>
            <Button
              variant="naked"
              title="Reload"
              ariaLabel="Reload"
              onclick={() => window.location.reload()}
              styleWidth={isMini ? "2rem" : "1.5rem"}
              styleHeight={isMini ? "2rem" : "1.5rem"}
              stylePadding="0">
              <span class="icon"><Icon name="refresh" /></span>
            </Button>
          </span>
        </div>

        <div class="body">
          <div class="nav">
            {#if !mini}
              <IdentityButton config={sidebarData.config} />
            {/if}

            <a
              class="nav-item"
              class:active={isInbox()}
              title="Inbox"
              href={router.routeToPath({ resource: "inbox" })}>
              <span class="icon"><Icon name="inbox" /></span>
              <span class="label">Inbox</span>
              {#if !mini && notificationCount.value > 0}
                <span
                  class="global-counter-badge"
                  in:scale={{ duration: 200, easing: backOut, start: 0 }}
                  out:fade={{ duration: 200 }}>
                  {notificationCount.value}
                </span>
              {/if}
            </a>

            <SidebarRepoList
              initialRepos={sidebarData.repos}
              initialSeededNotReplicated={sidebarData.seededNotReplicated}
              config={sidebarData.config}
              {activeRepo} />
          </div>

          <div class="bottom">
            {#if !hints.isDismissed("guide")}
              {#if confirmingGuideDismiss && !mini}
                <div class="guide-confirm txt-body-s-regular">
                  <div>
                    Hide the Guide? You can bring it back from Hidden hints in
                    Settings.
                  </div>
                  <div class="guide-confirm-actions">
                    <Button
                      variant="ghost"
                      styleHeight="1.75rem"
                      styleWidth="100%"
                      onclick={() => {
                        hints.dismiss("guide");
                        confirmingGuideDismiss = false;
                      }}>
                      Hide
                    </Button>
                    <Button
                      variant="outline"
                      styleHeight="1.75rem"
                      styleWidth="100%"
                      onclick={() => (confirmingGuideDismiss = false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              {:else}
                <div class="guide-item">
                  <Button
                    variant="naked"
                    title="Guide"
                    styleWidth={mini ? "2rem" : "100%"}
                    styleJustifyContent="flex-start"
                    active={isGuide()}
                    onclick={() => router.push({ resource: "guide" })}>
                    <span class="icon"><Icon name="guide" /></span>
                    <span class="label">Guide</span>
                  </Button>
                  {#if !mini}
                    <button
                      type="button"
                      class="guide-dismiss"
                      title="Hide Guide"
                      aria-label="Hide Guide"
                      onclick={() => (confirmingGuideDismiss = true)}>
                      <Icon name="close" />
                    </button>
                  {/if}
                </div>
              {/if}
            {/if}
            <Button
              variant="naked"
              title="Settings"
              styleWidth={mini ? "2rem" : "100%"}
              styleJustifyContent="flex-start"
              active={isSettings()}
              onclick={() => show({ component: SettingsView, props: {} })}>
              <span class="icon"><Icon name="settings" /></span>
              <span class="label">Settings</span>
              {#if updateChecker.newVersion}
                <span class="update-badge">New Update</span>
              {/if}
            </Button>
            <ArtifactNodeStatusButton />
            <NodeStatusButton />
          </div>
        </div>
      </div>
    {/key}

    <div
      class="edge"
      title="Drag to resize, double-click to fit"
      onpointerdown={onEdgePointerDown}
      role="separator"
      aria-orientation="vertical"
      tabindex="-1">
    </div>
  </div>
</div>
