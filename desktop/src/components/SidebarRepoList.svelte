<script lang="ts" module>
  import type { RepoSummary } from "@bindings/repo/RepoSummary";

  import { array, boolean, string } from "zod";

  import { pinnedFirst, pinnedIn, togglePinned } from "@app/lib/repoOrdering";
  import useLocalStorage from "@app/lib/useLocalStorage.svelte";

  let filterOpen = $state(false);
  let filterQuery = $state("");

  const reposExpanded = useLocalStorage(
    "sidebarReposExpanded",
    boolean(),
    true,
    !window.localStorage,
  );

  const pinnedRepoIds = useLocalStorage(
    "sidebarPinnedRepos",
    array(string()),
    [],
    !window.localStorage,
  );

  function pinnedFrom(repos: RepoSummary[]): RepoSummary[] {
    return pinnedIn(repos, pinnedRepoIds.value, r => r.rid);
  }

  // The sidebar's top-to-bottom order: pinned repos first, in the order they
  // were pinned, then the rest. Cmd+1..9 follow it, deliberately ignoring the
  // filter query, which is transient, so the numbering stays put while typing
  // in it.
  function orderRepos(repos: RepoSummary[]): RepoSummary[] {
    return pinnedFirst(repos, pinnedRepoIds.value, r => r.rid);
  }

  export function revealRepoInSidebar(rid: string) {
    if (pinnedRepoIds.value.includes(rid)) return;

    filterQuery = "";
    filterOpen = false;
    reposExpanded.value = true;

    requestAnimationFrame(() => {
      const row = document.querySelector(
        `[data-unpinned-rid="${CSS.escape(rid)}"]`,
      );
      row?.scrollIntoView({ block: "nearest" });
    });
  }
</script>

<script lang="ts">
  import type { ReleaseCounts } from "@bindings/cob/release/ReleaseCounts";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";
  import type { CrossfadeParams } from "svelte/transition";

  import { onMount, untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { backOut, cubicOut } from "svelte/easing";
  import { get } from "svelte/store";
  import { crossfade, fade, scale, slide } from "svelte/transition";

  import { nodeRunning } from "@app/lib/events";
  import type { FlipSnapshot } from "@app/lib/flip";
  import { captureFlip, playFlip } from "@app/lib/flip";
  import { dynamicInterval, resetDynamicInterval } from "@app/lib/interval";
  import {
    cachedListReposSummary,
    invalidateReposSummary,
    invoke,
    writeToClipboard,
  } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import { show } from "@app/lib/modal";
  import { repoListScope } from "@app/lib/repoListScope";
  import * as router from "@app/lib/router";
  import { seededRepos, seedRepo, setFetchingRepos } from "@app/lib/seedRepo";
  import {
    ariaKeyShortcuts,
    modifierHeld,
    useShortcuts,
  } from "@app/lib/shortcuts.svelte";
  import { sidebarCollapsed } from "@app/lib/sidebar.svelte";
  import { explorerHost, formatRepositoryId } from "@app/lib/utils";

  import AddRepoButton from "@app/components/AddRepoButton.svelte";
  import ContextMenu from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import usePinnedDragReorder, {
    DRAG_RID_ATTRIBUTE,
    PINNED_LIST_CLASS,
  } from "@app/components/usePinnedDragReorder.svelte";
  import ConfirmUnseed from "@app/modals/ConfirmUnseed.svelte";

  interface Props {
    initialRepos: RepoSummary[];
    initialSeededNotReplicated: string[];
    activeRepo?: RepoInfo;
    config: Config;
  }

  const {
    initialRepos,
    initialSeededNotReplicated,
    activeRepo = undefined,
    config,
  }: Props = $props();

  let repos: RepoSummary[] = $derived(initialRepos);
  let seededNotReplicated: string[] = $derived(initialSeededNotReplicated);
  let filterInputElement: HTMLInputElement | undefined = $state(undefined);

  const shortcutNumbers = $derived(
    new Map(
      orderRepos(repos)
        .slice(0, 9)
        .map((r, i) => [r.rid, i + 1]),
    ),
  );

  useShortcuts(
    {
      shortcut: "filter",
      // The first filter Cmd+F reaches, ahead of the one in the page.
      priority: 1,
      enabled: () => !sidebarCollapsed.value,
      active: () => document.activeElement === filterInputElement,
      run: () => {
        filterOpen = true;
        reposExpanded.value = true;
        // Opening focuses the input, but it may already be open and blurred.
        filterInputElement?.focus({ preventScroll: true });
      },
    },
    {
      shortcut: "goToRepo",
      run: (_, index) => {
        const repo = orderRepos(repos)[index];
        if (!repo) {
          return false;
        }
        void router.push({ resource: "repo.home", rid: repo.rid });
      },
    },
  );

  let contextMenu = $state<
    { x: number; y: number; repo: RepoSummary; target: HTMLElement } | undefined
  >(undefined);

  function openContextMenu(event: MouseEvent, repo: RepoSummary) {
    event.preventDefault();
    event.stopPropagation();
    contextMenu = {
      x: event.clientX,
      y: event.clientY,
      repo,
      target: event.currentTarget as HTMLElement,
    };
  }

  function closeContextMenu() {
    contextMenu = undefined;
  }

  $effect(() => {
    if (filterOpen && filterInputElement) {
      filterInputElement.focus({ preventScroll: true });
    }
  });

  // Collapsing discards the filter, so re-expanding comes back to a plain
  // header rather than a stale query.
  $effect(() => {
    if (sidebarCollapsed.value) {
      filterOpen = false;
      filterQuery = "";
    }
  });

  $effect(() => {
    if (seededNotReplicated.length > 0) {
      dynamicInterval("seededNotReplicated", reloadRepos, 5_000);
    } else {
      resetDynamicInterval("seededNotReplicated");
    }
  });

  onMount(() => {
    return () => resetDynamicInterval("seededNotReplicated");
  });

  // Kept while navigating inside the repo, so the badge doesn't flicker.
  let releaseCount = $state<number | undefined>(undefined);
  let countedRid: string | undefined = undefined;

  $effect(() => {
    const rid = activeRepo?.rid;
    if (rid === undefined) {
      releaseCount = undefined;
      countedRid = undefined;
      return;
    }

    if (countedRid !== rid) {
      releaseCount = undefined;
      countedRid = rid;
    }

    let cancelled = false;
    invoke<ReleaseCounts>("release_counts", { rid })
      .then(counts => {
        if (!cancelled) releaseCount = counts.delegate + counts.other;
      })
      .catch(() => {
        if (!cancelled) releaseCount = undefined;
      });

    return () => {
      cancelled = true;
    };
  });

  const filteredRepos = $derived(
    filterQuery.trim()
      ? repos.filter(r =>
          r.name.toLowerCase().includes(filterQuery.trim().toLowerCase()),
        )
      : repos,
  );

  const fetchingExpanded = useLocalStorage(
    "sidebarFetchingExpanded",
    boolean(),
    true,
    !window.localStorage,
  );

  const pinnedRepos = $derived.by(() => pinnedFrom(repos));

  const unpinnedFilteredRepos = $derived(
    filteredRepos.filter(r => !pinnedRepoIds.value.includes(r.rid)),
  );

  const unpinnedReposCount = $derived(
    repos.filter(r => !pinnedRepoIds.value.includes(r.rid)).length,
  );

  // FLIP the "All Repos" header's icon and buttons, plus its own height, as it
  // reflows on collapse. Measured relative to the header, so its downward shift
  // (the controls growing above it) is left to the shared layout transition.
  let allReposHeaderEl = $state<HTMLElement | undefined>();
  let headerFirst: FlipSnapshot | undefined;
  const HEADER_FLIP_MS = 200;
  const HEADER_FLIP = {
    selector: "[data-flip]",
    animateHeight: true,
    durationMs: HEADER_FLIP_MS,
  };

  // FLIP translates the element back from its destination, so the pointer that
  // clicked it keeps it hovered and a grey square slides across the header
  // instead of an icon. The fill is dropped for the duration.
  let headerFlipping = $state(false);
  let headerFlipTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect.pre(() => {
    // Measure before the DOM reflows for the new state.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    filterOpen;

    headerFirst = captureFlip(allReposHeaderEl, HEADER_FLIP);
  });

  $effect(() => {
    // ...and play once it has.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    filterOpen;

    playFlip(allReposHeaderEl, headerFirst, HEADER_FLIP);

    headerFlipping = true;
    if (headerFlipTimeout !== undefined) clearTimeout(headerFlipTimeout);
    headerFlipTimeout = setTimeout(() => {
      headerFlipping = false;
    }, HEADER_FLIP_MS);
  });

  const ANIMATION_DURATION_MS = 220;
  let animatingPinnedList = $state(false);
  let animationTimeout: ReturnType<typeof setTimeout> | undefined;
  // The rid currently leaving the list because it was unseeded. Rows normally
  // vanish instantly (filtering, refreshes); this one fades, and the flip
  // animation below then closes the gap it leaves behind.
  let unseedingRid = $state<string | undefined>(undefined);
  const animationDuration = $derived(
    animatingPinnedList || unseedingRid !== undefined
      ? ANIMATION_DURATION_MS
      : 0,
  );
  const [send, receive] = crossfade({
    duration: ANIMATION_DURATION_MS,
    // A row leaving with no counterpart is either the repo being unseeded, or a
    // filter/refresh that should not animate at all.
    fallback: (node: Element, params: CrossfadeParams & { key?: string }) =>
      params.key !== undefined && params.key === unseedingRid
        ? fadeCollapse(node, ANIMATION_DURATION_MS)
        : { duration: 0 },
  });

  // Normally cleared when the row finishes its outro; the timer is only a
  // backstop for a row that leaves without ever running one, which would
  // otherwise leave every later list change animating.
  function clearUnseeding(rid: string) {
    if (unseedingRid === rid) {
      unseedingRid = undefined;
    }
  }

  // Fades the row out while collapsing the space it occupies, so the rows below
  // rise into the gap as it closes. `animate:flip` cannot do this on its own: a
  // row mid-out-transition still takes up its full height, so flip measures no
  // movement for its siblings, and they jump once it is finally removed.
  function fadeCollapse(node: Element, duration: number) {
    const el = node as HTMLElement;
    const height = el.offsetHeight;
    const parent = el.parentElement;
    // The list separates rows with `gap`, which outlives a zero-height row; a
    // negative margin takes that last sliver with it.
    const gap = parent
      ? parseFloat(getComputedStyle(parent).rowGap || "0") || 0
      : 0;

    return {
      duration,
      easing: cubicOut,
      css: (t: number) =>
        `opacity: ${t}; height: ${t * height}px; margin-bottom: ${(t - 1) * gap}px; overflow: hidden; pointer-events: none;`,
    };
  }

  // `slide` cannot roll this list up: it animates `height`, which never applies
  // to a `flex: 1` item. `max-height` clamps one, and `--unroll-height` holds
  // the scroll area at full size so the rows are clipped, not reflowed.
  function unroll(node: Element, { duration }: { duration: number }) {
    const height = (node as HTMLElement).offsetHeight;

    return {
      duration,
      easing: cubicOut,
      css: (t: number) =>
        `max-height: ${t * height}px; overflow: hidden; --unroll-height: ${height}px;`,
    };
  }

  function withPinAnimation(fn: () => void) {
    animatingPinnedList = true;
    if (animationTimeout !== undefined) clearTimeout(animationTimeout);
    animationTimeout = setTimeout(() => {
      animatingPinnedList = false;
    }, ANIMATION_DURATION_MS);
    fn();
  }

  function togglePin(rid: string) {
    withPinAnimation(() => {
      pinnedRepoIds.value = togglePinned(pinnedRepoIds.value, rid);
    });
  }

  const drag = usePinnedDragReorder({
    pinnedRepos: () => pinnedRepos,
    getOrder: () => pinnedRepoIds.value,
    setOrder: rids => withPinAnimation(() => (pinnedRepoIds.value = rids)),
  });

  $effect(() => setFetchingRepos(seededNotReplicated));

  $effect(() => {
    if ($seededRepos === 0) return;
    untrack(() => void reloadRepos());
  });

  async function reloadRepos() {
    invalidateReposSummary();
    [repos, seededNotReplicated] = await Promise.all([
      cachedListReposSummary(repoListScope.value),
      invoke<string[]>("seeded_not_replicated"),
    ]);
  }

  // The route loader already fetched the list for the scope in force, so the
  // first run only records it; later runs are the preference actually changing.
  let loadedScope: string | undefined;
  $effect(() => {
    const scope = repoListScope.value;
    const first = loadedScope === undefined;
    loadedScope = scope;
    if (!first) {
      untrack(() => void reloadRepos());
    }
  });

  // Ordered like the CLI: drop the seeding policy first, then let storage prune
  // what it can. `clean` keeps the local node's and the delegates' refs, so a
  // repo we have published to survives in a reduced form. Throws, so each
  // caller decides how loud a failure is.
  async function stopSeeding(rid: string, clean = false) {
    await invoke<null>("unseed", { rid });
    if (clean) {
      await invoke<null>("clean", { rid });
    }
  }

  // The repo view reads `RepoInfo` from the route loader, so its visibility
  // badge only notices a seeding change if the route loads again. Refreshing
  // the list alone leaves the badge showing the state from before the click.
  async function refreshActiveRepo(rid: string) {
    if (activeRid() !== rid) {
      return;
    }
    await router
      .replace(get(router.activeUnloadedRouteStore))
      .catch(error => console.error("Reloading the route failed", error));
  }

  // Seeding a repository that is only in local storage puts it back on the
  // network. Nothing is destroyed, so it runs straight off the menu item.
  async function startSeeding(rid: string) {
    try {
      await seedRepo(rid);
    } catch (error) {
      console.error("Seed failed", error);
    }
    await refreshActiveRepo(rid);
  }

  // The pending-fetch list's trash button, which stays quiet on failure. The
  // list still refreshes: dropping the policy row is what removes a repo from
  // it, and that happens before anything can throw.
  async function unseed(rid: string) {
    try {
      await stopSeeding(rid);
    } catch (error) {
      console.error("Unseed failed", error);
    } finally {
      await reloadRepos().catch(error =>
        console.error("Reloading repos failed", error),
      );
    }
  }

  // Unseeding drops the seeding policy and removes the repo from this list, so
  // it goes through a confirmation rather than firing straight off a menu item.
  function confirmUnseed(repo: RepoSummary) {
    show({
      component: ConfirmUnseed,
      props: {
        name: repo.name,
        rid: repo.rid,
        async confirm(clean: boolean) {
          // Marked before the commands run so the row that disappears fades out
          // instead of blinking away, and the rows below glide up into the gap.
          unseedingRid = repo.rid;
          try {
            await stopSeeding(repo.rid, clean);
          } finally {
            // `unseed` goes first, so it may well have succeeded even when
            // `clean` threw. Refresh either way rather than leave a row behind
            // for a repo that is no longer seeded.
            await reloadRepos().catch(error =>
              console.error("Reloading repos failed", error),
            );
            setTimeout(
              () => clearUnseeding(repo.rid),
              ANIMATION_DURATION_MS * 2,
            );
            if (activeRid() === repo.rid) {
              if (repos.some(r => r.rid === repo.rid)) {
                // Still listed, so the "All" scope is on and the row merely
                // dimmed; the open repo view needs its badge brought up to date.
                await refreshActiveRepo(repo.rid);
              } else {
                // The repo the user is looking at just went away; its route
                // would resolve to nothing.
                await router.push({ resource: "inbox" });
              }
            }
          }
        },
      },
    });
  }

  const activeRoute = router.activeRouteStore;

  function activeRid(): string | undefined {
    return activeRepo?.rid;
  }

  // Only on the rail: expanded, the row already says this in text.
  function repoTitle(repo: RepoSummary): string | undefined {
    if (!sidebarCollapsed.value) {
      return undefined;
    }
    const state: string[] = [];
    if (repo.private) state.push("Private");
    if (!repo.seeding) state.push("Local");
    return [repo.name, ...state].join(" · ");
  }

  // Named after the repo too, since on the rail nothing else says whose.
  function subItemTitle(
    repoName: string,
    label: string,
    count: number | undefined,
  ): string | undefined {
    if (!sidebarCollapsed.value) {
      return undefined;
    }
    const parts = [repoName, label];
    if (count !== undefined) {
      parts.push(`${count} open`);
    }
    return parts.join(" · ");
  }

  function isRepoHome(rid: string): boolean {
    return $activeRoute.resource === "repo.home" && activeRid() === rid;
  }

  function isIssues(rid: string): boolean {
    return (
      ($activeRoute.resource === "repo.issues" ||
        $activeRoute.resource === "repo.issue") &&
      activeRid() === rid
    );
  }

  function isPatches(rid: string): boolean {
    return (
      ($activeRoute.resource === "repo.patches" ||
        $activeRoute.resource === "repo.patch") &&
      activeRid() === rid
    );
  }

  function isReleases(rid: string): boolean {
    return (
      ($activeRoute.resource === "repo.releases" ||
        $activeRoute.resource === "repo.release") &&
      activeRid() === rid
    );
  }
</script>

<style>
  .repos-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  /* Runway for the scroll area's fade, so the first and last rows are not
     masked at rest. Cancelled by the negative margin on `.repos-scroll`. */
  .repos-list.scrolling {
    padding: 0.5rem 0;
  }
  .pinned-list.empty {
    height: 0;
    padding: 0;
    overflow: visible;
  }
  /* Owns the flex sizing so `unroll` can clamp the scroll area inside. */
  .repos-scroll {
    flex: 1;
    min-height: 0;
    margin-top: -0.5rem;
  }
  /* A height, not `flex: 1`, which the scroll area sets inline and would win:
     mid-transition `unroll` pins this so the wrapper clips it. */
  .repos-scroll > :global(*) {
    height: var(--unroll-height, 100%);
  }

  .section-header {
    font: var(--txt-body-m-regular);
    font-variant-ligatures: none;
    color: var(--color-text-primary);
    /* No bottom padding: the 2rem action buttons already leave a row's worth
       of slack under the label. */
    padding: 1rem 0 0 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
    overflow: hidden;
  }
  .section-header-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }
  /* Moved by `order`, not in the markup: the FLIP matches by element identity,
     so the button has to stay one element across the toggle. */
  .filter-action {
    order: 1;
    /* Promoted for good: the FLIP promotes it only for the move, and handing
       the layer back at the end re-rounds its position by a pixel. */
    will-change: transform;
  }
  .filter-action.open {
    order: -1;
    /* Lines the icon up with the rows below the header's 0.5rem padding. */
    margin-left: -0.25rem;
  }
  .add-repo-action {
    order: 2;
  }
  /* No room on the rail; the repo rows below stand on their own there. */
  .section-header.mini {
    display: none;
  }
  .section-header.flipping .filter-button:hover,
  .section-header.flipping :global(.button:hover) {
    background-color: transparent;
  }

  .filter-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 0;
    padding: 0.125rem;
    margin-left: -0.125rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  /* The same 1.5rem square as every other icon button in the sidebar. */
  .filter-action .filter-button {
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    margin-left: 0;
  }
  .filter-button:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-subtle);
  }
  .filter-input {
    background: none;
    border: 0;
    outline: none;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    flex: 1;
    min-width: 0;
  }
  .filter-input::placeholder {
    color: var(--color-text-secondary);
  }

  .nav-item {
    position: relative;
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
    user-select: none;
    -webkit-user-select: none;
  }
  .nav-item .txt-overflow {
    min-width: 0;
  }
  /* No room on the rail, and reordering is off there, so rows stay plain
     links. */
  :global(.view.mini) .row-actions {
    display: none;
  }
  /* Centred on the rail. */
  :global(.view.mini) .repos-list {
    align-items: center;
  }
  .nav-item :global(img),
  .nav-item :global(svg) {
    -webkit-user-drag: none;
  }
  .nav-item:hover,
  .nav-item.context-active {
    background-color: var(--color-surface-subtle);
  }
  .nav-item.active {
    background-color: var(--color-surface-subtle);
  }
  .nav-item .global-counter-badge {
    margin-left: auto;
  }
  /* Rows unroll from behind the repo they belong to -- the `slide` transition
     clips them while the height animates -- rather than appearing in place. */
  .sub-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.25rem;
  }
  .sub-item {
    padding-left: 2rem;
  }
  .sub-item.mini {
    padding-left: 0.5rem;
  }

  .pending-item {
    color: var(--color-text-secondary);
    cursor: default;
  }
  .pending-avatar {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    border: 1px solid var(--color-border-subtle);
  }
  .pending-item .remove-icon {
    display: none;
    margin-left: auto;
    color: var(--color-text-tertiary);
    border-radius: var(--border-radius-sm);
  }
  .pending-item:hover .remove-icon {
    display: flex;
  }
  .pending-item .remove-icon:hover {
    background-color: var(--color-surface-mid);
  }

  /* In the "All" scope the list includes repos that are only in storage;
     `rad ls --all` dims those too, where it labels them "local". */
  .nav-item.not-seeded {
    opacity: 0.55;
  }
  .nav-item.not-seeded:hover,
  .nav-item.not-seeded.active {
    opacity: 1;
  }
  .private-icon {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  /* The badge is the rail's stand-in for the inline lock, which has no room
     beside a 1rem avatar in a 2rem square. */
  .avatar {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
  }
  .avatar-lock {
    display: none;
  }
  :global(.view.mini) .private-icon {
    display: none;
  }
  /* Overhangs the avatar so it clears the generated pattern. Its backdrop is
     the row's own fill, hence the states below. */
  :global(.view.mini) .avatar-lock {
    display: flex;
    position: absolute;
    right: -0.1875rem;
    bottom: -0.1875rem;
    align-items: center;
    justify-content: center;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-secondary);
  }
  :global(.view.mini) .avatar-lock :global(svg) {
    width: 0.625rem;
    height: 0.625rem;
  }
  :global(.view.mini) .nav-item:hover .avatar-lock,
  :global(.view.mini) .nav-item.active .avatar-lock,
  :global(.view.mini) .nav-item.context-active .avatar-lock {
    background-color: var(--color-surface-subtle);
  }
  .avatar-shortcut {
    display: flex;
    position: absolute;
    right: -0.25rem;
    bottom: -0.25rem;
    align-items: center;
    justify-content: center;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-secondary);
    font: var(--txt-body-s-semibold);
    font-size: 0.625rem;
    line-height: 1;
  }
  .nav-item:hover .avatar-shortcut,
  .nav-item.active .avatar-shortcut,
  .nav-item.context-active .avatar-shortcut {
    background-color: var(--color-surface-subtle);
  }
  /* Out of flow: hidden, they still reserved a button's width on every row.
     They sit over the end of the name instead, on the row's own fill. */
  .nav-item .row-actions {
    visibility: hidden;
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    padding-left: 0.25rem;
    background-color: var(--color-surface-subtle);
    color: var(--color-text-tertiary);
  }
  .nav-item:hover .row-actions,
  .nav-item.context-active .row-actions,
  .nav-item .row-actions:has(:focus-visible) {
    visibility: visible;
  }
  .nav-item .row-actions :global(.clipboard),
  .nav-item .row-actions .pin-button,
  .nav-item .row-actions .drag-handle {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--border-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nav-item .row-actions :global(.clipboard):hover,
  .nav-item .row-actions .pin-button:hover {
    background-color: var(--color-surface-mid);
  }
  .pin-button {
    background: none;
    border: 0;
    color: inherit;
    cursor: pointer;
  }
  .drag-handle {
    cursor: grab;
  }

  /* No gap: the sub-items carry their own top padding, so it animates open with
     them. A gap here would appear and vanish with the mount, jumping either
     side of the transition. */
  .repo-row-group {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .repo-row-group.drop-before::before,
  .repo-row-group.drop-after::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--color-border-mid);
    border-radius: 1px;
    pointer-events: none;
  }
  .repo-row-group.drop-before::before {
    top: -3px;
  }
  .repo-row-group.drop-after::after {
    bottom: -3px;
  }
  .nav-item.dragging {
    opacity: 0.35;
    background-color: var(--color-surface-subtle);
  }
  :global(body.dragging-pinned-repo),
  :global(body.dragging-pinned-repo *) {
    cursor: grabbing !important;
  }
  .drag-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background-color: var(--color-surface-strong);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    max-width: 14rem;
  }

  .icon {
    color: var(--color-text-tertiary);
  }
  .repo-icon {
    position: relative;
    display: inline-flex;
  }
  /* Hover swaps the repo icon for arrows showing what a click will do. Keyed
     off the label so the buttons beside it don't trigger it. */
  .icon-stack {
    display: grid;
    /* Sized and centred so both icons pivot about the same point. */
    width: 1rem;
    place-items: center;
  }
  .icon-default,
  .icon-hover {
    grid-area: 1 / 1;
    transition:
      opacity 150ms ease,
      transform 150ms ease;
    /* Promoted for good, for the same reason `.filter-action` is. */
    will-change: opacity, transform;
  }
  .icon-hover {
    opacity: 0;
    transform: rotate(-90deg);
  }
  .section-header-label:hover .icon-default,
  .section-header:focus-visible .icon-default {
    opacity: 0;
    transform: rotate(90deg);
  }
  .section-header-label:hover .icon-hover,
  .section-header:focus-visible .icon-hover {
    opacity: 1;
    transform: rotate(0);
  }
</style>

{#if seededNotReplicated.length > 0 && !sidebarCollapsed.value}
  <div
    class="section-header"
    onclick={() => (fetchingExpanded.value = !fetchingExpanded.value)}
    role="button"
    tabindex="0"
    onkeydown={e => {
      if (e.key === "Enter" || e.key === " ") {
        fetchingExpanded.value = !fetchingExpanded.value;
      }
    }}>
    <span class="section-header-label">
      <span class="icon"><Icon name="hourglass" /></span>
      Fetching {seededNotReplicated.length > 1
        ? ` (${seededNotReplicated.length})`
        : ""}
      <span class="icon">
        <Icon name={fetchingExpanded.value ? "chevron-down" : "chevron-up"} />
      </span>
    </span>
  </div>

  {#if fetchingExpanded.value}
    <div style:display="flex" style:flex-direction="column" style:gap="0.25rem">
      {#each seededNotReplicated as rid (rid)}
        <div
          class="nav-item pending-item"
          title="{$nodeRunning ? 'Fetching' : 'Queued'} {rid}">
          <span class="pending-avatar"></span>
          <span class="txt-overflow">{formatRepositoryId(rid)}</span>
          <button
            class="remove-icon filter-button"
            title="Remove"
            onclick={() => unseed(rid)}>
            <span class="icon"><Icon name="trash" /></span>
          </button>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<div
  class="repos-list {PINNED_LIST_CLASS}"
  class:empty={pinnedRepos.length === 0}>
  {#each pinnedRepos as repo (repo.rid)}
    <div
      class="repo-row-group"
      class:drop-before={drag.dropTargetRid === repo.rid &&
        drag.dropPosition === "before" &&
        drag.draggingRid !== repo.rid}
      class:drop-after={drag.dropTargetRid === repo.rid &&
        drag.dropPosition === "after" &&
        drag.draggingRid !== repo.rid}
      {...{ [DRAG_RID_ATTRIBUTE]: repo.rid }}
      animate:flip={{ duration: animationDuration }}
      in:receive={{ key: repo.rid, duration: animationDuration }}
      out:send={{ key: repo.rid, duration: animationDuration }}
      onoutroend={() => clearUnseeding(repo.rid)}>
      {@render repoRowInner(repo, true)}
    </div>
  {/each}
</div>

<div
  bind:this={allReposHeaderEl}
  class="section-header"
  class:mini={sidebarCollapsed.value}
  class:flipping={headerFlipping}
  onclick={() => {
    if (!filterOpen) {
      reposExpanded.value = !reposExpanded.value;
    }
  }}
  role="button"
  tabindex="0"
  onkeydown={e => {
    if (e.key === "Enter" || e.key === " ") {
      if (!filterOpen) {
        reposExpanded.value = !reposExpanded.value;
      }
    }
  }}>
  {#if filterOpen}
    <span
      class="section-header-label"
      onclick={e => e.stopPropagation()}
      role="none">
      <input
        bind:this={filterInputElement}
        data-mod-shortcuts
        class="filter-input"
        placeholder="Filter repos…"
        bind:value={filterQuery}
        onkeydown={e => {
          if (e.key === "Escape") {
            filterOpen = false;
            filterQuery = "";
          } else if (e.key === "Enter" && unpinnedFilteredRepos.length > 0) {
            void router.push({
              resource: "repo.home",
              rid: unpinnedFilteredRepos[0].rid,
            });
            filterQuery = "";
          }
        }} />
    </span>
  {:else}
    <span class="section-header-label">
      <span class="icon repo-icon" data-flip>
        <span class="icon-stack">
          <span class="icon-default"><Icon name="repository" /></span>
          <span class="icon-hover">
            <Icon
              name={reposExpanded.value
                ? "collapse-vertical"
                : "expand-vertical"} />
          </span>
        </span>
      </span>
      <span class="label">
        {repoListScope.value === "all" ? "All Repos" : "Seeded Repos"}
      </span>
      {#if !sidebarCollapsed.value && unpinnedReposCount > 1}
        <span
          class="global-counter-badge"
          in:scale={{ duration: 200, easing: backOut, start: 0 }}
          out:fade={{ duration: 200 }}>
          {unpinnedReposCount}
        </span>
      {/if}
    </span>
  {/if}
  <span
    class="filter-action"
    class:open={filterOpen}
    data-flip
    onclick={e => e.stopPropagation()}
    role="none">
    <button
      class="filter-button"
      title={filterOpen ? "Close filter" : "Filter repos"}
      aria-keyshortcuts={ariaKeyShortcuts("filter")}
      onclick={() => {
        if (filterOpen) {
          filterOpen = false;
          filterQuery = "";
        } else {
          filterOpen = true;
          reposExpanded.value = true;
        }
      }}>
      <span class="icon"><Icon name={filterOpen ? "close" : "search"} /></span>
    </button>
  </span>
  <span
    class="add-repo-action"
    data-flip
    onclick={e => e.stopPropagation()}
    role="none">
    <AddRepoButton reload={reloadRepos} {repos} {seededNotReplicated} />
  </span>
</div>

{#snippet repoRowInner(repo: RepoSummary, pinned: boolean = false)}
  {@const pinState = pinnedRepoIds.value.includes(repo.rid)}
  {@const shortcutNumber = shortcutNumbers.get(repo.rid)}
  <a
    class="nav-item"
    class:not-seeded={!repo.seeding}
    class:active={isRepoHome(repo.rid)}
    class:context-active={contextMenu?.repo.rid === repo.rid}
    class:dragging={pinned && drag.draggingRid === repo.rid}
    title={repoTitle(repo)}
    draggable="false"
    onmousedown={pinned && !sidebarCollapsed.value
      ? e => drag.onMouseDown(e, repo.rid)
      : undefined}
    onclick={pinned && !sidebarCollapsed.value ? drag.onClick : undefined}
    oncontextmenu={e => openContextMenu(e, repo)}
    href={router.routeToPath({ resource: "repo.home", rid: repo.rid })}>
    <span class="avatar">
      <RepoAvatar name={repo.name} rid={repo.rid} styleWidth="1rem" />
      {#if modifierHeld.value && shortcutNumber !== undefined}
        <span class="avatar-shortcut">{shortcutNumber}</span>
      {:else if repo.private}
        <span class="avatar-lock">
          <Icon name="lock" />
        </span>
      {/if}
    </span>
    <span class="txt-overflow label">{repo.name}</span>
    {#if repo.private}
      <span class="private-icon" title="Private repository">
        <Icon name="lock" />
      </span>
    {/if}
    <span
      class="row-actions"
      role="none"
      onclick={e => {
        e.preventDefault();
        e.stopPropagation();
      }}>
      <button
        class="pin-button"
        title={pinState ? "Unpin repository" : "Pin repository"}
        onclick={() => togglePin(repo.rid)}>
        <Icon name={pinState ? "pin-filled" : "pin-hollow"} />
      </button>
      {#if pinned}
        <span class="drag-handle" title="Drag to reorder">
          <Icon name="drag-handle" />
        </span>
      {/if}
    </span>
  </a>
  {#if activeRid() === repo.rid}
    {@const activeProject = activeRepo?.payloads["xyz.radicle.project"]}
    <div
      class="sub-items"
      transition:slide={{ duration: ANIMATION_DURATION_MS }}>
      {@render subItem(
        repo.name,
        router.routeToPath({
          resource: "repo.issues",
          rid: repo.rid,
          status: "open",
        }),
        "issue",
        "Issues",
        isIssues(repo.rid),
        activeProject?.meta.issues.open || undefined,
      )}
      {@render subItem(
        repo.name,
        router.routeToPath({
          resource: "repo.patches",
          rid: repo.rid,
          status: "open",
        }),
        "patch",
        "Patches",
        isPatches(repo.rid),
        activeProject?.meta.patches.open || undefined,
      )}
      {@render subItem(
        repo.name,
        router.routeToPath({
          resource: "repo.releases",
          rid: repo.rid,
        }),
        "parcel",
        "Releases",
        isReleases(repo.rid),
        releaseCount || undefined,
      )}
    </div>
  {/if}
{/snippet}

{#snippet subItem(
  repoName: string,
  href: string,
  icon: "branch" | "issue" | "patch" | "parcel",
  label: string,
  active: boolean,
  count: number | undefined,
)}
  <a
    class="nav-item sub-item"
    class:active
    class:mini={sidebarCollapsed.value}
    title={subItemTitle(repoName, label, count)}
    {href}>
    <span class="icon"><Icon name={icon} /></span>
    <span class="label">{label}</span>
    {#if !sidebarCollapsed.value && count !== undefined}
      <span
        class="global-counter-badge"
        in:scale={{ duration: 200, easing: backOut, start: 0 }}
        out:fade={{ duration: 200 }}>
        {count}
      </span>
    {/if}
  </a>
{/snippet}

{#if !sidebarCollapsed.value}
  {#if reposExpanded.value}
    <div
      class="repos-scroll"
      transition:unroll|local={{ duration: ANIMATION_DURATION_MS }}>
      <ScrollArea
        style="mask-image: linear-gradient(to bottom, transparent 0, black 0.5rem, black calc(100% - 0.5rem), transparent 100%);">
        <div class="repos-list scrolling">
          {#each unpinnedFilteredRepos as repo (repo.rid)}
            <div
              class="repo-row-group"
              data-unpinned-rid={repo.rid}
              animate:flip={{ duration: animationDuration }}
              in:receive={{ key: repo.rid, duration: animationDuration }}
              out:send={{ key: repo.rid, duration: animationDuration }}
              onoutroend={() => clearUnseeding(repo.rid)}>
              {@render repoRowInner(repo, false)}
            </div>
          {/each}
        </div>
      </ScrollArea>
    </div>
  {/if}
{/if}

{#if drag.draggedRepo}
  <div
    class="drag-ghost"
    style:left="{drag.ghostX + 12}px"
    style:top="{drag.ghostY + 8}px">
    <RepoAvatar
      name={drag.draggedRepo.name}
      rid={drag.draggedRepo.rid}
      styleWidth="1rem" />
    <span class="txt-overflow">{drag.draggedRepo.name}</span>
  </div>
{/if}

{#if contextMenu}
  {@const repo = contextMenu.repo}
  {@const url = entityUrl({ type: "repo", rid: repo.rid }, config) ?? ""}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    target={contextMenu.target}
    onclose={closeContextMenu}>
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => router.push({ resource: "repo.identity", rid: repo.rid })}>
      <Icon name="document" />
      View identity document
    </button>
    <div class="menu-separator"></div>
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => writeToClipboard(repo.rid)}>
      <Icon name="copy" />
      Copy RID
    </button>
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => writeToClipboard(`rad checkout ${repo.rid}`)}>
      <Icon name="checkout" />
      Copy checkout command
    </button>
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => writeToClipboard(url)}>
      <Icon name="link" />
      Copy link to {explorerHost(config)}
    </button>
    <a
      class="menu-item"
      role="menuitem"
      href={url}
      target="_blank"
      rel="noreferrer noopener">
      <Icon name="open-external" />
      Open in {explorerHost(config)}
    </a>
    <div class="menu-separator"></div>
    {#if repo.seeding}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => confirmUnseed(repo)}>
        <Icon name="seed" />
        Unseed
      </button>
    {:else}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => void startSeeding(repo.rid)}>
        <Icon name="seed-filled" />
        Start seeding
      </button>
    {/if}
  </ContextMenu>
{/if}
