<script lang="ts">
  import type { CobEvent, Comment, PatchState, Repo, Review, Revision } from "@app/node/model";

  import { cubicIn, cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { diffSnapshots, diffStats } from "@app/node/diff";
  import { navigate } from "@app/lib/router.svelte";
  import { copy, fullDate, plural, shortId, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";
  import { toast } from "@app/lib/toast.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import CobStateButton from "@app/components/CobStateButton.svelte";
  import CommentView from "@app/components/CommentView.svelte";
  import Composer from "@app/components/Composer.svelte";
  import DiffStyleSwitch from "@app/components/DiffStyleSwitch.svelte";
  import DiffView from "@app/components/DiffView.svelte";
  import EditableTitle from "@app/components/EditableTitle.svelte";
  import Empty from "@app/components/Empty.svelte";
  import EventRow from "@app/components/EventRow.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IdChip from "@app/components/IdChip.svelte";
  import LabelsChip from "@app/components/LabelsChip.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import ReviewItem from "@app/components/ReviewItem.svelte";
  import RyphRunCard from "@app/components/RyphRunCard.svelte";
  import SheetControls from "@app/components/SheetControls.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";
  import MergeDialog from "@app/components/MergeDialog.svelte";
  import { useSheet } from "@app/lib/sheet";
  import { motion } from "@app/lib/motion";
  import { highlightTargets } from "@app/lib/highlight";
  import SummonButton from "@app/components/SummonButton.svelte";
  import Thread from "@app/components/Thread.svelte";
  import Timeline from "@app/components/Timeline.svelte";
  import TimelineRow from "@app/components/TimelineRow.svelte";

  interface Props {
    repo: Repo;
    id: string;
    view: string;
    // 1-based revision number from the URL; the latest when absent.
    rev?: number;
  }

  const { repo, id, view, rev }: Props = $props();
  const sheet = useSheet();

  let sentinel: HTMLDivElement | undefined = $state();
  let stuck = $state(false);
  $effect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      stuck = !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + 1;
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  const patch = $derived(repo.patches.find(p => p.id === id));
  const base = $derived(node.repoPath(repo));
  const href = $derived(`${base}/patches/${id}`);
  const latest = $derived(patch ? node.latestRevision(patch) : undefined);
  const tab = $derived(view === "changes" ? "changes" : "activity");

  // The side sheet has no URL of its own, so it keeps the choice locally.
  let sheetRevIndex = $state<number | undefined>(undefined);
  const revIndex = $derived.by(() => {
    const index = sheet ? sheetRevIndex : rev !== undefined ? rev - 1 : undefined;
    return patch && index !== undefined && index >= 0 && index < patch.revisions.length - 1 ? index : undefined;
  });

  function pageHref(v: "activity" | "changes", index: number | undefined) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one call, never reactive
    const q = new URLSearchParams();
    if (v === "changes") q.set("view", "changes");
    if (index !== undefined && patch && index < patch.revisions.length - 1) q.set("rev", String(index + 1));
    const qs = q.toString();
    return `${href}${qs ? `?${qs}` : ""}`;
  }

  function selectRevision(index: number | undefined) {
    closeFocused();
    if (sheet) sheetRevIndex = index;
    else navigate(pageHref(tab, index), { replace: true, scroll: false });
  }
  let sincePrevious = $state(false);
  let allCollapsed = $state(false);
  const revision = $derived(
    patch ? patch.revisions[revIndex ?? patch.revisions.length - 1] : undefined,
  );
  const revisionNumber = $derived(patch && revision ? patch.revisions.indexOf(revision) + 1 : 0);
  const previous = $derived(
    patch && revision ? patch.revisions[patch.revisions.indexOf(revision) - 1] : undefined,
  );
  const files = $derived(
    revision
      ? diffSnapshots(
          repo.snapshots[sincePrevious && previous ? previous.head : revision.base] ?? {},
          repo.snapshots[revision.head] ?? {},
        )
      : [],
  );
  const revisionStats = $derived(
    revision
      ? diffStats(diffSnapshots(repo.snapshots[revision.base] ?? {}, repo.snapshots[revision.head] ?? {}))
      : undefined,
  );

  const delegate = $derived(node.isDelegate(repo));
  const mine = $derived(patch?.author === "self");
  const canEdit = $derived(delegate || mine);
  const allReviews = $derived(
    patch?.revisions.flatMap((r, i) => r.reviews.map(review => ({ review, number: i + 1 }))) ?? [],
  );
  const latestReviews = $derived(latest?.reviews ?? []);
  const accepts = $derived(
    latestReviews.filter(r => r.verdict === "accept" && repo.delegates.includes(r.author)),
  );
  const rejects = $derived(latestReviews.filter(r => r.verdict === "reject"));
  const canMerge = $derived(
    delegate && patch?.state === "open" && accepts.length >= repo.threshold && rejects.length === 0,
  );
  const myReview = $derived(latest?.reviews.find(r => r.author === "self"));
  const knownLabels = $derived([...new Set(repo.patches.flatMap(p => p.labels))]);

  // Review drafting
  let drafting = $state(false);
  let drafts = $state<{ path: string; line: number; body: string }[]>([]);
  let openDraft = $state<{ path: string; line: number } | undefined>(undefined);
  let summary = $state("");
  let verdict = $state<"comment" | "accept" | "reject">("comment");

  const reviewComments = $derived(
    revision?.reviews.flatMap(r => r.comments.map(c => ({ ...c, review: r }))) ?? [],
  );
  const marked = $derived(
    new Set([
      ...reviewComments.filter(c => c.location).map(c => `${c.location!.path}:${c.location!.line}`),
      ...drafts.map(d => `${d.path}:${d.line}`),
      ...(openDraft ? [`${openDraft.path}:${openDraft.line}`] : []),
    ]),
  );

  const canComment = $derived(
    !!patch && revision === latest && (patch.state === "open" || patch.state === "draft"),
  );

  // Hovering a line and pressing + starts a review there if one isn't open.
  function commentOn(path: string, line: number) {
    drafting = true;
    openDraft = { path, line };
  }

  function startReview() {
    sheetRevIndex = undefined;
    // The sheet hands the review over to the full page, which opens the bar
    // when it sees `review` in its address.
    if (sheet) {
      navigate(`${pageHref("changes", undefined)}&review`);
      return;
    }
    drafting = true;
    navigate(pageHref("changes", undefined));
  }

  if (!sheet && new URLSearchParams(location.search).has("review")) {
    drafting = true;
    navigate(pageHref("changes", undefined), { replace: true, scroll: false });
  }

  // Opens the activity tab and highlights every review, scrolled to the first.
  // In the side sheet it stays in the sheet.
  function showReviews() {
    const ids = allReviews.map(({ review }) => `review-${review.id}`);
    if (ids.length === 0) return;
    if (!sheet && tab !== "activity") navigate(pageHref("activity", revIndex), { scroll: false });
    highlightTargets(ids);
  }

  let merging = $state(false);

  function simulatePush() {
    if (!patch) return;
    node.do({ type: "mergePatch", rid: repo.rid, patch: patch.id });
    toast(`Push received: merged into ${repo.defaultBranch}`, { icon: "patch-merged" });
  }

  function submitReview() {
    if (!patch) return;
    node.do({
      type: "review",
      rid: repo.rid,
      patch: patch.id,
      verdict: verdict === "comment" ? undefined : verdict,
      summary: summary.trim(),
      comments: drafts,
    });
    toast(
      verdict === "accept" ? "Review submitted: accepted" : verdict === "reject" ? "Review submitted: changes requested" : "Review submitted",
      { icon: "checkmark" },
    );
    drafts = [];
    summary = "";
    drafting = false;
    verdict = "comment";
    navigate(href);
  }

  const runs = $derived(patch ? node.ryphRunsFor(repo.rid, "patch", patch.id) : []);
  const busy = $derived(runs.some(r => !r.finished));
  const origin = $derived(patch ? node.ryphRunForPatch(repo.rid, patch.id) : undefined);
  const revisionChecks = $derived(revision?.checks ?? []);
  const failingChecks = $derived(revisionChecks.filter(c => c.status === "failed"));

  type Item =
    | { kind: "run"; time: number; run: (typeof runs)[number] }
    | { kind: "revision"; time: number; rev: Revision; index: number }
    | { kind: "review"; time: number; review: Review; rev: Revision; index: number }
    | { kind: "thread"; time: number; root: Comment; replies: Comment[] }
    | { kind: "event"; time: number; event: CobEvent }
    | { kind: "merged"; time: number };

  const timeline = $derived.by((): Item[] => {
    if (!patch) return [];
    const items: Item[] = [];
    patch.revisions.forEach((rev, index) => {
      if (index > 0) items.push({ kind: "revision", time: rev.time, rev, index });
      for (const review of rev.reviews) {
        items.push({ kind: "review", time: review.time, review, rev, index });
      }
      const all = rev.comments;
      const rootOf = (c: Comment): Comment => {
        let cur = c;
        while (cur.replyTo) {
          const parent = all.find(p => p.id === cur.replyTo);
          if (!parent) break;
          cur = parent;
        }
        return cur;
      };
      for (const root of all.filter(c => rootOf(c) === c)) {
        items.push({
          kind: "thread",
          time: root.time,
          root,
          replies: all.filter(c => c !== root && rootOf(c) === root),
        });
      }
    });
    for (const event of patch.events) items.push({ kind: "event", time: event.time, event });
    if (patch.state === "merged" && patch.mergedAt) {
      items.push({ kind: "merged", time: patch.mergedAt });
    }
    for (const run of runs) items.push({ kind: "run", time: run.run.startedAt + 1, run });
    return items.sort((a, b) => a.time - b.time);
  });

  function badgeFor(c: Comment) {
    if (c.author === patch?.author) return "Author";
    if (repo.delegates.includes(c.author)) return "Delegate";
    return undefined;
  }

  function openRevision(index: number) {
    sheetRevIndex = index;
    navigate(pageHref("changes", index));
  }

  function subject(description: string) {
    return description.split("\n")[0].trim();
  }
</script>

<style>
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    /* Sticks over the site header once scrolled to it. Exactly as tall as the
       header so the pinned tabs and diff headers below line up. */
    position: sticky;
    top: 0;
    z-index: 60;
    box-sizing: border-box;
    min-height: 3.5rem;
    margin: -0.75rem 0 0.25rem;
    padding: 0.75rem 0;
    background: var(--color-surface-canvas);
    box-shadow: 0 0 0 100vmax var(--color-surface-canvas);
    clip-path: inset(0 -100vmax);
  }
  .title-row.stuck {
    box-shadow:
      0 1px 0 var(--color-border-subtle),
      0 0 0 100vmax var(--color-surface-canvas);
    clip-path: inset(0 -100vmax -1px);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
    align-items: center;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .add {
    color: var(--color-feedback-success-text);
  }
  .del {
    color: var(--color-feedback-error-text);
  }
  .reviewer-stack {
    display: inline-flex;
    align-items: center;
  }
  .reviewer-stack :global(.avatar + .avatar) {
    margin-left: -0.375rem;
    box-shadow: 0 0 0 1px var(--color-surface-canvas);
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-surface-canvas);
  }
  .tabs.pinned {
    position: sticky;
    top: 3.5rem;
    z-index: 5;
  }
  .single-revision {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-tertiary);
  }
  .selected-revision {
    border-radius: var(--border-radius-sm);
    box-shadow: inset 2px 0 0 var(--color-feedback-warning-text);
    background: var(--color-surface-subtle);
  }
  .tabs-right {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .changes {
    --diff-sticky-top: 6.55rem;
  }
  .revision-list {
    width: 28rem;
    max-width: calc(100vw - 2rem);
    box-sizing: border-box;
  }
  .rev-row {
    display: grid;
    grid-template-columns: 1.75rem 4.5rem minmax(0, 1fr) 4.5rem 2.25rem;
    align-items: center;
    gap: 0.5rem;
  }
  .rev-row > :nth-child(4) {
    text-align: right;
  }
  .rev-row .n {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-medium);
  }
  .sha {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  .latest-chip {
    font: var(--txt-body-s-medium);
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .rev-subject {
    color: var(--color-text-primary);
    font-weight: 468;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .latest-chip {
    flex-shrink: 0;
  }
  .open-changes {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    padding: 0.125rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
  }
  .open-changes:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .origin {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .origin-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gate {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    margin: 1rem 0;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .gate strong {
    color: var(--color-text-primary);
    font-weight: 468;
  }
  .gate .meter {
    display: flex;
    gap: 0.25rem;
    width: 5rem;
  }
  .gate .meter span {
    flex: 1;
    height: 0.375rem;
    border-radius: var(--border-radius-full);
    background: var(--color-surface-strong);
  }
  .gate .meter span.on {
    background: var(--color-feedback-success-fill);
  }
  .checkout {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 22rem;
  }
  .cmd {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.25rem 0.25rem 0.25rem 0.5rem;
  }
  .cmd span {
    flex: 1;
  }
  /* Pinned to the bottom of the viewport, with the page colour fading up behind
     the bar so the code it covers recedes. */
  .review-dock {
    position: sticky;
    bottom: 0;
    z-index: 10;
    margin-top: 1rem;
    padding: 3rem 0 1rem;
    background: linear-gradient(to top, var(--color-surface-canvas) 55%, transparent);
    pointer-events: none;
  }
  .review-bar {
    pointer-events: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    box-shadow: var(--elevation-low);
  }
  .draft {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .draft-label {
    font: var(--txt-body-s-medium);
    color: var(--color-feedback-warning-text);
  }
  .inline-thread {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  @media (max-width: 700px) {
    .title-row {
      flex-wrap: wrap;
    }
    .title-row :global(.title) {
      order: -1;
      flex-basis: 100%;
    }
    /* Lets the buttons flow on after the state button instead of wrapping as
       one block onto a line of their own. */
    .actions {
      display: contents;
    }
  }
  @media (max-width: 700px) {
    .title-row {
      position: static;
      margin-top: 0;
      padding-top: 0;
    }
    .tabs {
      flex-wrap: wrap;
    }
    .tabs-right {
      margin-left: 0;
      flex-wrap: wrap;
    }
  }
</style>

{#if !patch || !latest || !revision}
  <Empty icon="patch" title="Patch not found">This patch isn't on your node yet.</Empty>
{:else}
  <div class="main">
    <div class="sentinel" bind:this={sentinel}></div>
    <div class="title-row" class:stuck>
      <CobStateButton
        kind="patch"
        state={patch.state}
        options={canEdit && patch.state !== "merged" ? ["open", "draft", "archived"] : []}
        onSelect={state =>
          node.do({
            type: "patchState",
            rid: repo.rid,
            patch: patch.id,
            state: state as Exclude<PatchState, "merged">,
          })} />
      <EditableTitle
        title={patch.title}
        editable={canEdit}
        onSave={title => node.do({ type: "editCob", rid: repo.rid, kind: "patch", id: patch.id, title })} />
      <div class="actions">
        {#if !sheet}
          <Button variant="naked" title="Copy link" onclick={() => copy(location.href, "link")}>
            <Icon name="link" />
          </Button>
        {/if}
        <Popover placement="bottom-end">
          {#snippet toggle(onclick)}
            <Button variant="naked" {onclick}><Icon name="checkout" />Checkout</Button>
          {/snippet}
          {#snippet popover()}
            <div class="popover-panel checkout">
              <span class="txt-body-m-semibold">Check out revision {revisionNumber}</span>
              <div class="cmd">
                <span>rad patch checkout {shortId(patch.id)}</span>
                <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(`rad patch checkout ${shortId(patch.id)}`, "checkout command")}>
                  <Icon name="copy" />
                </Button>
              </div>
            </div>
          {/snippet}
        </Popover>
        <SummonButton
          {repo}
          kind="patch"
          {busy}
          onSummon={body => node.do({ type: "patchComment", rid: repo.rid, patch: patch.id, body })} />
        {#if canMerge}
          <Button
            variant="secondary"
            onclick={() => (merging = true)}>
            <Icon name="patch-merged" />Merge
          </Button>
          <MergeDialog bind:open={merging} {repo} {patch} onSimulatePush={simulatePush} />
        {:else if patch.state === "open" && !mine}
          <Button
            variant="secondary"
            disabled={!!myReview && !drafting}
            title={myReview ? "You already reviewed this revision" : "Start a review of this revision"}
            onclick={startReview}>
            <Icon name="comment" />Review
          </Button>
        {/if}
        {#if sheet}<SheetControls sheet={sheet()} />{/if}
      </div>
    </div>

    <div class="meta">
      <PersonLink person={patch.author} size="1rem" chip />
      <span class="chip-group">
        <IdChip id={patch.id} label="patch ID" grouped />
        <Icon name="arrow-right" />
        <a class="chip" href={`${base}/tree/${repo.defaultBranch}`}>
          <Icon name="branch" />{repo.defaultBranch}
        </a>
      </span>
      {#if revisionStats}
        <button class="chip" onclick={() => openRevision(revisionNumber - 1)} title="View changed files">
          <Icon name="diff" />
          {plural(revisionStats.files, "file")}
          <span class="add">+{revisionStats.additions}</span>
          <span class="del">-{revisionStats.deletions}</span>
        </button>
      {/if}
      {#if revisionChecks.length > 0}
        <Popover placement="bottom-start">
          {#snippet toggle(onclick)}
            <button class="chip" {onclick} title="Agentic CI from Ryph">
              <span
                style:display="inline-flex"
                style:color={failingChecks.length ? "var(--color-feedback-error-text)" : "var(--color-feedback-success-text)"}>
                <Icon name={failingChecks.length ? "close" : "checkmark"} />
              </span>
              {failingChecks.length
                ? `${failingChecks.length} of ${revisionChecks.length} checks failed`
                : `${revisionChecks.length} checks passed`}
            </button>
          {/snippet}
          {#snippet popover()}
            <div class="popover-panel">
              {#each revisionChecks as c (c.name)}
                <div class="popover-item" style="cursor: default;">
                  <span
                    style:display="inline-flex"
                    style:color={c.status === "failed" ? "var(--color-feedback-error-text)" : "var(--color-feedback-success-text)"}>
                    <Icon name={c.status === "failed" ? "close" : "checkmark"} />
                  </span>
                  <span class="mono">ryph / {c.name}</span>
                  {#if c.durationSec}<span class="caption" style="margin-left: auto;">{c.durationSec}s</span>{/if}
                </div>
              {/each}
              <div class="caption txt-body-s-regular" style="padding: 0.375rem 0.5rem;">
                Revision {patch.revisions.length} · from .ryph/checks.yml
              </div>
            </div>
          {/snippet}
        </Popover>
      {/if}
      {#if allReviews.length > 0}
        <button
          class="chip"
          title={`${accepts.length} delegate approvals on the latest revision, ${repo.threshold} needed`}
          onclick={showReviews}>
          <span
            style:color={rejects.length
              ? "var(--color-feedback-error-text)"
              : accepts.length >= repo.threshold
                ? "var(--color-feedback-success-text)"
                : undefined}
            style:display="inline-flex">
            <Icon name={rejects.length ? "stop" : accepts.length ? "thumbs-up" : "comment"} />
          </span>
          {plural(allReviews.length, "review")}
          <span class="reviewer-stack">
            {#each [...new Set(allReviews.map(r => r.review.author))].slice(0, 3) as a (a)}
              <Avatar person={a} size="1.125rem" />
            {/each}
          </span>
        </button>
      {/if}
      <LabelsChip
        labels={patch.labels}
        known={knownLabels}
        editable={canEdit}
        onSave={labels => node.do({ type: "editCob", rid: repo.rid, kind: "patch", id: patch.id, labels })} />
    </div>

    <div class="tabs" class:pinned={tab === "changes"}>
      <Button
        variant={tab === "activity" ? "ghost" : "naked"}
        active={tab === "activity"}
        onclick={() => navigate(pageHref("activity", revIndex))}>
        <Icon name="activity" />Activity
      </Button>
      <Button
        variant={tab === "changes" ? "ghost" : "naked"}
        active={tab === "changes"}
        onclick={() => navigate(pageHref("changes", revIndex))}>
        <Icon name="diff" />Changes
      </Button>
      <div class="tabs-right">
        {#if tab === "changes" && revision !== latest}
          <Button variant="outline" onclick={() => selectRevision(undefined)}>
            <Icon name="revision" />Back to latest revision
          </Button>
        {/if}
        {#if tab === "changes" && previous}
          <label class="row txt-body-m-regular caption" style="cursor: pointer;">
            <input type="checkbox" bind:checked={sincePrevious} /> Since revision {revisionNumber - 1}
          </label>
        {/if}
        {#if patch.revisions.length > 1}
          <Popover placement="bottom-end">
            {#snippet toggle(onclick)}
              <Button variant="outline" {onclick} title="Choose a revision">
                <Icon name="revision" />
                <span
                  style:color={revision === latest
                    ? "var(--color-text-secondary)"
                    : "var(--color-feedback-warning-text)"}>
                  Revision {revisionNumber} of {patch.revisions.length}
                </span>
                <span class="sha">{shortId(revision.id)}</span>
                <Icon name="chevron-down" />
              </Button>
            {/snippet}
            {#snippet popover()}
              <div class="popover-panel revision-list">
                {#each patch.revisions as r, i (r.id)}
                  <button
                    class="popover-item"
                    class:selected={r === revision}
                    onclick={() => selectRevision(i === patch.revisions.length - 1 ? undefined : i)}>
                    <span class="rev-row" style="width: 100%;">
                      <span class="n">r{i + 1}</span>
                      <span class="sha">{shortId(r.id)}</span>
                      <span class="ellipsis">{subject(r.description) || "No description"}</span>
                      <span class="caption txt-body-s-regular">{r === latest ? "Latest" : timeAgo(r.time)}</span>
                      <span class="reviewer-stack">
                        {#each r.reviews as v (v.id)}<Avatar person={v.author} size="1rem" />{/each}
                      </span>
                    </span>
                  </button>
                {/each}
              </div>
            {/snippet}
          </Popover>
        {:else}
          <span class="single-revision" title="This patch has one revision">
            <Icon name="revision" />Revision 1 <span class="sha">{shortId(revision.id)}</span>
          </span>
        {/if}
        {#if tab === "changes"}
          <DiffStyleSwitch />
          <Button
            variant="naked"
            title={allCollapsed ? "Expand all files" : "Collapse all files"}
            onclick={() => (allCollapsed = !allCollapsed)}>
            <Icon name={allCollapsed ? "expand-vertical" : "collapse-vertical"} />
          </Button>
        {/if}
      </div>
    </div>

    {#if tab === "changes"}
      <div class="changes">
        <DiffView
          {files}
          {marked}
          {allCollapsed}
          onAddComment={canComment ? commentOn : undefined}>
          {#snippet below(path, line)}
            <div class="inline-thread">
              {#each reviewComments.filter(c => c.location?.path === path && c.location?.line === line) as c (c.id)}
                <CommentView rid={repo.rid} comment={c} caption="reviewed">
                  {#snippet actions()}
                    {#if !c.resolved && (mine || delegate)}
                      <Button
                        variant="naked"
                        styleHeight="1.5rem"
                        onclick={() => node.do({ type: "resolveComment", rid: repo.rid, comment: c.id, resolved: true })}>
                        <Icon name="checkmark" />Resolve
                      </Button>
                    {/if}
                  {/snippet}
                </CommentView>
              {/each}
              {#each drafts.filter(d => d.path === path && d.line === line) as d, i (i)}
                <div class="draft">
                  <span class="draft-label">Pending · part of your review</span>
                  <Markdown content={d.body} compact />
                </div>
              {/each}
              {#if openDraft?.path === path && openDraft?.line === line}
                <Composer
                  compact
                  autofocus
                  submitLabel="Add to review"
                  placeholder={`Comment on line ${line}`}
                  onCancel={() => (openDraft = undefined)}
                  onSubmit={body => {
                    drafts = [...drafts, { path, line, body }];
                    openDraft = undefined;
                  }} />
              {/if}
            </div>
          {/snippet}
        </DiffView>

        {#if drafting}
          <div
            class="review-dock"
            in:fly={motion({ y: "100%", opacity: 1, duration: 280, easing: cubicOut })}
            out:fly={motion({ y: "100%", opacity: 1, duration: 200, easing: cubicIn })}>
          <div class="review-bar">
            <div class="row" style="justify-content: space-between;">
              <span class="txt-body-m-semibold">
                Review of revision {revisionNumber} · {plural(drafts.length, "comment")}
              </span>
              <span class="caption txt-body-s-regular">Hover a line and press + to comment on it</span>
            </div>
            <textarea class="textarea" style="min-height: 3.5rem;" bind:value={summary} placeholder="Summary (optional)"></textarea>
            <div class="row" style="justify-content: space-between; flex-wrap: wrap;">
              <SegmentedSwitch
                options={[
                  { value: "comment", label: "Comment", icon: "comment" },
                  { value: "accept", label: "Accept", icon: "comment-checkmark" },
                  { value: "reject", label: "Request changes", icon: "comment-cross" },
                ]}
                value={verdict}
                onchange={v => (verdict = v)} />
              <div class="row">
                <Button
                  variant="naked"
                  onclick={() => {
                    drafting = false;
                    drafts = [];
                    openDraft = undefined;
                  }}>
                  Discard
                </Button>
                <Button
                  variant="secondary"
                  disabled={verdict === "comment" && drafts.length === 0 && !summary.trim()}
                  onclick={submitReview}>
                  Publish review
                </Button>
              </div>
            </div>
          </div>
          </div>
        {/if}
      </div>
    {:else}
      {#if origin}
        <div class="origin">
          <Icon name="lightbulb" />
          <span class="origin-text">
            Opened by a Ryph agent for
            <a class="link" href={`${base}/issues/${origin.thread.id}`}>{origin.thread.title}</a>
            · asked by {node.person(origin.requestedBy).alias} · run {origin.id}
          </span>
        </div>
      {/if}
      <CommentView
        rid={repo.rid}
        reactable={false}
        caption="opened patch"
        comment={{
          id: patch.revisions[0].id,
          author: patch.author,
          body: patch.revisions[0].description,
          time: patch.time,
          reactions: [],
        }} />

      <Timeline>
        {#each timeline as item, i (i)}
          {#if item.kind === "run"}
            <RyphRunCard
              {repo}
              run={item.run.run}
              stepsDone={item.run.stepsDone}
              finished={item.run.finished}
              checks={item.run.checks} />
          {:else if item.kind === "revision"}
            <div id={`revision-${item.rev.id}`} class:selected-revision={item.rev === revision && revision !== latest}>
            <TimelineRow icon="revision" author={item.rev.author} time={item.time}>
              <span>created revision</span>
              <span class="rev-subject ellipsis">{subject(item.rev.description) || "No description"}</span>
              {#if item.rev === latest}<span class="latest-chip">Latest</span>{/if}
              {#snippet trailing()}
                <span class="sha">{shortId(item.rev.id)}</span>
                <button class="open-changes" title="Open revision changes" onclick={() => openRevision(item.index)}>
                  <Icon name="arrow-right" />
                </button>
              {/snippet}
            </TimelineRow>
            </div>
          {:else if item.kind === "review"}
            <ReviewItem
              {repo}
              review={item.review}
              revision={item.rev}
              revisionNumber={item.index + 1}
              revisionCount={patch.revisions.length}
              onOpenChanges={() => openRevision(item.index)} />
          {:else if item.kind === "thread"}
            <Thread
              rid={repo.rid}
              root={item.root}
              replies={item.replies}
              {badgeFor}
              onReply={(body, replyTo) =>
                node.do({ type: "patchComment", rid: repo.rid, patch: patch.id, body, replyTo })} />
          {:else if item.kind === "event"}
            <EventRow kind="patch" event={item.event} />
          {:else}
            <TimelineRow
              icon="patch-merged"
              iconColor="var(--color-text-merged)"
              author={patch.mergedBy}
              time={item.time}>
              <span>merged revision {patch.revisions.length} into</span>
              <b>{repo.defaultBranch}</b>
            </TimelineRow>
          {/if}
        {/each}
      </Timeline>

      {#if patch.state === "open"}
        <div class="gate">
          <div class="meter">
            {#each Array(repo.threshold) as _, i (i)}<span class:on={i < accepts.length}></span>{/each}
          </div>
          <span>
            {#if rejects.length > 0}
              <strong>Changes requested</strong> on revision {patch.revisions.length}.
            {:else if accepts.length >= repo.threshold}
              <strong>Ready to merge.</strong> {accepts.length} of {repo.delegates.length} delegates accepted.
            {:else}
              <strong>{accepts.length} of {repo.threshold}</strong> delegate approvals needed to merge.
            {/if}
          </span>
          <span style="margin-left: auto;" class="caption txt-body-s-regular" title={fullDate(latest.time)}>
            Latest revision {timeAgo(latest.time)}
          </span>
        </div>
      {/if}

      <Composer
        compact
        placeholder={node.canSummon(repo) ? "Leave a comment, or type /ryph mender address the review" : "Leave a comment"}
        onSubmit={body => node.do({ type: "patchComment", rid: repo.rid, patch: patch.id, body })} />
    {/if}
  </div>
{/if}
