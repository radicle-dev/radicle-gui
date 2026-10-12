<script lang="ts">
  import type { PatchStatus, PatchView } from "./router";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Operation } from "@bindings/cob/Operation";
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { Action } from "@bindings/cob/patch/Action";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { Review } from "@bindings/cob/patch/Review";
  import type { Revision } from "@bindings/cob/patch/Revision";
  import type { Config } from "@bindings/config/Config";
  import type { Stats } from "@bindings/diff/Stats";
  import type { Commit } from "@bindings/repo/Commit";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import countBy from "lodash/countBy";
  import mapValues from "lodash/mapValues";
  import { SvelteSet } from "svelte/reactivity";

  import { commentSourcesOf } from "@app/lib/commentSources";
  import { checkedFileProgress } from "@app/lib/diffText";
  import { draftReviewStorage } from "@app/lib/draftReviewStorage";
  import { nodeRunning } from "@app/lib/events";
  import {
    cachedDiffStats,
    cachedGetDiff,
    cachedGetDiffText,
    cachedListCommits,
    invoke,
  } from "@app/lib/invoke";
  import { setPatchActivitySource } from "@app/lib/patchActivityContext";
  import { patchContributions } from "@app/lib/patchContributions";
  import type { ReviewEntry } from "@app/lib/reviewSummary";
  import { revisionTitle } from "@app/lib/revisionDescription";
  import {
    newCommitsByRevision,
    orderRevisions,
    revisionNumbers,
  } from "@app/lib/revisionList";
  import { revisionListSettings } from "@app/lib/revisionListSettings";
  import * as roles from "@app/lib/roles";
  import * as router from "@app/lib/router";
  import {
    absoluteTimestamp,
    authorForNodeId,
    didFromPublicKey,
    formatTimestamp,
    patchStatusLabel,
    publicKeyFromDid,
  } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import Button from "@app/components/Button.svelte";
  import CheckoutPatchButton from "@app/components/CheckoutPatchButton.svelte";
  import ConfirmDeleteButton from "@app/components/ConfirmDeleteButton.svelte";
  import DraftReviewBar from "@app/components/DraftReviewBar.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import EditableTitle from "@app/components/EditableTitle.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import PatchMetadata from "@app/components/PatchMetadata.svelte";
  import PatchStateButton from "@app/components/PatchStateButton.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import ReviewPage from "@app/components/ReviewPage.svelte";
  import ReviewProgressChip from "@app/components/ReviewProgressChip.svelte";
  import ReviewSummary from "@app/components/ReviewSummary.svelte";
  import RevisionComponent from "@app/components/Revision.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";
  import Spinner from "@app/components/Spinner.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    patch: Patch;
    revisions: Revision[];
    config: Config;
    activity: Operation<Action>[];
    status: PatchStatus | undefined;
    view?: PatchView;
    review?: Review;
  }

  /* eslint-disable prefer-const */
  let {
    repo,
    patch,
    revisions,
    config,
    activity,
    status,
    view,
    review,
  }: Props = $props();
  /* eslint-enable prefer-const */

  const currentReview = $derived.by(() => {
    if (!review) return undefined;
    return revisions
      .flatMap(r => r.reviews ?? [])
      .find(r => r.id === review.id);
  });

  // The revision picker shows each revision's own reviews, so "outdated" does
  // not apply and the position is the row's own.
  function revisionReviewEntries(rev: Revision): ReviewEntry[] {
    const number = revisionNumberById[rev.id] ?? 0;
    return (rev.reviews ?? []).map(review => ({
      author: review.author,
      verdict: review.verdict,
      revisionNumber: number,
      delegate: repo.delegates.some(d => d.did === review.author.did),
      reviewId: review.id,
    }));
  }

  let revisionComponent = $state<
    ReturnType<typeof RevisionComponent> | undefined
  >();

  const ownDid = $derived(didFromPublicKey(config.publicKey));
  const ownAuthor = $derived({ did: ownDid, alias: config.alias });

  const canEditPatch = $derived(
    roles.isDelegateOrAuthor(
      config.publicKey,
      repo.delegates.map(d => d.did),
      patch.author.did,
    ),
  );

  // Deleting drops the COB ref under our own namespace, so peers prune it when
  // they next fetch. We hold no such ref on anyone else's patch, where deleting
  // would only evict the local cache and the patch would return on the next
  // fetch — so the action is author-only.
  const isOwnPatch = $derived(
    publicKeyFromDid(patch.author.did) === config.publicKey,
  );

  // svelte-ignore state_referenced_locally
  let tab: "patch" | "revisions" | "timeline" = $state(
    revisions.length > 1 ? "revisions" : "patch",
  );
  const patchView: PatchView = $derived(view ?? "activity");
  // On the Changes view the diff owns the scroll — the page around it does not
  // scroll at all, and the patch chrome is rendered inside the diff's scroll
  // content instead (see `patchHeader`). A review page does the same with its
  // own chrome, so both bypass `.main` for a full-height pane.
  const changesPane = $derived(patchView === "changes" && !currentReview);
  function setView(next: PatchView) {
    void router.push({
      resource: "repo.patch",
      rid: repo.rid,
      patch: patch.id,
      status,
      reviewId: undefined,
      view: next === "activity" ? undefined : next,
    });
  }
  // The page scrolls inside the OverlayScrollbars viewport rather than the
  // window, so the sentinel is used to find the viewport to scroll.
  function jumpToMostRecent() {
    const viewport = bottomSentinel?.closest<HTMLElement>(
      "[data-overlayscrollbars-viewport]",
    );
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }
  // A sentinel at the end of the scroll area, so "Jump to most recent" hides
  // itself on a short patch or once you have scrolled down.
  let bottomSentinel = $state<HTMLElement>();
  let bottomOffscreen = $state(false);
  $effect(() => {
    const el = bottomSentinel;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        bottomOffscreen = !entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  });
  // svelte-ignore state_referenced_locally
  let selectedRevisionId: string = $state(revisions.slice(-1)[0].id);
  const selectedRevision: Revision = $derived(
    revisions.find(r => r.id === selectedRevisionId) ?? revisions.slice(-1)[0],
  );
  // When opening a specific revision's changes from the timeline, the target
  // survives the view switch (the reset effect below honours it once).
  let pendingRevisionId: string | undefined;

  // Warm the Changes-tab data for the selected revision in the background, so
  // opening the tab is instant instead of showing a fetch delay. Both halves of
  // what the tab renders: the patch text Pierre renders from, and the structured
  // diff it takes stats and per-file status from.
  $effect(() => {
    const rev = selectedRevision;
    void cachedGetDiffText(repo.rid, rev.base, rev.head, 3).catch(
      () => undefined,
    );
    void cachedGetDiff(repo.rid, {
      base: rev.base,
      head: rev.head,
    }).catch(() => undefined);
    void cachedListCommits(repo.rid, rev.base, rev.head).catch(() => undefined);
    void cachedDiffStats(repo.rid, rev.base, rev.head).catch(() => undefined);
  });
  // The metadata stats pill always reflects the latest revision, regardless of
  // what the Changes tab's revision picker is showing.
  const latestRevision: Revision = $derived(revisions.slice(-1)[0]);
  let latestRevisionStats: Stats | undefined = $state();
  let revisionPickerExpanded = $state(false);
  let filesExpanded = $state(true);
  // A file is only a reviewable unit against the whole revision, so the review
  // bar drops its progress count while a narrower diff is in view.
  let showingRevisionDiff = $state(true);

  // Cleared when the revision changes: the ids are that revision's review ids.
  const hiddenCommentSources = new SvelteSet<string>();
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    selectedRevision.id;
    hiddenCommentSources.clear();
  });

  const commentSources = $derived(commentSourcesOf(selectedRevision));

  // Where the Changes tab's comment stepper stands. Written by that tab, read by
  // the tab bar below, which is rendered here.
  let commentPosition = $state({ index: -1, total: 0 });

  let commentSourcesExpanded = $state(false);
  let commitCountsByRevisionId: Record<string, number> = $state({});
  let statsByRevisionId: Record<string, Stats> = $state({});
  let columnMenuOpen = $state(false);
  let columnMenuEl: HTMLElement | undefined = $state();
  // The column menu lives inside the revision dropdown rather than in a
  // Popover of its own, so it has to be dismissed by hand: when the dropdown
  // closes, and when a click inside it lands anywhere else.
  $effect(() => {
    if (!revisionPickerExpanded) columnMenuOpen = false;
  });
  let patchesAuthoredByDid: Record<string, number> = $state({});
  let issuesAuthoredByDid: Record<string, number> = $state({});

  // Timeline order, as delivered — see `revisionPosition`.
  const orderedRevisions = $derived(revisions);

  // How the revision picker lists revisions, remembered across patches and
  // repositories.
  const listSettings = $derived(revisionListSettings.value);
  const revisionNumberById = $derived(revisionNumbers(orderedRevisions));
  const dropdownRevisions = $derived(
    orderRevisions(orderedRevisions, patch.author.did, listSettings),
  );

  // One width for all rows: the columns to the left are right-aligned as a
  // group, so a per-row width would drag them out of line. Measured from an
  // off-screen copy rather than summed from per-glyph constants, which drift
  // whenever an icon, avatar size or font changes. The measured cell combines
  // the most reviewers on any row with the draft marker; that combination need
  // not exist, but it is never narrower than one that does.
  const widestReviewRow = $derived(
    dropdownRevisions.reduce<Revision | undefined>(
      (widest, rev) =>
        (rev.reviews?.length ?? 0) > (widest?.reviews?.length ?? 0)
          ? rev
          : widest,
      undefined,
    ),
  );
  const anyRevisionHasDraft = $derived(
    dropdownRevisions.some(rev => draftRevisionIds.includes(rev.id)),
  );

  let reviewProbeEl: HTMLElement | undefined = $state();
  let reviewColumnWidth = $state(0);
  $effect(() => {
    // Re-measure whenever the widest cell's contents could have changed.
    void widestReviewRow;
    void anyRevisionHasDraft;
    void listSettings.showReviewers;
    reviewColumnWidth = reviewProbeEl?.offsetWidth ?? 0;
  });

  const DESCRIPTION_MAX_HEIGHT = 300;
  let descriptionExpanded = $state(false);
  let descriptionEl = $state<HTMLElement>();
  let descriptionOverflows = $state(false);
  let descriptionEditing = $state(false);
  // Editing keeps the description open: collapsing it would hide part of what
  // is being written, and the height is the editor's rather than the text's.
  const descriptionCollapsed = $derived(
    descriptionOverflows && !descriptionExpanded && !descriptionEditing,
  );
  $effect(() => {
    const el = descriptionEl;
    if (!el) return;
    const measure = () => {
      descriptionOverflows = el.scrollHeight > DESCRIPTION_MAX_HEIGHT;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  let activityLoaded = $state(false);
  let activityLoading = false;
  let lastActivityRid: string | undefined;

  async function ensureRepoActivity(targetRid: string) {
    if (activityLoading || (activityLoaded && lastActivityRid === targetRid)) {
      return;
    }
    activityLoading = true;
    try {
      const [patches, issues] = await Promise.all([
        invoke<PaginatedQuery<Patch[]>>("list_patches", {
          rid: targetRid,
          skip: 0,
          status: undefined,
          take: undefined,
        }),
        invoke<Issue[]>("list_issues", {
          rid: targetRid,
          status: undefined,
        }),
      ]);
      patchesAuthoredByDid = countBy(patches.content, p => p.author.did);
      issuesAuthoredByDid = countBy(issues, i => i.author.did);
      lastActivityRid = targetRid;
      activityLoaded = true;
    } catch (error) {
      console.error("Failed to load repo author activity", error);
    } finally {
      activityLoading = false;
    }
  }

  $effect(() => {
    if (lastActivityRid && lastActivityRid !== repo.rid) {
      activityLoaded = false;
      patchesAuthoredByDid = {};
      issuesAuthoredByDid = {};
    }
  });

  setPatchActivitySource({
    prefetch: () => void ensureRepoActivity(repo.rid),
    resolve: publicKey => {
      const did = didFromPublicKey(publicKey);
      return {
        ...patchContributions(revisions, did),
        isAuthor: patch.author.did === did,
        isDelegate: repo.delegates.some(d => d.did === did),
        patchesAuthored: patchesAuthoredByDid[did] ?? 0,
        issuesAuthored: issuesAuthoredByDid[did] ?? 0,
      };
    },
  });

  $effect(() => {
    const ridLocal = repo.rid;
    const ordered = orderedRevisions;
    void Promise.all(
      ordered.map(async (rev): Promise<[string, Commit[]]> => {
        try {
          const commits = await cachedListCommits(ridLocal, rev.base, rev.head);
          return [rev.id, commits];
        } catch {
          return [rev.id, []];
        }
      }),
    ).then(entries => {
      const commits = Object.fromEntries(entries);
      commitCountsByRevisionId = mapValues(
        newCommitsByRevision(ordered, id => commits[id] ?? []),
        added => added.length,
      );
    });
  });
  // Per-revision diff stats for the dropdown: one request each, so they are
  // only fetched once the column is actually on. `cachedDiffStats` dedupes,
  // and the selected and latest revisions are usually already warm.
  $effect(() => {
    if (!listSettings.showStats) return;
    const ridLocal = repo.rid;
    const list = [...revisions];
    void Promise.all(
      list.map(async (rev): Promise<[string, Stats | undefined]> => {
        try {
          return [rev.id, await cachedDiffStats(ridLocal, rev.base, rev.head)];
        } catch {
          return [rev.id, undefined];
        }
      }),
    ).then(entries => {
      const next: Record<string, Stats> = {};
      for (const [id, stats] of entries) {
        if (stats) next[id] = stats;
      }
      statsByRevisionId = next;
    });
  });

  const selectedRevisionIndex = $derived(
    orderedRevisions.findIndex(r => r.id === selectedRevisionId),
  );

  $effect(() => {
    const rev = latestRevision;
    let cancelled = false;
    // Use the same stats source (the diff_stats command) as the Changes view,
    // so the meta-bar counts match; get_diff's own stats differ slightly.
    void cachedDiffStats(repo.rid, rev.base, rev.head).then(stats => {
      if (cancelled) return;
      latestRevisionStats = stats;
    });
    return () => {
      cancelled = true;
    };
  });

  // svelte-ignore state_referenced_locally
  let lastPatchId = $state(patch.id);
  $effect(() => {
    if (patch.id !== lastPatchId) {
      lastPatchId = patch.id;
      tab = revisions.length > 1 ? "revisions" : "patch";
      selectedRevisionId = revisions.slice(-1)[0].id;
    }
  });

  // Switching between Activity and Changes resets the revision selector to the
  // latest revision; the meta bar stats already track the latest independently.
  // svelte-ignore state_referenced_locally
  let lastPatchView = $state(patchView);
  $effect(() => {
    if (patchView !== lastPatchView) {
      lastPatchView = patchView;
      selectedRevisionId = pendingRevisionId ?? revisions.slice(-1)[0].id;
      pendingRevisionId = undefined;
    }
  });

  async function saveState(newState: Patch["state"]) {
    try {
      await invoke("edit_patch", {
        rid: repo.rid,
        cobId: patch.id,
        action: {
          type: "lifecycle",
          state: newState,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Changing state failed", error);
    } finally {
      await loadPatch();
    }
  }

  async function updateTitle(newTitle: string) {
    try {
      await invoke("edit_patch", {
        rid: repo.rid,
        cobId: patch.id,
        action: {
          id: patch.id,
          type: "edit",
          title: newTitle,
          target: "delegates",
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing title failed: ", error);
    } finally {
      await loadPatch();
    }
  }

  async function loadPatch(patchId: string = patch.id) {
    [patch, revisions, activity] = await Promise.all([
      invoke<Patch>("patch_by_id", {
        rid: repo.rid,
        id: patchId,
      }),
      invoke<Revision[]>("revisions_by_patch", {
        rid: repo.rid,
        id: patchId,
      }),
      invoke<Operation<Action>[]>("activity_by_patch", {
        rid: repo.rid,
        id: patchId,
      }),
    ]);
  }

  // A draft review belongs to a single revision, mirroring the protocol's
  // one-review-per-author-per-revision rule, so the draft on show is always the
  // one for the revision currently selected.
  const ownDraftReview = $derived(
    draftReviewStorage.getForRevision(selectedRevision.id, ownAuthor),
  );
  const draftRevisionIds = $derived(
    revisions
      .filter(r => draftReviewStorage.hasForRevision(r.id, config.publicKey))
      .map(r => r.id),
  );

  // Drafts for revisions this patch no longer has are unreachable: nothing can
  // open them and publishing needs a live revision. Clear them out as the patch
  // loads rather than letting them accumulate in local storage forever.
  $effect(() => {
    draftReviewStorage.pruneStale(
      patch.id,
      revisions.map(r => r.id),
      config.publicKey,
    );
  });

  function selectRevision(revId: string) {
    selectedRevisionId = revId;
  }
  const hasOwnPublishedReviewOnSelected = $derived(
    selectedRevision.reviews?.some(r => r.author.did === ownDid) ?? false,
  );

  let fileProgress: { filesChecked: number; filesTotal: number } | undefined =
    $state();
  $effect(() => {
    const draft = ownDraftReview;
    const rev = selectedRevision;
    if (!draft) {
      fileProgress = undefined;
      return;
    }
    let cancelled = false;
    void cachedGetDiff(repo.rid, {
      base: rev.base,
      head: rev.head,
    }).then(diff => {
      if (cancelled) return;
      fileProgress = checkedFileProgress(diff.files, draft.checkedFiles);
    });
    return () => {
      cancelled = true;
    };
  });

  async function deletePatch() {
    try {
      await invoke("delete_patch", {
        rid: repo.rid,
        cobId: patch.id,
        opts: { announce: $nodeRunning && $announce },
      });
      void router.push({
        resource: "repo.patches",
        rid: repo.rid,
        status: patch.state.status,
      });
    } catch (error) {
      console.error("Deleting patch failed", error);
    }
  }
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .breadcrumb-link {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .breadcrumb-title {
    color: var(--color-text-primary);
    font: var(--txt-body-m-medium);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .breadcrumb-link:hover {
    color: var(--color-text-primary);
  }
  .main {
    padding: 1.5rem 6rem;
    min-width: 0;
    max-width: 80rem;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "title"
      "meta"
      "content";
    column-gap: 2rem;
  }
  /* The Changes view and a review page do not use `.main` at all: the diff owns
     the scroll and renders the chrome inside its own scroll content, so this
     pane only has to hand it the remaining height without scrolling itself. */
  .diff-pane {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .title {
    grid-area: title;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
  }
  .meta-bar {
    grid-area: meta;
    margin-bottom: 0.5rem;
  }
  .content {
    grid-area: content;
    min-width: 0;
  }
  .patch-description {
    position: relative;
  }
  .patch-description.collapsed .patch-description-body {
    max-height: 300px;
    overflow: hidden;
  }
  .patch-description-toggle {
    display: flex;
    justify-content: center;
    margin-top: 0.5rem;
    margin-bottom: 1.5rem;
  }
  .patch-description.collapsed {
    margin-bottom: 1.5rem;
  }
  .patch-description.collapsed .patch-description-toggle {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    align-items: flex-end;
    height: 6rem;
    margin: 0;
    padding-bottom: 0.25rem;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--color-surface-canvas)
    );
    pointer-events: none;
  }
  /* Identical to the "View all revision changes" button (.diff-tease-button). */
  .patch-description-button {
    pointer-events: auto;
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    cursor: pointer;
    box-shadow: var(--elevation-low);
  }
  .patch-description-button:hover,
  .patch-description-button:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  /* One line under the row, none above it: the metadata it follows needs air
     rather than a rule. */
  .tabs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    margin-top: 0.5rem;
    border-bottom: 1px solid var(--color-border-subtle);
    margin-bottom: 1rem;
  }
  /* On the Changes tab this row is the diff's sticky bar, and anything it
     carries is carried for as long as it stays pinned. The gap belongs to the
     metadata above it instead, where it scrolls away and leaves the pinned row
     as tight as it can be (see `.diff-header` in `Changes`). */
  .tabs.changes {
    margin-top: 0;
  }
  .tabs-left,
  .tabs-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .tabs-right {
    margin-left: auto;
  }
  /* Tighter than the row it sits in: the two arrows and the count are one
     control, not three. */
  .comment-stepper {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }
  .comment-position {
    /* Enough for "16 of 16" without the arrows shifting as the number grows
       through a walk. */
    min-width: 4.5rem;
    text-align: center;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .avatar-stack {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  .avatar-stack :global(img) {
    outline: 1px solid var(--color-surface-canvas);
    margin-left: -0.375rem;
  }
  .avatar-stack :global(img:first-child) {
    margin-left: 0;
  }
  .avatar-overflow {
    margin-left: 0.125rem;
    color: var(--color-text-tertiary);
  }
  .revision-title {
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    max-width: 24rem;
  }
  .revision-title.empty {
    color: var(--color-text-quaternary);
  }
  .revision-date {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    /* Timestamps range from "now" to "11mo"; reserving the widest keeps the
       descriptions after them at a constant offset. */
    min-width: 2.5rem;
  }
  .revision-sort {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .revision-columns {
    position: relative;
    display: flex;
    align-items: center;
    margin-left: auto;
  }
  .column-menu {
    position: absolute;
    top: calc(100% + 0.25rem);
    right: 0;
    z-index: 10;
    width: max-content;
    padding: 0.25rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .revision-number {
    color: var(--color-text-tertiary);
    font: var(--txt-code-regular);
    /* Right-aligned over a reserved width so the digits line up and the
       columns after it start at the same offset on every row. */
    min-width: 1.75rem;
    text-align: right;
  }
  .revision-stats {
    padding-left: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
    font: var(--txt-code-regular);
    /* Reserved so the columns beside it hold still while the stats load and
       across revisions of very different sizes. */
    min-width: 7rem;
    justify-content: flex-end;
  }
  .stats-loading {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-tertiary);
  }
  .stats-insertions {
    color: var(--color-feedback-success-text);
  }
  .stats-deletions {
    color: var(--color-feedback-error-text);
  }
  .revision-sort-label {
    padding: 0 0.25rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .revision-author {
    /* Pushed right rather than pinned to a column, because the descriptions
       vary too much in length for a fixed title width not to leave a wide gap.
       Reserving a width here still lines the avatars up: the cell's right edge
       is fixed by the count column beside it, and the name sits at its start.
       A longer-than-usual alias just grows the cell leftwards. */
    margin-left: auto;
    min-width: 10rem;
    padding-left: 1rem;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    white-space: nowrap;
  }
  /* Off-screen copy of the widest review cell, measured to size the column.
     Taken out of flow so it neither shows nor affects layout. */
  .revision-reviews-probe {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .revision-reviews {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
    /* Width comes from `reviewColumnWidth`, which measures the widest row.
       The clip is a backstop only. */
    overflow: hidden;
    justify-content: flex-end;
  }
  .revision-commits-meta {
    padding-left: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-text-tertiary);
    white-space: nowrap;
    min-width: 3.5rem;
  }
</style>

<Layout>
  <div class="page">
    <Topbar>
      <div class="breadcrumb">
        <Icon
          name={patch.state.status === "open"
            ? "patch"
            : `patch-${patch.state.status}`} />
        <button
          class="breadcrumb-link"
          onclick={() =>
            router.push({
              resource: "repo.patches",
              rid: repo.rid,
              status: patch.state.status,
            })}>
          {patchStatusLabel[patch.state.status]}
        </button>
        <Icon name="chevron-right" />
        {#if currentReview}
          <button
            class="breadcrumb-link breadcrumb-title"
            onclick={() =>
              router.push({
                resource: "repo.patch",
                rid: repo.rid,
                patch: patch.id,
                status,
                reviewId: undefined,
                view: patchView === "changes" ? "changes" : undefined,
              })}>
            {patch.title}
          </button>
          <Icon name="chevron-right" />
          <span style:color="var(--color-text-secondary)">
            Review by {currentReview.author.alias ??
              currentReview.author.did.slice(0, 16)}
          </span>
        {:else}
          <span class="breadcrumb-title">{patch.title}</span>
        {/if}
      </div>
      <div
        class="global-flex"
        style:margin-left="auto"
        style:gap="0.5rem"
        style:z-index="40">
        <!-- Not on the review view: the page's own Delete is for the review, and
             a second Delete up here would be one word for two different
             targets. -->
        {#if isOwnPatch && !currentReview}
          <ConfirmDeleteButton noun="patch" onDelete={deletePatch} />
        {/if}
        <ShareButton
          target={{ type: "cob", kind: "patch", rid: repo.rid, oid: patch.id }}
          id={patch.id}
          idLabel="patch"
          variant="naked"
          {config} />
        <CheckoutPatchButton
          patchId={patch.id}
          selectedRevisionId={selectedRevision.id}
          {tab} />
        <!-- Not on the review view: reviewing is what that view already is, and
             it carries its own actions on the page. -->
        {#if !currentReview}
          {#if ownDraftReview}
            {#if patchView !== "changes"}
              <Button
                variant="secondary"
                onclick={() => setView("changes")}
                title="Continue your review of this revision">
                <Icon name="comment" />
                <span
                  class="txt-body-m-regular global-hide-on-medium-desktop-down">
                  Continue review
                </span>
              </Button>
            {/if}
          {:else}
            <Button
              variant="secondary"
              disabled={hasOwnPublishedReviewOnSelected}
              onclick={() => {
                draftReviewStorage.create(
                  repo.rid,
                  patch.id,
                  selectedRevision.id,
                  config.publicKey,
                );
                setView("changes");
              }}
              title={hasOwnPublishedReviewOnSelected
                ? "You already reviewed this revision. You can still add comments on the changes."
                : "Start a review of this revision"}>
              <Icon name="comment" />
              <span
                class="txt-body-m-regular global-hide-on-medium-desktop-down">
                Review
              </span>
            </Button>
          {/if}
        {/if}
      </div>
    </Topbar>

    <!-- Grid children of `.main`, which places them by area — so they cannot be
         bundled with the tab bar, which belongs inside `.content`. -->
    {#snippet patchHeader()}
      <div class="title">
        <PatchStateButton
          selectedState={patch.state}
          onSelect={newState => {
            void saveState(newState);
          }}
          disabled={!canEditPatch} />
        <EditableTitle
          {updateTitle}
          allowedToEdit={canEditPatch ? true : undefined}
          title={patch.title}
          cobId={patch.id} />
      </div>
      <div class="meta-bar">
        <PatchMetadata
          {config}
          {loadPatch}
          {patch}
          {repo}
          {revisions}
          stats={latestRevisionStats}
          view={patchView}
          onShowChanges={() => {
            selectedRevisionId = latestRevision.id;
            setView("changes");
          }} />
      </div>
    {/snippet}

    {#snippet tabs()}
      <div class="tabs" class:changes={patchView === "changes"}>
        <div class="tabs-left">
          <Button
            variant={patchView === "activity" ? "ghost" : "naked"}
            active={patchView === "activity"}
            onclick={() => setView("activity")}>
            <Icon name="activity" />
            Activity
          </Button>
          <Button
            variant={patchView === "changes" ? "ghost" : "naked"}
            active={patchView === "changes"}
            onclick={() => setView("changes")}>
            <Icon name="diff" />
            Changes
          </Button>
        </div>
        {#if patchView === "activity"}
          {#if bottomOffscreen}
            <div class="tabs-right">
              <Button variant="naked" onclick={jumpToMostRecent}>
                <Icon name="arrow-down" />
                Jump to most recent
              </Button>
            </div>
          {/if}
        {:else if patchView === "changes"}
          {@const onLatestRevision = selectedRevision.id === latestRevision.id}
          <div class="tabs-right">
            {#if commentSources.length > 0}
              <!-- One control: the arrows walk the comments on the diff and the
                   count between them opens the filter that decides which are
                   there to walk. -->
              <div class="comment-stepper">
                <Button
                  variant="naked"
                  title="Previous comment"
                  disabled={commentPosition.total === 0}
                  onclick={() => revisionComponent?.stepComment(-1)}>
                  <Icon name="arrow-up" />
                </Button>
                <Popover
                  popoverPadding="0"
                  placement="bottom-start"
                  bind:expanded={commentSourcesExpanded}>
                  {#snippet toggle(onclick)}
                    <Button
                      variant="outline"
                      {onclick}
                      active={commentSourcesExpanded}
                      title="Choose which comments are shown on the diff">
                      <div
                        class="global-flex txt-body-m-regular"
                        style:gap="0.375rem">
                        <Icon name="comment" />
                        <span class="comment-position">
                          {#if commentPosition.total === 0}
                            <!-- Hiding every source is the reader's own doing
                                 and says how to get them back; anything else
                                 that leaves the diff bare is just "none". -->
                            {hiddenCommentSources.size === commentSources.length
                              ? "All hidden"
                              : "none"}
                          {:else}
                            <!-- Reads as 1 before the first step, which is where
                                 stepping down goes anyway. -->
                            {Math.max(commentPosition.index + 1, 1)}
                            of
                            {commentPosition.total}
                          {/if}
                        </span>
                      </div>
                    </Button>
                  {/snippet}
                  {#snippet popover()}
                    <div
                      style:border="1px solid var(--color-border-subtle)"
                      style:border-radius="var(--border-radius-sm)"
                      style:background-color="var(--color-surface-canvas)">
                      <DropdownList items={commentSources}>
                        {#snippet item(source)}
                          {@const hidden = hiddenCommentSources.has(source.id)}
                          <DropdownListItem
                            selected={!hidden}
                            styleGap="0.5rem"
                            onclick={() => {
                              if (hidden) {
                                hiddenCommentSources.delete(source.id);
                              } else {
                                hiddenCommentSources.add(source.id);
                              }
                            }}>
                            <Icon name={hidden ? "eye-slash" : "eye"} />
                            <span class="avatar-stack">
                              {#each source.nids.slice(0, 2) as nid (nid)}
                                <UserAvatar nodeId={nid} styleWidth="1rem" />
                              {/each}
                              {#if source.nids.length > 2}
                                <span class="avatar-overflow">+</span>
                              {/if}
                            </span>
                            <span
                              style:color={hidden
                                ? "var(--color-text-tertiary)"
                                : undefined}>
                              {source.name}
                            </span>
                            <div
                              class="global-flex"
                              style:margin-left="auto"
                              style:padding-left="1rem"
                              style:color="var(--color-text-tertiary)">
                              <Icon name="comment" />
                              {source.count}
                            </div>
                          </DropdownListItem>
                        {/snippet}
                      </DropdownList>
                    </div>
                  {/snippet}
                </Popover>
                <Button
                  variant="naked"
                  title="Next comment"
                  disabled={commentPosition.total === 0}
                  onclick={() => revisionComponent?.stepComment(1)}>
                  <Icon name="arrow-down" />
                </Button>
              </div>
            {/if}
            {#if !onLatestRevision}
              <Button
                variant="outline"
                onclick={() => void selectRevision(latestRevision.id)}>
                <Icon name="revision" />
                Back to latest revision
              </Button>
            {/if}
            {#if orderedRevisions.length > 1}
              <Popover
                popoverPadding="0"
                placement="bottom-start"
                bind:expanded={revisionPickerExpanded}>
                {#snippet toggle(onclick)}
                  <Button
                    variant="outline"
                    {onclick}
                    active={revisionPickerExpanded}>
                    <Icon name="revision" />
                    <span
                      style:color={onLatestRevision
                        ? "var(--color-text-secondary)"
                        : "var(--color-feedback-warning-text)"}>
                      Revision {selectedRevisionIndex >= 0
                        ? selectedRevisionIndex + 1
                        : "?"} of
                      {orderedRevisions.length}
                    </span>
                    <span class="txt-id">
                      {selectedRevision.id.substring(0, 7)}
                    </span>
                    <Icon
                      name={revisionPickerExpanded
                        ? "chevron-up"
                        : "chevron-down"} />
                  </Button>
                {/snippet}
                {#snippet popover()}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    style:border="1px solid var(--color-border-subtle)"
                    style:border-radius="var(--border-radius-sm)"
                    style:background-color="var(--color-surface-canvas)"
                    style:width="max-content"
                    style:max-width="min(48rem, 90vw)"
                    onclick={e => {
                      if (
                        columnMenuEl &&
                        !e.composedPath().includes(columnMenuEl)
                      ) {
                        columnMenuOpen = false;
                      }
                    }}>
                    <div class="revision-sort">
                      <span class="revision-sort-label">Sort by</span>
                      <Button
                        variant="ghost"
                        active
                        title={listSettings.sortDesc
                          ? "Newest first"
                          : "Oldest first"}
                        onclick={() => revisionListSettings.toggle("sortDesc")}>
                        Date
                        <Icon
                          name={listSettings.sortDesc
                            ? "arrow-down"
                            : "arrow-up"} />
                      </Button>
                      <span class="revision-sort-label">Group by</span>
                      <Button
                        variant={listSettings.groupByAuthor ? "ghost" : "naked"}
                        active={listSettings.groupByAuthor}
                        title={listSettings.groupByAuthor
                          ? "Show revisions in one list"
                          : "Bucket revisions per author, patch author first"}
                        onclick={() =>
                          revisionListSettings.toggle("groupByAuthor")}>
                        Author
                      </Button>
                      <span class="revision-columns" bind:this={columnMenuEl}>
                        <Button
                          variant="naked"
                          active={columnMenuOpen}
                          title="Choose which columns are shown"
                          styleHeight="1.75rem"
                          styleWidth="1.75rem"
                          stylePadding="0"
                          styleJustifyContent="center"
                          onclick={() => (columnMenuOpen = !columnMenuOpen)}>
                          <Icon name="ellipsis-vertical" />
                        </Button>
                        {#if columnMenuOpen}
                          <div class="column-menu">
                            <DropdownListItem
                              selected={listSettings.showNumber}
                              styleGap="0.5rem"
                              onclick={() =>
                                revisionListSettings.toggle("showNumber")}>
                              <Icon
                                name={listSettings.showNumber
                                  ? "eye"
                                  : "eye-slash"} />
                              Revision number
                            </DropdownListItem>
                            <DropdownListItem
                              selected={listSettings.showStats}
                              styleGap="0.5rem"
                              onclick={() =>
                                revisionListSettings.toggle("showStats")}>
                              <Icon
                                name={listSettings.showStats
                                  ? "eye"
                                  : "eye-slash"} />
                              Changed lines
                            </DropdownListItem>
                            <DropdownListItem
                              selected={listSettings.showReviewers}
                              styleGap="0.5rem"
                              onclick={() =>
                                revisionListSettings.toggle("showReviewers")}>
                              <Icon
                                name={listSettings.showReviewers
                                  ? "eye"
                                  : "eye-slash"} />
                              Reviewers
                            </DropdownListItem>
                          </div>
                        {/if}
                      </span>
                    </div>
                    {#if listSettings.showReviewers}
                      <span
                        bind:this={reviewProbeEl}
                        class="revision-reviews revision-reviews-probe"
                        aria-hidden="true">
                        <ReviewSummary
                          borderless
                          reviews={widestReviewRow
                            ? revisionReviewEntries(widestReviewRow)
                            : []} />
                        {#if anyRevisionHasDraft}
                          <ReviewProgressChip nid={config.publicKey} />
                        {/if}
                      </span>
                    {/if}
                    <DropdownList items={dropdownRevisions}>
                      {#snippet item(rev)}
                        {@const title = revisionTitle(rev)}
                        {@const commitCount = commitCountsByRevisionId[rev.id]}
                        <DropdownListItem
                          selected={rev.id === selectedRevision.id}
                          styleGap="0.5rem"
                          onclick={() => {
                            void selectRevision(rev.id);
                            closeFocused();
                          }}>
                          {#if listSettings.showNumber}
                            <span class="revision-number">
                              r{revisionNumberById[rev.id]}
                            </span>
                          {/if}
                          <Icon name="revision" />
                          <span class="txt-id">
                            {rev.id.substring(0, 7)}
                          </span>
                          <span
                            class="revision-date"
                            title={absoluteTimestamp(rev.timestamp)}>
                            {formatTimestamp(rev.timestamp)}
                          </span>
                          <span
                            class="revision-title"
                            class:empty={title === undefined}>
                            {title ?? "No description"}
                          </span>
                          <span class="revision-author">
                            <NodeId {...authorForNodeId(rev.author)} />
                          </span>
                          <!-- Rendered even while the count is still
                               loading so the column keeps its width
                               and the rows stay aligned. -->
                          <span class="revision-commits-meta">
                            {#if commitCount !== undefined}
                              <Icon name="commit" />
                              {commitCount}
                            {/if}
                          </span>
                          {#if listSettings.showStats}
                            {@const stats = statsByRevisionId[rev.id]}
                            <!-- Reserved while the stats load, so the
                                 columns beside it stay put. -->
                            <span class="revision-stats">
                              {#if stats}
                                <span class="stats-insertions">
                                  +{stats.insertions}
                                </span>
                                <span class="stats-deletions">
                                  -{stats.deletions}
                                </span>
                              {:else}
                                <span
                                  class="stats-loading"
                                  title="Counting changed lines…">
                                  <Spinner />
                                </span>
                              {/if}
                            </span>
                          {/if}
                          {#if listSettings.showReviewers}
                            <span
                              class="revision-reviews"
                              style:flex="0 0 {reviewColumnWidth}px"
                              style:margin-left={reviewColumnWidth > 0
                                ? "1rem"
                                : "0"}>
                              <ReviewSummary
                                borderless
                                reviews={revisionReviewEntries(rev)} />
                              {#if draftRevisionIds.includes(rev.id)}
                                <ReviewProgressChip nid={config.publicKey} />
                              {/if}
                            </span>
                          {/if}
                        </DropdownListItem>
                      {/snippet}
                    </DropdownList>
                  </div>
                {/snippet}
              </Popover>
            {/if}
            <Button
              variant="naked"
              title={filesExpanded ? "Collapse all files" : "Expand all files"}
              onclick={() =>
                revisionComponent?.setAllFilesCollapsed(filesExpanded)}>
              <Icon
                name={filesExpanded
                  ? "collapse-vertical"
                  : "expand-vertical"} />
            </Button>
          </div>
        {/if}
      </div>
    {/snippet}

    {#snippet revisionBody()}
      <RevisionComponent
        patchTargetBranch={patch.targetBranch}
        bind:this={revisionComponent}
        rid={repo.rid}
        repoDelegates={repo.delegates}
        patchId={patch.id}
        {loadPatch}
        revision={selectedRevision}
        {config}
        view={patchView}
        {activity}
        {revisions}
        draftReviewId={ownDraftReview?.id}
        {draftRevisionIds}
        hiddenCommentSources={[...hiddenCommentSources]}
        onViewChanges={revisionId => {
          pendingRevisionId = revisionId;
          selectedRevisionId = revisionId;
          setView("changes");
        }}
        chrome={patchHeader}
        {tabs}
        bind:showingRevisionDiff
        bind:filesExpanded
        bind:commentPosition />
    {/snippet}

    {#if changesPane}
      <div class="diff-pane">
        {@render revisionBody()}
      </div>
    {:else if currentReview}
      <div class="diff-pane">
        <ReviewPage
          {config}
          {loadPatch}
          {patch}
          repoDelegates={repo.delegates}
          review={currentReview}
          {revisions}
          {activity}
          rid={repo.rid}
          {status}
          fromView={patchView} />
      </div>
    {:else}
      <ScrollArea style="flex: 1; min-height: 0;">
        <div>
          <div class="main">
            {@render patchHeader()}

            <div class="content">
              {#if patchView !== "changes" && !currentReview}
                <div
                  class="patch-description"
                  class:collapsed={descriptionCollapsed}>
                  <div class="patch-description-body" bind:this={descriptionEl}>
                    <RevisionComponent
                      patchTargetBranch={patch.targetBranch}
                      rid={repo.rid}
                      repoDelegates={repo.delegates}
                      patchId={patch.id}
                      {loadPatch}
                      revision={revisions[0]}
                      {config}
                      view="description"
                      bind:editingDescription={descriptionEditing} />
                  </div>
                  {#if descriptionOverflows && !descriptionEditing}
                    <div class="patch-description-toggle">
                      <button
                        type="button"
                        class="patch-description-button txt-body-m-medium"
                        onclick={() =>
                          (descriptionExpanded = !descriptionExpanded)}>
                        {descriptionExpanded ? "Show less" : "Show more"}
                        <Icon
                          name={descriptionExpanded
                            ? "collapse-vertical"
                            : "expand-vertical"} />
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}

              {@render tabs()}
              {@render revisionBody()}
            </div>
          </div>
        </div>
        <div bind:this={bottomSentinel} aria-hidden="true"></div>
      </ScrollArea>
    {/if}

    {#if ownDraftReview && patchView !== "activity"}
      <DraftReviewBar
        draftReview={ownDraftReview}
        filesChecked={showingRevisionDiff
          ? fileProgress?.filesChecked
          : undefined}
        filesTotal={showingRevisionDiff ? fileProgress?.filesTotal : undefined}
        alreadyReviewed={hasOwnPublishedReviewOnSelected}
        onChange={loadPatch}
        onPublish={async revisionId => {
          await loadPatch();
          const updatedRev = revisions.find(r => r.id === revisionId);
          const newReview = updatedRev?.reviews?.find(
            r => r.author.did === ownDid,
          );
          if (newReview) {
            void router.push({
              resource: "repo.patch",
              rid: repo.rid,
              patch: patch.id,
              status: undefined,
              reviewId: newReview.id,
              view: patchView === "changes" ? "changes" : undefined,
            });
          }
        }}
        onCancel={() => {
          draftReviewStorage.delete(ownDraftReview.id);
          void loadPatch();
        }}
        onSelectComment={currentReview
          ? // A published review page renders its own diff and none of this
            // draft's comments, so there is nothing to scroll to; the location
            // falls back to plain text.
            undefined
          : comment => {
              if (comment.location) {
                void revisionComponent?.revealComment(comment.location);
              }
            }} />
    {/if}
  </div>
</Layout>
