<script lang="ts">
  import type { Board } from "@bindings/cob/board/Board";
  import type { Card } from "@bindings/cob/board/Card";
  import type { Column } from "@bindings/cob/board/Column";
  import type { PatchLink } from "@bindings/cob/board/PatchLink";
  import type { Action as IssueAction } from "@bindings/cob/issue/Action";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { State } from "@bindings/cob/issue/State";
  import type { Operation } from "@bindings/cob/Operation";
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { tick, untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";

  import type {
    BoardItem,
    BoardView,
    ForeignCard,
    Priority,
  } from "@app/lib/board";
  import {
    cardKey,
    DEFAULT_COLUMNS,
    displayLabels,
    groupItems,
    isMe,
    ISSUE_TYPE,
    itemLabels,
    itemTimestamp,
    itemTitle,
    labelsForPriority,
    neighbourPositions,
    PRIORITIES,
    priorityOf,
  } from "@app/lib/board";
  import { promptNewBoard } from "@app/lib/boardActions";
  import type { BoardViewSettings } from "@app/lib/boardView";
  import { activeFilterCount, loadView, saveView } from "@app/lib/boardView";
  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import * as roles from "@app/lib/roles";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
  } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import BoardDisplayMenu from "@app/components/BoardDisplayMenu.svelte";
  import BoardFilterMenu from "@app/components/BoardFilterMenu.svelte";
  import Button from "@app/components/Button.svelte";
  import ContextMenu from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueSheet, {
    type IssueSheetData,
    loadIssueSheet,
  } from "@app/components/IssueSheet.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Popover from "@app/components/Popover.svelte";
  import PriorityIcon from "@app/components/PriorityIcon.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import AddBoardCard from "@app/modals/AddBoardCard.svelte";
  import BoardColumns from "@app/modals/BoardColumns.svelte";
  import BoardName from "@app/modals/BoardName.svelte";
  import CreateIssueModal from "@app/modals/CreateIssue.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    config: Config;
    boards: Board[];
    issues: Issue[];
    patches: Patch[];
    links: PatchLink[];
    view: BoardView;
    selected?: string;
    sidebarData: SidebarData;
  }

  const {
    repo,
    config,
    boards: initialBoards,
    issues: initialIssues,
    patches,
    links,
    view,
    selected,
    sidebarData,
  }: Props = $props();

  let boards: Board[] = $derived(initialBoards);
  let issues: Issue[] = $derived(initialIssues);
  const board = $derived(boards.find(b => b.id === selected) ?? boards[0]);

  // Issues and patches from other repositories, looked up per card. A card
  // whose repository isn't on this device stays unresolved.
  let foreign: Map<string, ForeignCard> = $state(new Map());

  async function resolve(card: Card): Promise<ForeignCard> {
    try {
      if (card.typeName === ISSUE_TYPE) {
        const issue = await invoke<Issue | null>("issue_by_id", {
          rid: card.rid,
          id: card.oid,
        });
        return issue ? { kind: "issue", issue } : { kind: "unresolved" };
      }
      const patch = await invoke<Patch | null>("patch_by_id", {
        rid: card.rid,
        id: card.oid,
      });
      return patch ? { kind: "patch", patch } : { kind: "unresolved" };
    } catch {
      return { kind: "unresolved" };
    }
  }

  $effect(() => {
    const cards = (board?.cards ?? [])
      .map(p => p.card)
      .filter(c => c.rid !== repo.rid);
    void Promise.all(
      cards.map(async c => [cardKey(c), await resolve(c)] as const),
    ).then(entries => {
      foreign = new Map(entries);
    });
  });

  function isForeign(item: BoardItem): boolean {
    return item.card.rid !== repo.rid;
  }

  function repoName(rid: string): string {
    return (
      sidebarData.repos.find(r => r.rid === rid)?.name ?? `${rid.slice(0, 12)}…`
    );
  }

  // Each board opens in the view it was last left in.
  function goToBoard(id: string | undefined) {
    void router.push({
      resource: "repo.board",
      rid: repo.rid,
      board: id,
    });
  }
  // Columns being reordered by dragging a title, and columns saved but not
  // yet echoed back by the board.
  let columnPreview: Column[] | undefined = $state();
  let pendingColumns: Column[] | undefined = $state();
  const columns: Column[] = $derived(
    columnPreview ?? pendingColumns ?? board?.columns ?? DEFAULT_COLUMNS,
  );

  let filter = $state("");
  const collapsed: Record<string, boolean> = $state({});

  // Settings belong to the board on show, so switching boards loads that
  // board's, and the view in the route is remembered with them.
  // svelte-ignore state_referenced_locally
  let settingsBoard = board?.id;
  // svelte-ignore state_referenced_locally
  let settings: BoardViewSettings = $state(loadView(repo.rid, board?.id));
  $effect.pre(() => {
    const id = board?.id;
    if (id !== settingsBoard) {
      settingsBoard = id;
      settings = loadView(repo.rid, id);
    }
  });
  $effect(() => {
    saveView(repo.rid, board?.id, { ...$state.snapshot(settings), view });
  });

  // Cards a filter or search hides fade out. Every other removal, such as a
  // card leaving its column on a drop, is instant.
  let filtering = false;
  let filteringTimeout: ReturnType<typeof setTimeout> | undefined;
  // Before the DOM updates, so the flag is up when the hidden cards leave.
  $effect.pre(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    JSON.stringify(settings.filters) + filter;
    filtering = true;
    clearTimeout(filteringTimeout);
    filteringTimeout = setTimeout(() => (filtering = false), 300);
  });

  // A drop target fades as it leaves a column. Svelte pins a leaving card
  // where it stood, with a transform, so the shrink uses the separate scale
  // property to leave that transform alone.
  function filterOut(node: Element) {
    if (node.classList.contains("placeholder")) {
      return { duration: 150, css: (t: number) => `opacity: ${t};` };
    }
    if (!filtering) return { duration: 0 };
    return {
      duration: 180,
      easing: cubicOut,
      css: (t: number) => `opacity: ${t}; scale: ${0.96 + 0.04 * t};`,
    };
  }

  const me = $derived(`did:key:${config.publicKey}`);
  const manual = $derived(settings.ordering === "manual");

  function setView(next: BoardView) {
    void router.push({
      resource: "repo.board",
      rid: repo.rid,
      view: next,
      board: selected,
    });
  }

  function shows(property: BoardViewSettings["properties"][number]): boolean {
    return settings.properties.includes(property);
  }

  const isDelegate = $derived(
    !!roles.isDelegate(
      config.publicKey,
      repo.delegates.map(d => d.did),
    ),
  );

  const opts = $derived({ announce: $nodeRunning && $announce });

  function canMove(item: BoardItem): boolean {
    if (isDelegate) return true;
    if (!board || isForeign(item) || item.kind === "unresolved") return false;
    if (item.kind === "patch") {
      return isMe(item.patch.author.did, config.publicKey);
    }
    return (
      isMe(item.issue.author.did, config.publicKey) ||
      item.issue.assignees.some(a => isMe(a.did, config.publicKey))
    );
  }

  const lockedReason = $derived(
    board
      ? "Only delegates, the author and assignees can move this card"
      : "Only delegates can start this board",
  );

  function canChangeState(issue: Issue): boolean {
    return isDelegate || isMe(issue.author.did, config.publicKey);
  }

  function accepts(item: BoardItem, columnId: string): boolean {
    const column = columns.find(c => c.id === columnId);
    return (
      Boolean(column) &&
      (!column?.closes || item.kind === "issue" || item.kind === "unresolved")
    );
  }

  function assigneesOf(item: BoardItem) {
    return item.kind === "issue"
      ? item.issue.assignees
      : item.kind === "patch"
        ? item.patch.assignees
        : [];
  }

  function matches(item: BoardItem): boolean {
    const assignees = assigneesOf(item);
    const { types, assignees: people, priorities, labels } = settings.filters;
    if (
      types.length > 0 &&
      (item.kind === "unresolved" || !types.includes(item.kind))
    ) {
      return false;
    }
    if (
      people.length > 0 &&
      !(
        (people.includes("none") && assignees.length === 0) ||
        assignees.some(a => people.includes(a.did))
      )
    ) {
      return false;
    }
    if (
      priorities.length > 0 &&
      !priorities.includes(priorityOf(itemLabels(item)))
    ) {
      return false;
    }
    if (
      labels.length > 0 &&
      !displayLabels(itemLabels(item)).some(l => labels.includes(l))
    ) {
      return false;
    }
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    return (
      itemTitle(item).toLowerCase().includes(query) ||
      item.card.oid.startsWith(query) ||
      itemLabels(item).some(l => l.toLowerCase().includes(query)) ||
      assignees.some(a => a.alias?.toLowerCase().includes(query))
    );
  }

  const grouped = $derived.by(() => {
    const groups = groupItems(repo.rid, board, issues, patches, links, foreign);
    return Object.fromEntries(
      Object.entries(groups).map(([id, list]) => [id, list.filter(matches)]),
    );
  });

  const RANK: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
    none: 4,
  };

  function compare(a: BoardItem, b: BoardItem): number {
    let order = 0;
    if (settings.ordering === "priority") {
      order =
        RANK[priorityOf(itemLabels(a))] - RANK[priorityOf(itemLabels(b))] ||
        itemTimestamp(b) - itemTimestamp(a);
    } else if (settings.ordering === "created") {
      order = itemTimestamp(b) - itemTimestamp(a);
    } else if (settings.ordering === "title") {
      order = itemTitle(a).localeCompare(itemTitle(b));
    }
    return settings.descending ? -order : order;
  }

  // Board order, or the chosen ordering on top of it.
  function arrange(
    groups: Record<string, BoardItem[]>,
  ): Record<string, BoardItem[]> {
    if (manual) return groups;
    return Object.fromEntries(
      Object.entries(groups).map(([id, list]) => [id, [...list].sort(compare)]),
    );
  }

  // Everyone assigned to anything here, filtered or not, so the filter menu
  // doesn't change shape as filters are picked.
  const people = $derived.by(() => {
    const seen: Record<string, string> = {};
    for (const a of [...issues, ...patches].flatMap(i => i.assignees)) {
      seen[a.did] = a.alias ?? `${a.did.slice(8, 16)}…`;
    }
    return Object.entries(seen).map(([did, name]) => ({ did, name }));
  });

  const allLabels = $derived(
    [
      ...new Set(
        [...issues.map(i => i.labels), ...patches.map(p => p.labels)].flatMap(
          displayLabels,
        ),
      ),
    ].sort(),
  );

  const itemCount = $derived(
    Object.values(grouped).reduce((n, list) => n + list.length, 0),
  );

  interface Move {
    item: BoardItem;
    column: string;
    index: number;
  }

  function applyMove(
    groups: Record<string, BoardItem[]>,
    move: Move | undefined,
  ): Record<string, BoardItem[]> {
    if (!move) return groups;
    const result = Object.fromEntries(
      Object.entries(groups).map(([id, list]) => [
        id,
        list.filter(i => i.key !== move.item.key),
      ]),
    );
    const target = [...(result[move.column] ?? [])];
    target.splice(Math.min(move.index, target.length), 0, move.item);
    result[move.column] = target;
    return result;
  }

  // A move that has been dropped but whose board update hasn't come back yet.
  let optimistic: Move | undefined = $state();

  const settled = $derived(arrange(applyMove(grouped, optimistic)));

  async function reload() {
    try {
      const [nextBoards, nextIssues] = await Promise.all([
        invoke<Board[]>("list_boards", { rid: repo.rid }),
        invoke<PaginatedQuery<Issue[]>>("list_issues", {
          rid: repo.rid,
          status: "all",
        }),
      ]);
      boards = nextBoards;
      issues = nextIssues.content;
    } catch (error) {
      console.error("Reloading the board failed", error);
    }
  }

  async function setLifecycle(issue: Issue, state: State) {
    await invoke("edit_issue", {
      rid: repo.rid,
      cobId: issue.id,
      action: { type: "lifecycle", state },
      opts,
    });
  }

  function stateFor(column: Column): State {
    return column.closes
      ? { status: "closed", reason: column.closes }
      : { status: "open" };
  }

  async function ensureBoard(): Promise<Board> {
    if (board) return board;
    const created = await invoke<Board>("create_board", {
      rid: repo.rid,
      name: "Board",
      opts,
    });
    boards = [...boards, created];
    return created;
  }

  async function moveItem(item: BoardItem, columnId: string, index: number) {
    const column = columns.find(c => c.id === columnId);
    if (!column) return;
    // With another ordering on, a drop can't pick a spot, so the card goes to
    // the end of the column's board order.
    const source = manual ? settled : grouped;
    const without = (source[columnId] ?? []).filter(i => i.key !== item.key);
    const { before, after } = neighbourPositions(
      without,
      manual ? index : without.length,
    );

    optimistic = { item, column: columnId, index };
    try {
      const target = await ensureBoard();
      const updated = await invoke<Board>("move_card", {
        rid: repo.rid,
        board: target.id,
        card: item.card,
        column: columnId,
        before,
        after,
        opts,
      });
      boards = boards.map(b => (b.id === updated.id ? updated : b));

      if (
        item.kind === "issue" &&
        !isForeign(item) &&
        canChangeState(item.issue)
      ) {
        const next = stateFor(column);
        const current = item.issue.state;
        if (
          current.status !== next.status ||
          (current.status === "closed" &&
            next.status === "closed" &&
            current.reason !== next.reason)
        ) {
          await setLifecycle(item.issue, next);
          await reload();
        }
      }
    } catch (error) {
      console.error("Moving the card failed", error);
      await reload();
    } finally {
      optimistic = undefined;
    }
  }

  function moveToColumn(item: BoardItem, columnId: string) {
    void moveItem(item, columnId, settled[columnId]?.length ?? 0);
  }

  async function setPriority(item: BoardItem, priority: Priority) {
    if (item.kind !== "issue" || isForeign(item)) return;
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: item.issue.id,
        action: {
          type: "label",
          labels: labelsForPriority(item.issue.labels, priority),
        },
        opts,
      });
    } catch (error) {
      console.error("Setting the priority failed", error);
    } finally {
      await reload();
    }
  }

  // Closes issues that are waiting to be: ones with a merged patch, and ones
  // that someone without the right to close them moved to a closing column.
  // A move made before the issue was last reopened or closed is stale, so
  // that card goes back to the first open column instead.
  async function reconcile() {
    const waiting = Object.values(grouped)
      .flat()
      .filter(
        (i): i is Extract<BoardItem, { kind: "issue" }> =>
          i.kind === "issue" &&
          i.pendingClose &&
          !isForeign(i) &&
          canChangeState(i.issue),
      );
    if (waiting.length === 0) return;

    let changed = false;
    for (const item of waiting) {
      try {
        if (item.patches.some(p => p.state.status === "merged")) {
          await setLifecycle(item.issue, {
            status: "closed",
            reason: "solved",
          });
          changed = true;
          continue;
        }
        const placement = item.placement;
        const column = columns.find(c => c.id === placement?.column);
        if (!placement || !column?.closes) continue;

        const activity = await invoke<Operation<IssueAction>[]>(
          "activity_by_issue",
          { rid: repo.rid, id: item.issue.id },
        );
        const lastLifecycle = Math.max(
          0,
          ...activity
            .filter(op => op.actions.some(a => a.type === "lifecycle"))
            .map(op => op.timestamp),
        );
        if (placement.movedAt > lastLifecycle) {
          await setLifecycle(item.issue, stateFor(column));
          changed = true;
        } else if (board && canMove(item)) {
          const open = columns.find(c => !c.closes);
          if (!open) continue;
          const list = grouped[open.id] ?? [];
          const { before } = neighbourPositions(list, list.length);
          const updated = await invoke<Board>("move_card", {
            rid: repo.rid,
            board: board.id,
            card: item.card,
            column: open.id,
            before,
            after: undefined,
            opts,
          });
          boards = boards.map(b => (b.id === updated.id ? updated : b));
        }
      } catch (error) {
        console.error("Settling a card failed", error);
      }
    }
    if (changed) await reload();
  }

  let reconciling = false;

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    initialIssues;
    untrack(() => {
      if (reconciling) return;
      reconciling = true;
      void reconcile().finally(() => (reconciling = false));
    });
  });

  let sheet: { key: string; data: IssueSheetData } | undefined = $state();
  let sheetRequest = 0;

  async function openSheet(item: Extract<BoardItem, { kind: "issue" }>) {
    const request = ++sheetRequest;
    if (sheet?.key === item.key) {
      sheet = undefined;
      return;
    }
    try {
      const data = await loadIssueSheet(repo, item.card.rid, item.issue.id);
      if (request !== sheetRequest) return;
      sheet = { key: item.key, data };
      await tick();
      revealBesideSheet(item.key);
    } catch (error) {
      console.error("Loading the issue failed", error);
    }
  }

  // The sheet covers the right of the board, so the board gets room to
  // scroll past its last column, and the open card is brought into the part
  // the sheet leaves free.
  let sheetSpacer: HTMLElement | undefined = $state();

  function revealBesideSheet(key: string) {
    if (view !== "board" || !boardEl || !sheetSpacer) return;
    const card = boardEl.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!card) return;
    const column = card.closest(".column") ?? card;
    const { left, right } = column.getBoundingClientRect();
    const board = boardEl.getBoundingClientRect();
    const freeRight = window.innerWidth - sheetSpacer.offsetWidth;
    const delta =
      right > freeRight
        ? right - freeRight
        : left < board.left
          ? left - board.left
          : 0;
    if (delta !== 0) boardEl.scrollBy({ left: delta, behavior: "smooth" });
  }

  // The card that opened the sheet keeps focus, and closing with Escape
  // would otherwise show its focus ring.
  function closeSheet() {
    sheetRequest++;
    sheet = undefined;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest("[data-key]")) {
      focused.blur();
    }
  }

  // Clicks on cards swap the sheet, and clicks in popovers, menus and modals
  // belong to whatever the sheet opened, so neither closes it.
  function onWindowPointerDown(event: PointerEvent) {
    if (!sheet || !(event.target instanceof Element)) return;
    if (document.querySelector("[data-modal-content]")) return;
    if (
      event.target.closest(
        '.sheet, [data-key], [data-portal], .popover, [role="menu"], [data-modal-content]',
      )
    ) {
      return;
    }
    closeSheet();
  }

  function open(item: BoardItem) {
    if (item.kind === "issue") {
      void openSheet(item);
    } else if (item.kind === "patch") {
      openPatch(item.patch, item.card.rid);
    } else {
      void seedCard(item);
    }
  }

  let seeding: string[] = $state([]);

  // Seeds the repository of a card we can't resolve, then keeps looking the
  // card up until the fetch brings it in.
  async function seedCard(item: BoardItem) {
    const rid = item.card.rid;
    if (seeding.includes(rid)) return;
    seeding = [...seeding, rid];
    try {
      await invoke<null>("seed", { rid, opts });
      for (let attempt = 0; attempt < 20; attempt++) {
        const resolved = await resolve(item.card);
        if (resolved.kind !== "unresolved") {
          foreign = new Map([...foreign, [item.key, resolved]]);
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (error) {
      console.error("Seeding the card's repository failed", error);
    } finally {
      seeding = seeding.filter(r => r !== rid);
    }
  }

  function openPatch(patch: Patch, rid: string = repo.rid) {
    void router.push({
      resource: "repo.patch",
      rid,
      patch: patch.id,
      status: undefined,
      reviewId: undefined,
    });
  }

  function replaceBoard(updated: Board) {
    boards = boards.map(b => (b.id === updated.id ? updated : b));
  }

  async function addCard(card: Card) {
    const target = await ensureBoard();
    const first = columns.find(c => !c.closes) ?? columns[0];
    const list = settled[first.id] ?? [];
    const { before } = neighbourPositions(list, list.length);
    replaceBoard(
      await invoke<Board>("move_card", {
        rid: repo.rid,
        board: target.id,
        card,
        column: first.id,
        before,
        after: undefined,
        opts,
      }),
    );
  }

  async function removeCard(item: BoardItem) {
    if (!board) return;
    try {
      replaceBoard(
        await invoke<Board>("remove_card", {
          rid: repo.rid,
          board: board.id,
          card: item.card,
          opts,
        }),
      );
    } catch (error) {
      console.error("Removing the card failed", error);
      await reload();
    }
  }

  let boardMenu: { x: number; y: number; target: HTMLElement } | undefined =
    $state();

  function openBoardMenu(event: MouseEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    boardMenu = { x: rect.left, y: rect.bottom + 4, target };
  }

  function newBoard() {
    boardMenu = undefined;
    void promptNewBoard(repo.rid);
  }

  function renameBoard() {
    boardMenu = undefined;
    const current = board;
    if (!current) return;
    show({
      component: BoardName,
      props: {
        title: "Rename board",
        action: "Rename",
        name: current.name,
        save: async (name: string) => {
          replaceBoard(
            await invoke<Board>("rename_board", {
              rid: repo.rid,
              board: current.id,
              name,
              opts,
            }),
          );
        },
      },
    });
  }

  async function saveColumns(next: Column[]) {
    pendingColumns = next;
    try {
      const target = await ensureBoard();
      replaceBoard(
        await invoke<Board>("set_board_columns", {
          rid: repo.rid,
          board: target.id,
          columns: next,
          opts,
        }),
      );
    } catch (error) {
      console.error("Saving the columns failed", error);
      await reload();
    } finally {
      pendingColumns = undefined;
    }
  }

  let renaming: { id: string; value: string } | undefined = $state();

  function startRename(column: Column) {
    if (!isDelegate || view !== "board") return;
    renaming = { id: column.id, value: column.name };
  }

  function finishRename(save: boolean) {
    const current = renaming;
    renaming = undefined;
    if (!save || !current) return;
    const name = current.value.trim();
    const column = columns.find(c => c.id === current.id);
    if (!name || !column || column.name === name) return;
    void saveColumns(
      columns.map(c => (c.id === current.id ? { ...c, name } : c)),
    );
  }

  let columnGrab:
    { id: string; x: number; active: boolean; offsetX: number } | undefined =
    $state();

  function onTitlePointerDown(event: PointerEvent, column: Column) {
    if (!isDelegate || event.button !== 0 || renaming) return;
    const rect = (
      (event.currentTarget as HTMLElement).closest(".column") as HTMLElement
    ).getBoundingClientRect();
    columnGrab = {
      id: column.id,
      x: event.clientX,
      active: false,
      offsetX: event.clientX - rect.left,
    };
  }

  // Moves the dragged column among the visible ones as the pointer crosses
  // their middles; hidden columns keep their place in the full order.
  function onColumnDragMove(event: PointerEvent): boolean {
    if (!columnGrab) return false;
    if (!columnGrab.active) {
      if (Math.abs(event.clientX - columnGrab.x) < DRAG_THRESHOLD) return true;
      columnGrab.active = true;
      columnPreview = [...columns];
    }
    const id = columnGrab.id;
    const others = [
      ...(boardEl?.querySelectorAll<HTMLElement>("[data-column]") ?? []),
    ].filter(el => el.dataset.column !== id);
    let index = 0;
    for (const el of others) {
      const rect = el.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      if (rect.left - matrix.m41 + rect.width / 2 < event.clientX) index++;
    }
    const order = (columnPreview ?? columns).filter(c => c.id !== id);
    const dragged = columns.find(c => c.id === id)!;
    const anchor = others[index - 1]?.dataset.column;
    const at = anchor ? order.findIndex(c => c.id === anchor) + 1 : 0;
    const next = [...order.slice(0, at), dragged, ...order.slice(at)];
    if (next.some((c, i) => c.id !== columnPreview?.[i]?.id)) {
      columnPreview = next;
    }
    return true;
  }

  function onColumnDragEnd(cancel: boolean): boolean {
    if (!columnGrab) return false;
    const { active } = columnGrab;
    columnGrab = undefined;
    const next = columnPreview;
    columnPreview = undefined;
    if (active) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false));
      const before = board?.columns ?? DEFAULT_COLUMNS;
      if (!cancel && next && next.some((c, i) => c.id !== before[i]?.id)) {
        void saveColumns(next);
      }
    }
    return true;
  }

  function editColumns() {
    boardMenu = undefined;
    show({
      component: BoardColumns,
      props: {
        columns,
        save: async (next: Column[]) => {
          const target = await ensureBoard();
          replaceBoard(
            await invoke<Board>("set_board_columns", {
              rid: repo.rid,
              board: target.id,
              columns: next,
              opts,
            }),
          );
        },
      },
    });
  }

  function addFromRepo() {
    boardMenu = undefined;
    show({
      component: AddBoardCard,
      props: {
        repos: sidebarData.repos.filter(r => r.rid !== repo.rid),
        onBoard: (board?.cards ?? []).map(p => cardKey(p.card)),
        add: addCard,
      },
    });
  }

  let menu:
    { item: BoardItem; x: number; y: number; target: HTMLElement } | undefined =
    $state();

  function openContextMenu(event: MouseEvent, item: BoardItem) {
    if (!canMove(item) && !isDelegate) return;
    event.preventDefault();
    menu = {
      item,
      x: event.clientX,
      y: event.clientY,
      target: event.currentTarget as HTMLElement,
    };
  }

  const DRAG_THRESHOLD = 4;
  interface Grab {
    item: BoardItem;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  }
  let pending: (Grab & { x: number; y: number }) | undefined;
  let drag:
    | (Grab & { over: string | undefined; index: number | undefined })
    | undefined = $state();
  let pointer = $state({ x: 0, y: 0 });
  let landing: { x: number; y: number } | undefined = $state();
  let suppressClick = false;
  let boardEl: HTMLElement | undefined = $state();
  let listEl: HTMLElement | undefined = $state();
  let scrollFrame: number | undefined;

  const LANDING_MS = 160;

  const display = $derived(
    drag?.over !== undefined && drag.index !== undefined
      ? arrange(
          applyMove(settled, {
            item: drag.item,
            column: drag.over,
            index: drag.index,
          }),
        )
      : settled,
  );

  const visibleColumns = $derived(
    columns.filter(
      c =>
        (settings.showCanceled || c.closes !== "other") &&
        (settings.showCompleted || c.closes !== "solved") &&
        (settings.showEmpty ||
          drag !== undefined ||
          (display[c.id]?.length ?? 0) > 0),
    ),
  );

  // List groups. Grouping by status follows the columns and supports
  // dragging; the other groupings are for reading only.
  const listGroups = $derived.by(() => {
    const shown = visibleColumns.flatMap(c => display[c.id] ?? []);
    const byKey = (
      entries: { id: string; name: string }[],
      keyOf: (item: BoardItem) => string,
    ) =>
      entries
        .map(e => ({
          ...e,
          items: shown.filter(item => keyOf(item) === e.id),
        }))
        .filter(g => settings.showEmpty || g.items.length > 0);

    switch (settings.grouping) {
      case "status":
        return visibleColumns.map(c => ({
          id: c.id,
          name: c.name,
          items: display[c.id] ?? [],
        }));
      case "priority":
        return byKey(
          PRIORITIES.map(p => ({ id: p.id, name: p.label })),
          item => priorityOf(itemLabels(item)),
        );
      case "assignee":
        return byKey(
          [
            ...people.map(p => ({ id: p.did, name: p.name })),
            { id: "none", name: "No assignee" },
          ],
          item => assigneesOf(item)[0]?.did ?? "none",
        );
      case "label":
        return byKey(
          [
            ...allLabels.map(l => ({ id: l, name: l })),
            { id: "none", name: "No label" },
          ],
          item => displayLabels(itemLabels(item))[0] ?? "none",
        );
      default:
        return [{ id: "all", name: "All cards", items: shown }];
    }
  });

  // A card the viewer can't move still follows the pointer a little and
  // springs back, so the grab registers without the card leaving its spot.
  const NUDGE_MAX = 24;
  interface LockedGrab {
    item: BoardItem;
    x: number;
    y: number;
    left: number;
    top: number;
    width: number;
  }
  let lockedGrab: LockedGrab | undefined;
  // The pulled card is drawn as a floating copy so it can poke out of its
  // column, which clips anything that overflows it.
  let nudge:
    (LockedGrab & { dx: number; dy: number; releasing: boolean }) | undefined =
    $state();

  function rubber(distance: number): number {
    return (
      Math.sign(distance) *
      NUDGE_MAX *
      (1 - Math.exp(-Math.abs(distance) / (NUDGE_MAX * 3)))
    );
  }

  function releaseNudge() {
    lockedGrab = undefined;
    if (!nudge) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false));
    const key = nudge.item.key;
    nudge = { ...nudge, dx: 0, dy: 0, releasing: true };
    setTimeout(() => {
      if (nudge?.item.key === key && nudge.releasing) nudge = undefined;
    }, 260);
  }

  function onPointerDown(event: PointerEvent, item: BoardItem) {
    if (event.button !== 0 || landing) return;
    if (view === "list" && settings.grouping !== "status") return;
    if (!canMove(item)) {
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      lockedGrab = {
        item,
        x: event.clientX,
        y: event.clientY,
        left: box.left,
        top: box.top,
        width: box.width,
      };
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    pending = {
      item,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function columnAt(x: number, y: number): string | undefined {
    const container = view === "board" ? boardEl : listEl;
    const bounds = container?.getBoundingClientRect();
    if (!container || !bounds || y < bounds.top || y > bounds.bottom) {
      return undefined;
    }
    let nearest: { column: string; distance: number } | undefined;
    for (const el of container.querySelectorAll<HTMLElement>("[data-column]")) {
      const rect = el.getBoundingClientRect();
      const [pos, start, end] =
        view === "board"
          ? [x, rect.left, rect.right]
          : [y, rect.top, rect.bottom];
      const distance = pos < start ? start - pos : pos > end ? pos - end : 0;
      if (!nearest || distance < nearest.distance) {
        nearest = { column: el.dataset.column!, distance };
      }
    }
    return nearest?.column;
  }

  // Where the dragged card would land in `column`: the number of other cards
  // whose middle is above the pointer.
  function indexAt(column: string, y: number, key: string): number {
    const container = view === "board" ? boardEl : listEl;
    const el = container?.querySelector(`[data-column="${column}"]`);
    if (!el) return 0;
    let index = 0;
    for (const card of el.querySelectorAll<HTMLElement>("[data-key]")) {
      if (card.dataset.key === key) continue;
      const rect = card.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(card).transform);
      if (rect.top - matrix.m42 + rect.height / 2 < y) index++;
    }
    return index;
  }

  // Only reassigning on a change keeps the columns from re-rendering on every
  // pointer move, which would restart the cards' flip animations mid-flight.
  function updateOver() {
    if (!drag) return;
    const column = columnAt(pointer.x, pointer.y);
    const over = column && accepts(drag.item, column) ? column : undefined;
    const index =
      over === undefined ? undefined : indexAt(over, pointer.y, drag.item.key);
    if (over !== drag.over || index !== drag.index) {
      drag = { ...drag, over, index };
    }
  }

  function autoScroll() {
    scrollFrame = undefined;
    if (!drag || landing || !boardEl || view !== "board") return;
    const rect = boardEl.getBoundingClientRect();
    const edge = 80;
    const speed =
      pointer.x > rect.right - edge
        ? 12
        : pointer.x < rect.left + edge
          ? -12
          : 0;
    if (speed === 0) return;
    boardEl.scrollLeft += speed;
    updateOver();
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function onWindowPointerMove(event: PointerEvent) {
    if (onColumnDragMove(event)) return;
    if (lockedGrab) {
      const dx = event.clientX - lockedGrab.x;
      const dy = event.clientY - lockedGrab.y;
      if (nudge || Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        nudge = {
          ...lockedGrab,
          dx: rubber(dx),
          dy: rubber(dy),
          releasing: false,
        };
      }
      return;
    }
    if (landing) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (drag) {
      updateOver();
      if (scrollFrame === undefined) {
        scrollFrame = requestAnimationFrame(autoScroll);
      }
    } else if (
      pending &&
      Math.hypot(event.clientX - pending.x, event.clientY - pending.y) >
        DRAG_THRESHOLD
    ) {
      drag = { ...pending, over: undefined, index: undefined };
      pending = undefined;
      updateOver();
    }
  }

  // The slot's layout position, ignoring any flip animation still moving it.
  function slotPosition(): { x: number; y: number } | undefined {
    const el = (
      view === "board" ? boardEl : listEl
    )?.querySelector<HTMLElement>(".placeholder");
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    return { x: rect.left - matrix.m41, y: rect.top - matrix.m42 };
  }

  function sameSpot(item: BoardItem, column: string, index: number): boolean {
    if (item.column !== column) return false;
    if (!manual) return true;
    const list = settled[column] ?? [];
    return list.findIndex(i => i.key === item.key) === index;
  }

  async function land(cancel: boolean) {
    if (!drag || landing) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false));

    if (cancel) {
      drag = { ...drag, over: undefined, index: undefined };
      await tick();
    }
    const slot = slotPosition();
    if (slot) {
      landing = slot;
      await new Promise(resolve => setTimeout(resolve, LANDING_MS));
    }

    const { item, over, index } = drag;
    if (
      !cancel &&
      over !== undefined &&
      index !== undefined &&
      !sameSpot(item, over, index)
    ) {
      optimistic = { item, column: over, index };
      void moveItem(item, over, index);
    }
    drag = undefined;
    landing = undefined;
  }

  function onWindowPointerUp() {
    if (onColumnDragEnd(false)) return;
    releaseNudge();
    pending = undefined;
    void land(false);
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && columnGrab) {
      event.preventDefault();
      onColumnDragEnd(true);
      return;
    }
    if (event.key === "Escape" && nudge) {
      releaseNudge();
      return;
    }
    if (event.key === "Escape" && (drag || pending)) {
      event.preventDefault();
      event.stopPropagation();
      pending = undefined;
      void land(true);
      return;
    }
    if (
      event.key === "Escape" &&
      sheet &&
      !document.querySelector('.popover, [role="menu"], [data-modal-content]')
    ) {
      closeSheet();
    }
  }

  function onCardClick(item: BoardItem) {
    if (suppressClick) return;
    open(item);
  }

  function shortId(id: string) {
    return id.slice(0, 7);
  }

  function patchState(patch: Patch): string {
    return {
      draft: "Draft",
      open: "Open",
      archived: "Archived",
      merged: "Merged",
    }[patch.state.status];
  }
</script>

<style>
  /* Dark is the default theme. Black shadows barely show on its canvas, so
     they are much stronger there than in light. */
  :global(:root) {
    --board-shadow-hover: 0 2px 8px rgba(0, 0, 0, 0.6);
    --board-shadow-lifted: 0 12px 32px rgba(0, 0, 0, 0.75);
  }
  :global([data-theme="light"]) {
    --board-shadow-hover: 0 2px 6px rgba(0, 0, 0, 0.08);
    --board-shadow-lifted: 0 12px 32px rgba(0, 0, 0, 0.18);
  }
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
  }
  .topbar-title {
    font: var(--txt-body-m-semibold);
    color: var(--color-text-secondary);
    padding-right: 0.25rem;
  }

  .board {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow-x: auto;
  }
  /* As wide as the issue sheet. */
  .sheet-spacer {
    flex: 0 0 min(48rem, 60vw);
  }
  .column {
    display: flex;
    flex-direction: column;
    flex: 0 0 18rem;
    min-height: 0;
    border-right: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-canvas);
  }
  .column-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-semibold);
    color: var(--color-text-primary);
    background-color: var(--color-surface-canvas);
    pointer-events: none;
  }
  .count {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .column.lifted {
    position: relative;
    z-index: 2;
    box-shadow: var(--board-shadow-lifted);
  }
  .column-title {
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
  }
  .column-title.movable {
    cursor: grab;
  }
  .column.lifted .column-title {
    cursor: grabbing;
  }
  .column-rename {
    pointer-events: auto;
    flex: 1;
    min-width: 0;
    height: 1.75rem;
    margin: -0.25rem 0;
    padding: 0 0.375rem;
    border: 1px solid var(--color-border-brand);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    font: var(--txt-body-m-semibold);
    outline: none;
  }
  /* The cards are see-through over this background, so a hovered card's
     shadow falls across its neighbours without stacking above them. Neither
     this nor the cards may be positioned: WebKit paints positioned content
     over the column's overlay scrollbar. */
  /* Only the cards scroll, so the scrollbar starts below the column title. */
  .cards-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .cards {
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-canvas);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }
  .card:hover {
    box-shadow: var(--board-shadow-hover);
  }
  .card,
  .row {
    transition:
      opacity 0.2s ease,
      box-shadow 0.15s ease,
      background-color 0.15s ease;
  }
  /* Dimming fades a card's contents, not the card, so the borders it shares
     with the open card stay at full strength. WKWebView keeps a scrolled
     column in tiles it only repaints on scroll, so the dimmed parts get their
     own layers from the start or the change would show late. */
  .card > :global(*),
  .row > :global(*) {
    transition: opacity 0.2s ease;
    will-change: opacity;
  }
  .card.sheet-dim > :global(*),
  .row.sheet-dim > :global(*) {
    opacity: 0.4;
  }
  .card,
  .row {
    will-change: opacity;
  }
  .card.fixed .card-title,
  .card.fixed .card-top > span:not(.lock) {
    color: var(--color-text-secondary);
  }
  .nudge-source {
    visibility: hidden;
  }
  .nudge {
    position: fixed;
    z-index: 100;
    background-color: var(--color-surface-canvas);
    box-sizing: border-box;
    pointer-events: none;
    cursor: not-allowed;
  }
  .row.nudge {
    background-color: var(--color-surface-canvas);
  }
  .nudge.releasing {
    transition: transform 240ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .lock {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-quaternary);
  }
  .card-top .lock {
    margin-left: auto;
  }
  .card-top .assignees + .lock {
    margin-left: 0;
  }
  .board-picker {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    font: var(--txt-body-m-semibold);
    color: var(--color-text-primary);
    cursor: pointer;
    white-space: nowrap;
  }
  .board-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
  }
  .board-actions:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .board-picker:hover {
    background-color: var(--color-surface-subtle);
  }
  .unresolved {
    font: var(--txt-body-s-regular, var(--txt-body-m-regular));
    color: var(--color-text-tertiary);
  }
  .patch-chip {
    gap: 0.25rem;
    background: none;
    cursor: pointer;
    font-family: var(--font-family-monospace, monospace);
  }
  .patch-chip:hover {
    border-color: var(--color-border-mid);
    color: var(--color-text-primary);
  }
  .pending {
    font: var(--txt-body-s-regular, var(--txt-body-m-regular));
    color: var(--color-feedback-warning-text);
    white-space: nowrap;
  }
  .notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .card.placeholder,
  .row.placeholder {
    background-color: var(--color-surface-subtle);
    box-shadow: none;
    animation: placeholder-in 150ms ease-out;
  }
  @keyframes placeholder-in {
    from {
      background-color: transparent;
    }
  }
  .card.placeholder > * {
    visibility: hidden;
  }
  .card-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-s-regular, var(--txt-body-m-regular));
    color: var(--color-text-tertiary);
  }
  .card-title {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    word-break: break-word;
  }
  .card-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    height: 1.25rem;
    padding: 0 0.375rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular, var(--txt-body-m-regular));
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .assignees {
    display: flex;
    margin-left: auto;
    gap: 0.125rem;
  }
  .empty {
    padding: 0.75rem;
    color: var(--color-text-quaternary);
    font: var(--txt-body-m-regular);
    text-align: center;
  }

  .ghost {
    position: fixed;
    pointer-events: none;
    z-index: 100;
    box-sizing: border-box;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--board-shadow-lifted);
    transform: rotate(2deg) scale(1.02);
    cursor: grabbing;
    animation: lift 160ms ease-out;
  }
  /* Picking a card up grows its hover shadow into the drag shadow. */
  @keyframes lift {
    from {
      box-shadow: var(--board-shadow-hover);
      transform: none;
    }
  }
  .ghost.landing {
    transition:
      left 160ms ease-out,
      top 160ms ease-out,
      transform 160ms ease-out,
      box-shadow 160ms ease-out;
    transform: none;
    box-shadow: none;
    animation: none;
  }

  .list {
    position: relative;
    padding: 0.5rem 0 2rem;
  }
  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 1rem;
    background-color: var(--color-surface-base);
    border: 0;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-semibold);
    color: var(--color-text-primary);
    cursor: pointer;
    text-align: left;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    font: var(--txt-body-m-regular);
  }
  .row {
    user-select: none;
    -webkit-user-select: none;
  }
  .row.placeholder > * {
    visibility: hidden;
  }
  .row.ghost {
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    transform: scale(1.01);
  }
  .row:hover {
    background-color: var(--color-surface-subtle);
  }
  .row-id {
    color: var(--color-text-tertiary);
    width: 4.5rem;
    flex-shrink: 0;
    font-family: var(--font-family-monospace, monospace);
  }
  .row-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }
  .row-main > :global(*:not(.row-title)) {
    flex-shrink: 0;
  }
  .row-title {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
  }
  .row-comments {
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
    width: 3.5rem;
  }
  .row-date {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    width: 2.5rem;
    flex-shrink: 0;
    text-align: right;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2rem;
    padding: 0 0.75rem;
    background: transparent;
    border: 0;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-align: left;
    cursor: pointer;
  }
  .menu-item:hover,
  .menu-item:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .menu-item .check {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .menu-heading {
    padding: 0.25rem 0.75rem;
    font: var(--txt-body-s-regular, var(--txt-body-m-regular));
    color: var(--color-text-tertiary);
  }
  .menu-separator {
    height: 1px;
    margin: 0.25rem 0;
    background-color: var(--color-border-subtle);
  }
</style>

<svelte:window
  onkeydowncapture={onWindowKeydown}
  onpointerdowncapture={onWindowPointerDown}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp}
  onpointercancel={() => {
    releaseNudge();
    pending = undefined;
    if (!landing) drag = undefined;
  }} />

{#snippet assignees(item: BoardItem)}
  {@const people =
    item.kind === "issue"
      ? item.issue.assignees
      : item.kind === "patch"
        ? item.patch.assignees
        : []}
  {#if people.length > 0}
    <div class="assignees">
      {#each people as assignee (assignee.did)}
        <NodeId {...authorForNodeId(assignee)} avatarOnly />
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet labels(item: BoardItem)}
  {#each displayLabels(itemLabels(item)) as label}
    <span class="chip" title={label}>{label}</span>
  {/each}
{/snippet}

{#snippet patchChips(item: BoardItem)}
  {#if item.kind === "issue"}
    {#each item.patches as patch (patch.id)}
      <button
        class="chip patch-chip"
        title={`${patch.title} (${patchState(patch)})`}
        onpointerdown={e => e.stopPropagation()}
        onclick={e => {
          e.stopPropagation();
          openPatch(patch);
        }}>
        <Icon
          name={patch.state.status === "merged" ? "patch-merged" : "patch"} />
        {shortId(patch.id)}
      </button>
    {/each}
  {:else if item.kind === "patch"}
    <span class="chip" style:gap="0.25rem">
      <Icon
        name={item.patch.state.status === "merged"
          ? "patch-merged"
          : item.patch.state.status === "draft"
            ? "patch-draft"
            : "patch"} />
      {patchState(item.patch)}
    </span>
  {/if}
{/snippet}

{#snippet repoChip(item: BoardItem)}
  {#if isForeign(item)}
    <span class="chip" style:gap="0.25rem" title={item.card.rid}>
      <Icon name="repository" />{repoName(item.card.rid)}
    </span>
  {/if}
  {#if item.kind === "unresolved"}
    <span class="unresolved" title={item.card.rid}>
      {seeding.includes(item.card.rid)
        ? "Seeding…"
        : "Click to seed this repository"}
    </span>
  {/if}
{/snippet}

{#snippet pendingNote(item: BoardItem)}
  {#if item.kind === "issue" && item.pendingClose}
    <span
      class="pending"
      title="Closes when someone who can close this issue opens the board">
      Waiting to close
    </span>
  {/if}
{/snippet}

{#snippet commentCount(item: BoardItem)}
  {@const comments =
    item.kind === "issue"
      ? item.issue.commentCount
      : item.kind === "patch"
        ? item.patch.commentCount
        : 0}
  {#if comments > 0 && shows("comments")}
    <span class="chip" style:gap="0.25rem">
      <Icon name="comment" />{comments}
    </span>
  {/if}
{/snippet}

{#snippet rowContent(item: BoardItem)}
  {#if item.kind !== "unresolved" && shows("priority")}
    <PriorityIcon priority={priorityOf(itemLabels(item))} />
  {/if}
  {#if shows("id")}
    <span class="row-id">{shortId(item.card.oid)}</span>
  {/if}
  {#if item.kind === "patch"}
    <Icon name="patch" />
  {/if}
  <div class="row-main">
    <span class="row-title">{itemTitle(item)}</span>
    {#if shows("patches")}{@render patchChips(item)}{/if}
    {#if shows("repository")}{@render repoChip(item)}{/if}
  </div>
  {#if !canMove(item)}
    <span class="lock"><Icon name="lock" /></span>
  {/if}
  {@render pendingNote(item)}
  <div class="card-meta">
    {#if settings.grouping !== "status"}
      <span class="chip">
        {columns.find(c => c.id === item.column)?.name}
      </span>
    {/if}
    {#if shows("labels")}{@render labels(item)}{/if}
  </div>
  {#if shows("comments")}
    <div class="row-comments">{@render commentCount(item)}</div>
  {/if}
  {#if shows("assignees")}
    <div style:width="4rem" style:display="flex">
      {@render assignees(item)}
    </div>
  {/if}
  {#if shows("created")}
    <span class="row-date" title={absoluteTimestamp(itemTimestamp(item))}>
      {formatTimestamp(itemTimestamp(item))}
    </span>
  {/if}
{/snippet}

{#snippet cardContent(item: BoardItem)}
  {@const priority = priorityOf(itemLabels(item))}
  <div class="card-top">
    {#if item.kind === "patch"}
      <Icon name="patch" />
    {/if}
    {#if shows("id")}
      <span>{shortId(item.card.oid)}</span>
    {/if}
    {#if shows("id") && shows("created")}
      <span>·</span>
    {/if}
    {#if shows("created")}
      <span title={absoluteTimestamp(itemTimestamp(item))}>
        {formatTimestamp(itemTimestamp(item))}
      </span>
    {/if}
    {#if shows("assignees")}{@render assignees(item)}{/if}
    {#if !canMove(item)}
      <span class="lock"><Icon name="lock" /></span>
    {/if}
  </div>
  <div class="card-title">{itemTitle(item)}</div>
  <div class="card-meta">
    {#if item.kind !== "unresolved" && shows("priority")}
      <span
        title={PRIORITIES.find(p => p.id === priority)?.label}
        style:display="flex">
        <PriorityIcon {priority} />
      </span>
    {/if}
    {#if shows("repository")}{@render repoChip(item)}{/if}
    {#if shows("patches")}{@render patchChips(item)}{/if}
    {#if shows("labels")}{@render labels(item)}{/if}
    {@render commentCount(item)}
    {@render pendingNote(item)}
  </div>
{/snippet}

<Layout selfScroll>
  <div class="page">
    <Topbar>
      {#if boards.length > 1}
        <button class="board-picker" onclick={openBoardMenu}>
          {board?.name}
          <Icon name="chevron-down" />
        </button>
      {:else}
        <span class="topbar-title">Board</span>
        {#if isDelegate}
          <button
            class="board-actions"
            title="Board actions"
            aria-label="Board actions"
            onclick={openBoardMenu}>
            <Icon name="ellipsis" />
          </button>
        {/if}
      {/if}
      <div class="global-flex" style:margin-left="auto" style:gap="0.5rem">
        <Popover placement="bottom-end" popoverPadding="0">
          {#snippet toggle(onclick)}
            <Button
              styleHeight="2rem"
              variant="naked"
              active={activeFilterCount(settings.filters) > 0}
              {onclick}>
              <Icon name="filter" />Filter
              {#if activeFilterCount(settings.filters) > 0}
                <span class="global-counter-badge">
                  {activeFilterCount(settings.filters)}
                </span>
              {/if}
            </Button>
          {/snippet}
          {#snippet popover()}
            <BoardFilterMenu
              bind:filters={settings.filters}
              {people}
              labels={allLabels}
              {me} />
          {/snippet}
        </Popover>
        <Popover placement="bottom-end" popoverPadding="0">
          {#snippet toggle(onclick)}
            <Button styleHeight="2rem" variant="naked" {onclick}>
              <Icon name="settings" />Display
            </Button>
          {/snippet}
          {#snippet popover()}
            <BoardDisplayMenu {view} bind:settings onView={setView} />
          {/snippet}
        </Popover>
        <div style:width="14rem">
          <TextInput
            styleHeight="2rem"
            placeholder="Search"
            modShortcuts
            onDismiss={() => (filter = "")}
            bind:value={filter}>
            {#snippet left()}
              <div
                style:color="var(--color-text-tertiary)"
                style:padding-left="0.5rem"
                style:display="flex">
                <Icon name="search" />
              </div>
            {/snippet}
          </TextInput>
        </div>
        <Button
          styleHeight="2rem"
          variant="secondary"
          onclick={() =>
            show({
              component: CreateIssueModal,
              props: { repo },
            })}>
          <Icon name="plus" />New issue
        </Button>
      </div>
    </Topbar>

    {#if !board && !isDelegate}
      <div class="notice">
        <Icon name="guide" />
        This repository has no board yet. A delegate starts it by moving a card.
      </div>
    {/if}

    {#if view === "board"}
      <div class="board" bind:this={boardEl}>
        {#each visibleColumns as column (column.id)}
          <div
            class="column"
            class:lifted={columnPreview !== undefined &&
              columnGrab?.id === column.id}
            data-column={column.id}
            animate:flip={{ duration: 200, easing: cubicOut }}>
            <div class="column-header">
              {#if renaming?.id === column.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="column-rename"
                  aria-label="Column name"
                  autofocus
                  bind:value={renaming.value}
                  onblur={() => finishRename(true)}
                  onkeydown={e => {
                    if (e.key === "Enter") finishRename(true);
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      finishRename(false);
                    }
                  }} />
              {:else}
                <span
                  class="column-title"
                  class:movable={isDelegate}
                  role="heading"
                  aria-level="2"
                  title={isDelegate
                    ? "Drag to reorder, double-click to rename"
                    : undefined}
                  onpointerdown={e => onTitlePointerDown(e, column)}
                  ondblclick={() => startRename(column)}>
                  {column.name}
                </span>
              {/if}
              <span class="count">{display[column.id]?.length ?? 0}</span>
            </div>
            <div class="cards-scroll">
              <div class="cards">
                {#each display[column.id] ?? [] as item (item.key)}
                  <div
                    class="card"
                    class:placeholder={drag?.item.key === item.key}
                    class:fixed={!canMove(item)}
                    class:nudge-source={nudge?.item.key === item.key}
                    class:sheet-dim={sheet !== undefined &&
                      sheet.key !== item.key}
                    title={canMove(item) ? undefined : lockedReason}
                    style:height={drag?.item.key === item.key
                      ? `${drag.height}px`
                      : undefined}
                    data-key={item.key}
                    role="button"
                    tabindex="0"
                    animate:flip={{ duration: 200, easing: cubicOut }}
                    out:filterOut
                    onpointerdown={e => onPointerDown(e, item)}
                    onclick={() => onCardClick(item)}
                    oncontextmenu={e => openContextMenu(e, item)}
                    onkeydown={e => {
                      if (e.key === "Enter") open(item);
                    }}>
                    {@render cardContent(item)}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/each}
        {#if sheet}
          <div class="sheet-spacer" bind:this={sheetSpacer}></div>
        {/if}
      </div>
    {:else}
      <ScrollArea style="height: 100%; min-width: 0;">
        <div class="list" bind:this={listEl}>
          {#each listGroups as group (group.id)}
            <section
              class="group"
              data-column={settings.grouping === "status"
                ? group.id
                : undefined}>
              {#if settings.grouping !== "none"}
                <button
                  class="group-header"
                  onclick={() => (collapsed[group.id] = !collapsed[group.id])}>
                  <Icon
                    name={collapsed[group.id]
                      ? "chevron-right"
                      : "chevron-down"} />
                  {group.name}
                  <span class="count">{group.items.length}</span>
                </button>
              {/if}
              {#if !collapsed[group.id]}
                {#each group.items as item (item.key)}
                  <div
                    class="row"
                    class:placeholder={drag?.item.key === item.key}
                    class:fixed={!canMove(item)}
                    class:nudge-source={nudge?.item.key === item.key}
                    class:sheet-dim={sheet !== undefined &&
                      sheet.key !== item.key}
                    title={canMove(item) ? undefined : lockedReason}
                    data-key={item.key}
                    role="button"
                    tabindex="0"
                    animate:flip={{ duration: 200, easing: cubicOut }}
                    out:filterOut
                    onpointerdown={e => onPointerDown(e, item)}
                    onclick={() => onCardClick(item)}
                    oncontextmenu={e => openContextMenu(e, item)}
                    onkeydown={e => {
                      if (e.key === "Enter") open(item);
                    }}>
                    {@render rowContent(item)}
                  </div>
                {/each}
              {/if}
            </section>
          {/each}
          {#if itemCount === 0}
            <div class="empty">No matching cards</div>
          {/if}
        </div>
      </ScrollArea>
    {/if}
  </div>
  {#if sheet}
    <IssueSheet
      data={sheet.data}
      {config}
      onClose={closeSheet}
      onChange={() => void reload()} />
  {/if}
</Layout>

{#if drag}
  <div
    class="ghost"
    class:card={view === "board"}
    class:row={view === "list"}
    class:landing
    style:left="{landing ? landing.x : pointer.x - drag.offsetX}px"
    style:top="{landing ? landing.y : pointer.y - drag.offsetY}px"
    style:width="{drag.width}px">
    {#if view === "board"}
      {@render cardContent(drag.item)}
    {:else}
      {@render rowContent(drag.item)}
    {/if}
  </div>
{/if}

{#if nudge}
  <div
    class="nudge"
    class:card={view === "board"}
    class:row={view === "list"}
    class:fixed={true}
    class:releasing={nudge.releasing}
    style:left="{nudge.left}px"
    style:top="{nudge.top}px"
    style:width="{nudge.width}px"
    style:transform="translate({nudge.dx}px, {nudge.dy}px)">
    {#if view === "board"}
      {@render cardContent(nudge.item)}
    {:else}
      {@render rowContent(nudge.item)}
    {/if}
  </div>
{/if}

{#if boardMenu}
  <ContextMenu
    x={boardMenu.x}
    y={boardMenu.y}
    target={boardMenu.target}
    onclose={() => (boardMenu = undefined)}>
    {#if boards.length > 1}
      <div class="menu-heading">Boards</div>
      {#each boards as b (b.id)}
        <button
          class="menu-item"
          role="menuitem"
          onclick={() => {
            boardMenu = undefined;
            goToBoard(b.id);
          }}>
          {b.name}
          {#if b.id === board?.id}
            <span class="check"><Icon name="checkmark" /></span>
          {/if}
        </button>
      {/each}
    {/if}
    {#if isDelegate}
      {#if boards.length > 1}
        <div class="menu-separator"></div>
      {/if}
      <button class="menu-item" role="menuitem" onclick={newBoard}>
        <Icon name="plus" />New board
      </button>
      {#if board && boards.length > 1}
        <button class="menu-item" role="menuitem" onclick={renameBoard}>
          <Icon name="edit" />Rename board
        </button>
      {/if}
      <button class="menu-item" role="menuitem" onclick={editColumns}>
        <Icon name="settings" />Edit columns
      </button>
      <button class="menu-item" role="menuitem" onclick={addFromRepo}>
        <Icon name="repository" />Add card from another repository
      </button>
    {/if}
  </ContextMenu>
{/if}

{#if menu}
  {@const item = menu.item}
  {@const currentPriority = priorityOf(itemLabels(item))}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    target={menu.target}
    onclose={() => (menu = undefined)}>
    {#if canMove(item)}
      <div class="menu-heading">Move to</div>
      {#each columns.filter(c => accepts(item, c.id)) as column (column.id)}
        <button
          class="menu-item"
          role="menuitem"
          onclick={() => {
            moveToColumn(item, column.id);
            menu = undefined;
          }}>
          {column.name}
          {#if item.column === column.id}
            <span class="check"><Icon name="checkmark" /></span>
          {/if}
        </button>
      {/each}
    {/if}
    {#if isDelegate && (isForeign(item) || item.kind === "unresolved")}
      <div class="menu-separator"></div>
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => {
          void removeCard(item);
          menu = undefined;
        }}>
        <Icon name="trash" />Remove from board
      </button>
    {/if}
    {#if isDelegate && item.kind === "issue" && !isForeign(item)}
      {#if canMove(item)}
        <div class="menu-separator"></div>
      {/if}
      <div class="menu-heading">Priority</div>
      {#each PRIORITIES as priority (priority.id)}
        <button
          class="menu-item"
          role="menuitem"
          onclick={() => {
            void setPriority(item, priority.id);
            menu = undefined;
          }}>
          <PriorityIcon priority={priority.id} />
          {priority.label}
          {#if currentPriority === priority.id}
            <span class="check"><Icon name="checkmark" /></span>
          {/if}
        </button>
      {/each}
    {/if}
  </ContextMenu>
{/if}
