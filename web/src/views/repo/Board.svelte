<script lang="ts">
  import type { Priority } from "@app/node/board";
  import type { BoardColumn, BoardPlacement, Issue, Patch, Repo } from "@app/node/model";

  import { tick } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";

  import { motion } from "@app/lib/motion";
  import { navigate } from "@app/lib/router.svelte";
  import { toast } from "@app/lib/toast.svelte";
  import { shortId, timeAgo } from "@app/lib/utils";
  import {
    canMoveCard,
    DEFAULT_COLUMNS,
    derivedPosition,
    displayLabels,
    labelsForPriority,
    patchesFor,
    PRIORITIES,
    priorityOf,
  } from "@app/node/board";
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import LabelChip from "@app/components/LabelChip.svelte";
  import PriorityIcon from "@app/components/PriorityIcon.svelte";
  import SideSheet from "@app/components/SideSheet.svelte";
  import IssueView from "./Issue.svelte";
  import PatchView from "./Patch.svelte";

  // A repository's issues and patches in columns, as desktop's boards have
  // them. The board only stores where cards sit; everything else comes from
  // the issues and patches themselves.
  interface Props {
    repo: Repo;
    // The card open in the side sheet.
    issue?: string;
    patch?: string;
  }

  const { repo, issue: openIssue, patch: openPatch }: Props = $props();

  type Item =
    | { key: string; kind: "issue"; cob: Issue; column: string; position: number; patches: Patch[]; pendingClose: boolean }
    | { key: string; kind: "patch"; cob: Patch; column: string; position: number };

  const base = $derived(node.repoPath(repo));
  const columns = $derived<BoardColumn[]>(repo.board?.columns ?? DEFAULT_COLUMNS);
  const delegate = $derived(node.isDelegate(repo));

  let query = $state("");

  function openColumn(cols: BoardColumn[]): string {
    return (cols.find(c => !c.closes) ?? cols[0]).id;
  }

  function closingColumn(cols: BoardColumn[], reason: "solved" | "closed", placed?: BoardPlacement): string {
    const at = cols.find(c => c.id === placed?.column);
    if (at?.closes === reason) return at.id;
    return cols.find(c => c.closes === reason)?.id ?? openColumn(cols);
  }

  // Where each card sits, in board order, mirroring desktop's rules: closed
  // issues and merged patches go to the closing columns, linked patches move
  // their issue along, and placements decide the rest.
  const groups = $derived.by(() => {
    const cols = columns;
    const placements = new Map((repo.board?.cards ?? []).map(c => [`${c.kind}:${c.id}`, c]));
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one call, never reactive
    const linked = new Set<string>();
    const items: Item[] = [];

    for (const issue of repo.issues) {
      const key = `issue:${issue.id}`;
      const placed = placements.get(key);
      const patches = patchesFor(issue, repo.patches);
      for (const p of patches) linked.add(p.id);
      let column: string;
      let pendingClose = false;
      if (issue.state !== "open") {
        column = closingColumn(cols, issue.state === "solved" ? "solved" : "closed", placed);
      } else if (patches.some(p => p.state === "merged")) {
        column = closingColumn(cols, "solved");
        pendingClose = true;
      } else if (placed && cols.some(c => c.id === placed.column)) {
        column = placed.column;
        pendingClose = !!cols.find(c => c.id === column)?.closes;
      } else if (patches.some(p => p.state === "open") && cols.some(c => c.id === "in-review")) {
        column = "in-review";
      } else if (patches.some(p => p.state === "draft") && cols.some(c => c.id === "in-progress")) {
        column = "in-progress";
      } else {
        column = openColumn(cols);
      }
      const position =
        placed?.column === column ? placed.position : derivedPosition(issue.labels, issue.time);
      items.push({ key, kind: "issue", cob: issue, column, position, patches, pendingClose });
    }

    for (const patch of repo.patches) {
      if (linked.has(patch.id)) continue;
      const key = `patch:${patch.id}`;
      const placed = placements.get(key);
      let column: string;
      if (patch.state === "merged") column = closingColumn(cols, "solved", placed);
      else if (patch.state === "archived") column = closingColumn(cols, "closed", placed);
      else {
        const at = cols.find(c => c.id === placed?.column);
        column = at && !at.closes ? at.id : openColumn(cols);
      }
      const position =
        placed?.column === column ? placed.position : derivedPosition(patch.labels, patch.time);
      items.push({ key, kind: "patch", cob: patch, column, position });
    }

    const out: Record<string, Item[]> = Object.fromEntries(cols.map(c => [c.id, []]));
    for (const item of items) out[item.column]?.push(item);
    for (const list of Object.values(out)) {
      list.sort((a, b) => a.position - b.position || (a.key < b.key ? -1 : 1));
    }
    return out;
  });

  function matches(item: Item): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.cob.title.toLowerCase().includes(q) ||
      item.cob.id.startsWith(q) ||
      item.cob.labels.some(l => l.toLowerCase().includes(q))
    );
  }

  function canMove(item: Item): boolean {
    return canMoveCard(repo, "self", item.cob);
  }

  // Only delegates and the author can open or close an issue. Anyone else who
  // drops it in a closing column leaves it waiting there.
  function canChangeState(issue: Issue): boolean {
    return delegate || issue.author === "self";
  }

  function accepts(item: Item, columnId: string): boolean {
    const column = columns.find(c => c.id === columnId);
    return !!column && (!column.closes || item.kind === "issue");
  }

  // Dragging

  const DRAG_THRESHOLD = 4;
  const LANDING_MS = 160;

  interface Grab {
    item: Item;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  }

  let boardEl: HTMLDivElement | undefined = $state();
  let pending: Grab | undefined;
  let drag = $state<(Grab & { over?: string; index?: number }) | undefined>(undefined);
  let pointer = $state({ x: 0, y: 0 });
  let landing = $state<{ x: number; y: number } | undefined>(undefined);
  let suppressClick = false;
  let shake = $state<string | undefined>(undefined);

  // The columns with the dragged card lifted out and, while it is over a
  // column that takes it, a gap where it would land.
  const display = $derived.by(() => {
    const out: Record<string, Item[]> = {};
    for (const [id, list] of Object.entries(groups)) {
      out[id] = list.filter(i => matches(i) && i.key !== drag?.item.key);
    }
    if (drag) {
      const target = drag.over ?? drag.item.column;
      const index = drag.over !== undefined ? (drag.index ?? 0) : (groups[target] ?? []).filter(matches).findIndex(i => i.key === drag!.item.key);
      const list = out[target] ?? [];
      list.splice(Math.max(0, Math.min(index, list.length)), 0, drag.item);
      out[target] = list;
    }
    return out;
  });

  function onPointerDown(e: PointerEvent, item: Item) {
    // On touch screens a swipe scrolls; long-press opens the menu instead.
    if (e.button !== 0 || landing || e.pointerType === "touch") return;
    if (!canMove(item)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pending = {
      item,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function columnAt(x: number): string | undefined {
    let nearest: { id: string; distance: number } | undefined;
    for (const el of boardEl?.querySelectorAll<HTMLElement>("[data-column]") ?? []) {
      const r = el.getBoundingClientRect();
      const distance = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (!nearest || distance < nearest.distance) nearest = { id: el.dataset.column!, distance };
    }
    return nearest?.id;
  }

  function indexAt(column: string, y: number, key: string): number {
    const el = boardEl?.querySelector(`[data-column="${column}"]`);
    let index = 0;
    for (const card of el?.querySelectorAll<HTMLElement>("[data-key]") ?? []) {
      if (card.dataset.key === key) continue;
      const r = card.getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(card).transform);
      if (r.top - m.m42 + r.height / 2 < y) index++;
    }
    return index;
  }

  function updateOver() {
    if (!drag) return;
    const column = columnAt(pointer.x);
    const over = column && accepts(drag.item, column) ? column : undefined;
    const index = over === undefined ? undefined : indexAt(over, pointer.y, drag.item.key);
    if (over !== drag.over || index !== drag.index) drag = { ...drag, over, index };
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (landing) return;
    pointer = { x: e.clientX, y: e.clientY };
    if (drag) {
      updateOver();
      autoScroll();
    } else if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > DRAG_THRESHOLD) {
      drag = { ...pending };
      pending = undefined;
      updateOver();
    }
  }

  // Near an edge while dragging, the board scrolls sideways and the column
  // under the pointer scrolls up or down.
  function autoScroll() {
    if (!boardEl) return;
    const r = boardEl.getBoundingClientRect();
    if (pointer.x > r.right - 60) boardEl.scrollLeft += 12;
    else if (pointer.x < r.left + 60) boardEl.scrollLeft -= 12;
    const cards = drag?.over
      ? boardEl.querySelector<HTMLElement>(`[data-column="${drag.over}"] .cards`)
      : undefined;
    if (!cards) return;
    const c = cards.getBoundingClientRect();
    if (pointer.y > c.bottom - 48) cards.scrollTop += 10;
    else if (pointer.y < c.top + 48) cards.scrollTop -= 10;
  }

  // The board takes the window's height below where it starts, down to the
  // bottom edge.
  let boardHeight = $state<number | undefined>(undefined);
  $effect(() => {
    const el = boardEl;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + scrollY;
      boardHeight = Math.max(320, innerHeight - top);
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  });

  async function land(cancel: boolean) {
    if (!drag || landing) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false));
    if (cancel) {
      drag = { ...drag, over: undefined, index: undefined };
      await tick();
    }
    const slot = boardEl?.querySelector<HTMLElement>(".placeholder");
    if (slot) {
      const r = slot.getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(slot).transform);
      landing = { x: r.left - m.m41, y: r.top - m.m42 };
      await new Promise(resolve => setTimeout(resolve, LANDING_MS));
    }
    const { item, over, index } = drag;
    drag = undefined;
    landing = undefined;
    if (!cancel && over !== undefined && index !== undefined) moveItem(item, over, index);
  }

  function onWindowPointerUp() {
    pending = undefined;
    void land(false);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && drag) {
      e.preventDefault();
      void land(true);
    }
  }

  // A card someone can't move gives a small shake instead of lifting.
  function onCardClick(item: Item) {
    if (suppressClick) return;
    open(item);
  }

  function nudge(item: Item) {
    shake = item.key;
    setTimeout(() => (shake = undefined), 400);
  }

  // Moving

  function moveItem(item: Item, columnId: string, index: number) {
    const column = columns.find(c => c.id === columnId);
    if (!column) return;
    const without = (groups[columnId] ?? []).filter(i => i.key !== item.key);
    // Search hides cards, so the drop lands relative to the visible ones.
    const visible = without.filter(matches);
    const before = visible[index - 1];
    const after = visible[index];
    if (item.column === columnId && (groups[columnId] ?? []).filter(matches).indexOf(item) === index) return;
    const position =
      before && after
        ? (before.position + after.position) / 2
        : before
          ? before.position + 1e6
          : after
            ? after.position - 1e6
            : derivedPosition(item.cob.labels, item.cob.time);
    node.do({ type: "moveCard", rid: repo.rid, kind: item.kind, id: item.cob.id, column: columnId, position });

    if (item.kind === "issue" && canChangeState(item.cob)) {
      const next = column.closes ?? "open";
      if (item.cob.state !== next) {
        node.do({ type: "issueState", rid: repo.rid, issue: item.cob.id, state: next });
        if (next === "open") toast(`Reopened “${item.cob.title}”`, { icon: "issue" });
        else toast(`Closed “${item.cob.title}”`, { icon: "issue-closed" });
      }
    } else if (item.kind === "issue" && column.closes && item.cob.state === "open") {
      toast("Moved. It closes once a maintainer or its author opens the board.", { icon: "clock" });
    }
  }

  function setPriority(item: Item, priority: Priority) {
    node.do({
      type: "editCob",
      rid: repo.rid,
      kind: item.kind,
      id: item.cob.id,
      labels: labelsForPriority(item.cob.labels, priority),
    });
  }

  // Issues closed by someone without the right to close them (a merged
  // patch, or a move by an assignee) are closed by the next maintainer or
  // author who opens the board.
  $effect(() => {
    for (const list of Object.values(groups)) {
      for (const item of list) {
        if (item.kind !== "issue" || !item.pendingClose || !canChangeState(item.cob)) continue;
        const column = columns.find(c => c.id === item.column);
        if (column?.closes) node.do({ type: "issueState", rid: repo.rid, issue: item.cob.id, state: column.closes });
      }
    }
  });

  // Opening

  function href(next: { issue?: string; patch?: string } = {}) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one call, never reactive
    const q = new URLSearchParams();
    if (next.issue) q.set("issue", next.issue);
    if (next.patch) q.set("patch", next.patch);
    const s = q.toString();
    return `${base}/board${s ? `?${s}` : ""}`;
  }

  function open(item: Item) {
    navigate(href(item.kind === "issue" ? { issue: item.cob.id } : { patch: item.cob.id }), { scroll: false });
  }

  const openKey = $derived(openIssue ? `issue:${openIssue}` : openPatch ? `patch:${openPatch}` : undefined);

  // Right-click menu

  let menu = $state<{ item: Item; x: number; y: number } | undefined>(undefined);
  let menuEl: HTMLDivElement | undefined = $state();

  function openMenu(e: MouseEvent, item: Item) {
    e.preventDefault();
    menu = { item, x: Math.min(e.clientX, innerWidth - 230), y: Math.min(e.clientY, innerHeight - 380) };
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (menu && !(e.target instanceof Node && menuEl?.contains(e.target))) menu = undefined;
  }

  const lockedReason = "Only maintainers, the author and assignees can move this card";
</script>

<svelte:window
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp}
  onpointercancel={() => {
    pending = undefined;
    if (!landing) drag = undefined;
  }}
  onpointerdowncapture={onWindowPointerDown}
  onkeydown={onWindowKeydown} />

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .search {
    position: relative;
    width: 16rem;
    max-width: 100%;
  }
  .search .input {
    width: 100%;
    padding-left: 2rem;
  }
  .search-icon {
    position: absolute;
    left: 0.625rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    color: var(--color-text-tertiary);
    pointer-events: none;
  }
  .note {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  /* The board runs to the window's edges, so columns scroll under them
     rather than being cut at the page margin. Its padding puts the first
     column back in line with the page. */
  .board {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 17rem;
    gap: 0.5rem;
    overflow-x: auto;
    margin-inline: calc(50% - 50vw);
    padding: 0 calc(50vw - 50%);
    scroll-padding-inline: calc(50vw - 50%);
    align-items: start;
    grid-template-rows: minmax(0, 100%);
    /* It fills the window below its top and runs off the bottom edge like it
       does the sides, so the page itself doesn't scroll. The negative margin
       takes back the page's bottom padding. */
    height: var(--board-height, 70vh);
    margin-bottom: -6rem;
  }
  .column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-height: 100%;
    border-radius: var(--border-radius-md);
    background: var(--color-surface-subtle);
  }
  .column-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.75rem 0.75rem 0.5rem;
    font: var(--txt-body-m-semibold);
    color: var(--color-text-primary);
  }
  .count {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }
  .closes {
    margin-left: auto;
    display: flex;
    color: var(--color-text-tertiary);
  }
  /* Only the cards scroll, so each column keeps its title in view. */
  .cards {
    flex: 1;
    min-height: 3rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0 0.375rem 0.375rem;
  }
  .card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      opacity 0.2s ease;
  }
  .card:hover {
    border-color: var(--color-border-mid);
    box-shadow: var(--elevation-low);
  }
  .card:focus-visible {
    outline: none;
    border-color: var(--color-border-brand);
  }
  .card.open {
    border-color: var(--color-border-brand);
  }
  .card.placeholder {
    border-style: dashed;
    border-color: var(--color-border-mid);
    background: transparent;
    box-shadow: none;
  }
  .card.placeholder > * {
    visibility: hidden;
  }
  .card.shake {
    animation: shake 0.35s ease;
  }
  @keyframes shake {
    20%,
    60% {
      transform: translateX(-3px);
    }
    40%,
    80% {
      transform: translateX(3px);
    }
  }
  .card-top {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .card-top .id {
    font-family: var(--font-family-code);
  }
  .card-top .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .lock {
    display: flex;
    color: var(--color-text-quaternary, var(--color-text-tertiary));
  }
  .title {
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
    overflow-wrap: anywhere;
  }
  .card.fixed .title {
    color: var(--color-text-secondary);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  .meta:empty {
    display: none;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .patch-link {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-s-regular);
    font-family: var(--font-family-code);
    color: var(--color-text-secondary);
  }
  .patch-link:hover {
    color: var(--color-text-brand);
  }
  .pending {
    font: var(--txt-body-s-regular);
    color: var(--color-feedback-warning-text);
  }
  .empty {
    padding: 0.75rem 0.5rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    text-align: center;
  }
  .ghost {
    position: fixed;
    z-index: 100;
    pointer-events: none;
    box-shadow: var(--elevation-low), 0 12px 32px rgba(0, 0, 0, 0.18);
    transform: rotate(1.5deg);
  }
  .ghost.landing {
    transform: none;
    box-shadow: none;
    transition:
      left 160ms cubic-bezier(0.2, 0, 0, 1),
      top 160ms cubic-bezier(0.2, 0, 0, 1),
      transform 160ms ease,
      box-shadow 160ms ease;
  }
  .context {
    position: fixed;
    z-index: 200;
    min-width: 13rem;
    padding: 0.25rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
  }
  .context-heading {
    padding: 0.375rem 0.5rem 0.25rem;
    font: var(--txt-body-s-semibold);
    color: var(--color-text-tertiary);
  }
  .context button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .context button:hover {
    background: var(--color-surface-subtle);
  }
  .context .check {
    margin-left: auto;
    display: flex;
    color: var(--color-text-brand);
  }
  .context-separator {
    height: 1px;
    margin: 0.25rem 0;
    background: var(--color-border-subtle);
  }
</style>

{#snippet cardContent(item: Item)}
  {@const priority = priorityOf(item.cob.labels)}
  <div class="card-top">
    <Icon name={item.kind === "issue" ? "issue" : item.cob.state === "draft" ? "patch-draft" : "patch"} />
    <span class="id">{shortId(item.cob.id)}</span>
    <span>·</span>
    <span>{timeAgo(item.cob.time)}</span>
    <span class="right">
      {#if item.kind === "issue"}
        {#each item.cob.assignees as a (a)}<Avatar person={a} size="1rem" />{/each}
      {:else}
        <Avatar person={item.cob.author} size="1rem" />
      {/if}
      {#if !canMove(item)}<span class="lock"><Icon name="lock" /></span>{/if}
    </span>
  </div>
  <div class="title">{item.cob.title}</div>
  <div class="meta">
    {#if priority !== "none"}
      <span class="tag" title={`${PRIORITIES.find(p => p.id === priority)?.label} priority`}>
        <PriorityIcon {priority} />
      </span>
    {/if}
    {#if item.kind === "issue"}
      {#each item.patches as p (p.id)}
        <button
          class="patch-link"
          title={p.title}
          onpointerdown={e => e.stopPropagation()}
          onclick={e => {
            e.stopPropagation();
            navigate(href({ patch: p.id }), { scroll: false });
          }}>
          <Icon name={p.state === "merged" ? "patch-merged" : "patch"} />{shortId(p.id)}
        </button>
      {/each}
      {#if item.pendingClose}
        <span class="pending" title="Closes when a maintainer or its author opens the board">Waiting to close</span>
      {/if}
    {/if}
    {#each displayLabels(item.cob.labels) as label (label)}<LabelChip {label} />{/each}
    {#if item.kind === "issue" && item.cob.comments.length > 0}
      <span class="tag"><Icon name="comment" />{item.cob.comments.length}</span>
    {/if}
  </div>
{/snippet}

<div class="toolbar">
  <div class="search">
    <span class="search-icon"><Icon name="search" /></span>
    <input class="input" bind:value={query} placeholder="Filter cards" aria-label="Filter cards" />
  </div>
  <span class="note">
    {#if delegate}Drag cards between columns. Done and Canceled close issues.
    {:else}You can move cards you opened or are assigned to.{/if}
  </span>
  <span style="margin-left: auto;">
    <Button variant="secondary" onclick={() => navigate(`${base}/issues/new`)}>
      <Icon name="plus" />New issue
    </Button>
  </span>
</div>

<div class="board" bind:this={boardEl} style:--board-height={boardHeight ? `${boardHeight}px` : undefined}>
  {#each columns as column (column.id)}
    <section class="column" data-column={column.id}>
      <div class="column-header">
        <span>{column.name}</span>
        <span class="count">{(groups[column.id] ?? []).filter(matches).length}</span>
        {#if column.closes}
          <span class="closes" title={column.closes === "solved" ? "Closes issues as solved" : "Closes issues as not planned"}>
            <Icon name="issue-closed" />
          </span>
        {/if}
      </div>
      <div class="cards">
        {#each display[column.id] ?? [] as item (item.key)}
          <div
            class="card"
            class:placeholder={drag?.item.key === item.key}
            class:fixed={!canMove(item)}
            class:open={openKey === item.key}
            class:shake={shake === item.key}
            title={canMove(item) ? undefined : lockedReason}
            style:height={drag?.item.key === item.key ? `${drag.height}px` : undefined}
            data-key={item.key}
            data-peek
            role="button"
            tabindex="0"
            animate:flip={motion({ duration: 200, easing: cubicOut })}
            onpointerdown={e => (canMove(item) ? onPointerDown(e, item) : undefined)}
            onpointermove={e => {
              if (!canMove(item) && e.buttons === 1 && shake !== item.key) nudge(item);
            }}
            onclick={() => onCardClick(item)}
            oncontextmenu={e => openMenu(e, item)}
            onkeydown={e => {
              if (e.key === "Enter") open(item);
            }}>
            {@render cardContent(item)}
          </div>
        {:else}
          <div class="empty">{query ? "No matching cards" : "Nothing here"}</div>
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if drag}
  <div
    class="ghost card"
    class:landing={!!landing}
    style:left="{landing ? landing.x : pointer.x - drag.offsetX}px"
    style:top="{landing ? landing.y : pointer.y - drag.offsetY}px"
    style:width="{drag.width}px">
    {@render cardContent(drag.item)}
  </div>
{/if}

{#if menu}
  {@const item = menu.item}
  {@const current = priorityOf(item.cob.labels)}
  <div class="context" role="menu" bind:this={menuEl} style:left="{menu.x}px" style:top="{menu.y}px">
    <button
      role="menuitem"
      onclick={() => {
        open(item);
        menu = undefined;
      }}>
      <Icon name="arrow-right" />Open
    </button>
    {#if canMove(item)}
      <div class="context-separator"></div>
      <div class="context-heading">Move to</div>
      {#each columns.filter(c => accepts(item, c.id)) as column (column.id)}
        <button
          role="menuitem"
          onclick={() => {
            moveItem(item, column.id, (groups[column.id] ?? []).filter(i => i.key !== item.key && matches(i)).length);
            menu = undefined;
          }}>
          {column.name}
          {#if item.column === column.id}<span class="check"><Icon name="checkmark" /></span>{/if}
        </button>
      {/each}
    {/if}
    {#if delegate}
      <div class="context-separator"></div>
      <div class="context-heading">Priority</div>
      {#each PRIORITIES as p (p.id)}
        <button
          role="menuitem"
          onclick={() => {
            setPriority(item, p.id);
            menu = undefined;
          }}>
          <PriorityIcon priority={p.id} />{p.label}
          {#if current === p.id}<span class="check"><Icon name="checkmark" /></span>{/if}
        </button>
      {/each}
    {/if}
  </div>
{/if}

{#if openIssue}
  <SideSheet expandHref={`${base}/issues/${openIssue}`} onClose={() => navigate(href(), { scroll: false })}>
    <IssueView {repo} id={openIssue} />
  </SideSheet>
{:else if openPatch}
  <SideSheet expandHref={`${base}/patches/${openPatch}`} onClose={() => navigate(href(), { scroll: false })}>
    <PatchView {repo} id={openPatch} view="activity" />
  </SideSheet>
{/if}
