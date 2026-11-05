<script lang="ts">
  import type { Board } from "@bindings/cob/board/Board";
  import type { BoardUpdate } from "@bindings/cob/board/BoardUpdate";
  import type { Card } from "@bindings/cob/board/Card";
  import type { Column } from "@bindings/cob/board/Column";
  import type { PatchLink } from "@bindings/cob/board/PatchLink";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { State } from "@bindings/cob/issue/State";
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { onDestroy, untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { fade, slide } from "svelte/transition";

  import type {
    BoardItem,
    BoardView,
    ForeignCard,
    Priority,
  } from "@app/lib/board";
  import {
    applyMove,
    cardFor,
    cardKey,
    DEFAULT_COLUMNS,
    dropPosition,
    groupItems,
    isMe,
    ISSUE_TYPE,
    labelsForPriority,
    MAX_NAME_LENGTH,
    overlayBoard,
    overlayIssues,
    refusal,
    sameState,
    stateAfterMove,
    validName,
  } from "@app/lib/board";
  import { promptNewBoard } from "@app/lib/boardActions";
  import { BoardDrag } from "@app/lib/boardDrag.svelte";
  import { BoardQueue } from "@app/lib/boardQueue.svelte";
  import type { BoardViewSettings } from "@app/lib/boardView";
  import {
    activeFilterCount,
    arrange,
    assigneeOptions,
    labelOptions,
    listGroups,
    loadView,
    matchesFilters,
    saveView,
    visibleColumns,
  } from "@app/lib/boardView";
  import { flushBeforeClose } from "@app/lib/closeFlush";
  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import * as roles from "@app/lib/roles";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { useShortcuts } from "@app/lib/shortcuts.svelte";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import BoardCard from "@app/components/BoardCard.svelte";
  import BoardCardMenu from "@app/components/BoardCardMenu.svelte";
  import BoardDisplayMenu from "@app/components/BoardDisplayMenu.svelte";
  import BoardFilterMenu from "@app/components/BoardFilterMenu.svelte";
  import Button from "@app/components/Button.svelte";
  import ContextMenu from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import AddBoardCard from "@app/modals/AddBoardCard.svelte";
  import BoardColumns from "@app/modals/BoardColumns.svelte";
  import BoardName from "@app/modals/BoardName.svelte";
  import ConfirmSeedCard from "@app/modals/ConfirmSeedCard.svelte";
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
    patches: initialPatches,
    links,
    view,
    selected,
    sidebarData,
  }: Props = $props();

  let boards: Board[] = $derived(initialBoards);
  let issues: Issue[] = $derived(initialIssues);
  let patches: Patch[] = $derived(initialPatches);
  const board = $derived(boards.find(b => b.id === selected) ?? boards[0]);

  let saveError: string | undefined = $state();

  async function reload() {
    try {
      const [nextBoards, nextIssues, nextPatches] = await Promise.all([
        invoke<Board[]>("list_boards", { rid: repo.rid }),
        invoke<PaginatedQuery<Issue[]>>("list_issues", {
          rid: repo.rid,
          status: "all",
        }),
        invoke<PaginatedQuery<Patch[]>>("list_patches", { rid: repo.rid }),
      ]);
      boards = nextBoards;
      issues = nextIssues.content;
      patches = nextPatches.content;
    } catch (error) {
      console.error("Reloading the board failed", error);
    }
  }

  function replaceBoard(updated: Board) {
    boards = boards.map(b => (b.id === updated.id ? updated : b));
  }

  const queue = new BoardQueue({
    async update(batch, announce) {
      const update = await invoke<BoardUpdate>("update_board", {
        rid: batch.rid,
        board: batch.board,
        moves: batch.moves,
        removes: batch.removes,
        opts: { announce },
      });
      if (batch.rid === repo.rid) replaceBoard(update.board);
      return update.rejected;
    },
    async setState(rid, cobId, state, announce) {
      await invoke("edit_issue", {
        rid,
        cobId,
        action: { type: "lifecycle", state },
        opts: { announce },
      });
    },
    async reload(rid) {
      if (rid === repo.rid) await reload();
    },
    error(message) {
      saveError = message;
    },
  });

  const unregisterFlush = flushBeforeClose(announce => queue.flush(announce));
  onDestroy(() => {
    unregisterFlush();
    void queue.flush();
  });

  const shownBoard: Board | undefined = $derived(
    overlayBoard(
      board,
      queue.queued,
      `did:key:${config.publicKey}`,
      Date.now(),
    ),
  );
  const shownIssues: Issue[] = $derived(
    overlayIssues(repo.rid, issues, [...queue.writing, ...queue.queued]),
  );

  // Cards from other repositories, looked up per card. A card whose
  // repository isn't on this device stays unresolved.
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

  const foreignCards: Card[] = $derived(
    Object.values(
      Object.fromEntries(
        (shownBoard?.cards ?? [])
          .filter(p => p.card.rid !== repo.rid)
          .map(p => [cardKey(p.card), p.card]),
      ),
    ),
  );
  // The lookups run again only when the set of foreign cards changes, not
  // on every queued change.
  const foreignKeys = $derived(foreignCards.map(cardKey).sort().join("\n"));

  $effect(() => {
    const cards = foreignKeys === "" ? [] : untrack(() => foreignCards);
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

  function goToBoard(id: string | undefined) {
    void router.push({
      resource: "repo.board",
      rid: repo.rid,
      board: id,
    });
  }

  let boardEl: HTMLElement | undefined = $state();
  let listEl: HTMLElement | undefined = $state();

  const dnd = new BoardDrag({
    get container() {
      return view === "board" ? boardEl : listEl;
    },
    get horizontal() {
      return view === "board";
    },
    get draggable() {
      return view === "board" || settings.grouping === "status";
    },
    get columns() {
      return columns;
    },
    get canReorderColumns() {
      return isDelegate && !renaming;
    },
    canMove,
    canDrop,
    sameSpot,
    drop: moveItem,
    reorderColumns(next) {
      const before = board?.columns ?? DEFAULT_COLUMNS;
      if (next.some((c, i) => c.id !== before[i]?.id)) void saveColumns(next);
    },
  });

  // Columns saved but not yet echoed back by the board.
  let pendingColumns: Column[] | undefined = $state();
  const columns: Column[] = $derived(
    dnd.columnPreview ?? pendingColumns ?? board?.columns ?? DEFAULT_COLUMNS,
  );

  let filter = $state("");
  const collapsed: Record<string, boolean> = $state({});

  // Settings belong to the board on show, and the view in the route is
  // remembered with them. Changes still pending for the board being left are
  // written on the way.
  // svelte-ignore state_referenced_locally
  let settingsBoard = board?.id;
  // svelte-ignore state_referenced_locally
  let settings: BoardViewSettings = $state(loadView(repo.rid, board?.id));
  $effect.pre(() => {
    const id = board?.id;
    if (id !== settingsBoard) {
      settingsBoard = id;
      settings = loadView(repo.rid, id);
      void queue.flush();
    }
  });
  $effect(() => {
    saveView(repo.rid, board?.id, { ...$state.snapshot(settings), view });
  });

  // Cards a filter or search hides fade out. Every other removal, such as a
  // card leaving its column on a drop, is instant.
  let filtering = false;
  let filteringTimeout: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    JSON.stringify(settings.filters) + filter;
    filtering = true;
    clearTimeout(filteringTimeout);
    filteringTimeout = setTimeout(() => (filtering = false), 300);
  });

  // Svelte pins a leaving card where it stood with a transform, so the shrink
  // uses the separate scale property to leave that transform alone.
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

  // Only an issue created from the board slides in; cards that appear any
  // other way, such as on a move or a filter change, show instantly.
  let arriving: string | undefined;
  function arriveIn(node: HTMLElement) {
    if (node.dataset.key !== arriving) return { duration: 0 };
    arriving = undefined;
    return slide(node, { duration: 220, easing: cubicOut });
  }

  // An issue created from a column's add button or menu is placed at the end
  // of that column, which is never a closing one.
  function createIssue(column?: Column) {
    show({
      component: CreateIssueModal,
      props: {
        repo,
        onCreated: (issue: Issue) => {
          const card = cardFor(repo.rid, ISSUE_TYPE, issue.id);
          arriving = cardKey(card);
          if (column && board) {
            const list = grouped[column.id] ?? [];
            const { position } = dropPosition(list, list.length);
            if (position) {
              queue.enqueue(
                {
                  rid: repo.rid,
                  board: board.id,
                  opts,
                  card,
                  change: { kind: "move", column: column.id, position },
                },
                board,
                manual,
              );
            }
          }
          void reload();
        },
      },
    });
  }

  useShortcuts({ shortcut: "newIssue", run: () => createIssue() });

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

  const isDelegate = $derived(
    !!roles.isDelegate(
      config.publicKey,
      repo.delegates.map(d => d.did),
    ),
  );

  const opts = $derived({ announce: $nodeRunning && $announce });

  function canMove(item: BoardItem): boolean {
    if (!board) return false;
    if (isDelegate) return true;
    if (isForeign(item) || item.kind === "unresolved") return false;
    if (item.kind === "patch") {
      return isMe(item.patch.author.did, config.publicKey);
    }
    return (
      isMe(item.issue.author.did, config.publicKey) ||
      item.issue.assignees.some(a => isMe(a.did, config.publicKey))
    );
  }

  const lockedReason =
    "Only delegates, the author and assignees can move this card";

  function canChangeState(issue: Issue): boolean {
    return isDelegate || isMe(issue.author.did, config.publicKey);
  }

  function refusalFor(item: BoardItem, columnId: string): string | undefined {
    const column = columns.find(c => c.id === columnId);
    if (!column) return "This column was removed";
    return refusal(
      item,
      column,
      columns,
      item.kind === "issue" && canChangeState(item.issue),
      repo.rid,
    );
  }

  function canDrop(item: BoardItem, columnId: string): boolean {
    return refusalFor(item, columnId) === undefined;
  }

  const grouped = $derived.by(() => {
    const groups = groupItems(
      repo.rid,
      shownBoard,
      shownIssues,
      patches,
      links,
      foreign,
    );
    return Object.fromEntries(
      Object.entries(groups).map(([id, list]) => [
        id,
        list.filter(item => matchesFilters(item, settings.filters, filter)),
      ]),
    );
  });

  const people = $derived(assigneeOptions(issues, patches));
  const allLabels = $derived(labelOptions(issues, patches));

  const itemCount = $derived(
    Object.values(grouped).reduce((n, list) => n + list.length, 0),
  );

  const settled = $derived(
    arrange(grouped, settings.ordering, settings.descending),
  );

  // Moving an issue into or out of a closing column also changes its state;
  // the columns a card can drop into already reflect who may do that.
  function moveItem(item: BoardItem, columnId: string, index: number) {
    const column = columns.find(c => c.id === columnId);
    if (!column || !board || !canDrop(item, columnId)) return;
    // With another ordering on, a drop can't pick a spot, so the card goes to
    // the end of the column's board order.
    const source = manual ? settled : grouped;
    const without = (source[columnId] ?? []).filter(i => i.key !== item.key);
    const { bounds, position } = dropPosition(
      without,
      manual ? index : without.length,
    );
    if (!position) {
      saveError = "Couldn't place the card there. Try another spot.";
      return;
    }

    let state: State | undefined;
    if (
      item.kind === "issue" &&
      !isForeign(item) &&
      canChangeState(item.issue)
    ) {
      const committed =
        queue.inFlight(item.key)?.state ??
        issues.find(i => i.id === item.issue.id)?.state;
      const next = stateAfterMove(item, column, columns);
      if (committed && !sameState(committed, next)) state = next;
    }
    queue.enqueue(
      {
        rid: repo.rid,
        board: board.id,
        opts,
        card: item.card,
        change: { kind: "move", column: columnId, position },
        state,
      },
      board,
      manual,
      bounds,
    );
  }

  function moveToColumn(item: BoardItem, columnId: string) {
    moveItem(item, columnId, settled[columnId]?.length ?? 0);
  }

  function sameSpot(item: BoardItem, column: string, index: number): boolean {
    if (item.column !== column) return false;
    if (!manual) return true;
    const list = settled[column] ?? [];
    return list.findIndex(i => i.key === item.key) === index;
  }

  async function setPriority(item: BoardItem, priority: Priority) {
    if (isForeign(item)) return;
    try {
      if (item.kind === "issue") {
        await invoke("edit_issue", {
          rid: repo.rid,
          cobId: item.issue.id,
          action: {
            type: "label",
            labels: labelsForPriority(item.issue.labels, priority),
          },
          opts,
        });
      } else if (item.kind === "patch") {
        await invoke("edit_patch", {
          rid: repo.rid,
          cobId: item.patch.id,
          action: {
            type: "label",
            labels: labelsForPriority(item.patch.labels, priority),
          },
          opts,
        });
      }
    } catch (error) {
      console.error("Setting the priority failed", error);
    } finally {
      await reload();
    }
  }

  function open(item: BoardItem) {
    if (item.kind === "issue") {
      void router.push({
        resource: "repo.issue",
        rid: item.card.rid,
        issue: item.issue.id,
        status: "all",
      });
    } else if (item.kind === "patch") {
      openPatch(item.patch, item.card.rid);
    } else if (!seeding.includes(item.card.rid)) {
      show({
        component: ConfirmSeedCard,
        props: {
          rid: item.card.rid,
          confirm: async () => {
            await invoke<null>("seed", { rid: item.card.rid, opts });
            void awaitCard(item);
          },
        },
      });
    }
  }

  let seeding: string[] = $state([]);

  // Keeps looking a card up after its repository was seeded, until the fetch
  // brings it in.
  async function awaitCard(item: BoardItem) {
    const rid = item.card.rid;
    if (seeding.includes(rid)) return;
    seeding = [...seeding, rid];
    try {
      for (let attempt = 0; attempt < 20; attempt++) {
        const resolved = await resolve(item.card);
        if (resolved.kind !== "unresolved") {
          foreign = new Map([...foreign, [item.key, resolved]]);
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
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

  async function addCard(card: Card, column?: Column) {
    if (!board) return;
    const first = column ?? columns.find(c => !c.closes) ?? columns[0];
    const list = grouped[first.id] ?? [];
    const { position } = dropPosition(list, list.length);
    if (!position) {
      saveError = "Couldn't add the card there. Try another spot.";
      return;
    }
    queue.enqueue(
      {
        rid: repo.rid,
        board: board.id,
        opts,
        card,
        change: { kind: "move", column: first.id, position },
      },
      board,
      manual,
    );
  }

  function removeCard(item: BoardItem) {
    if (!board) return;
    queue.enqueue(
      {
        rid: repo.rid,
        board: board.id,
        opts,
        card: item.card,
        change: { kind: "remove" },
      },
      board,
      manual,
    );
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
    void promptNewBoard(repo.rid, repoName(repo.rid));
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
    if (!board) return;
    pendingColumns = next;
    try {
      replaceBoard(
        await invoke<Board>("set_board_columns", {
          rid: repo.rid,
          board: board.id,
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
    if (!validName(name) || !column || column.name === name) return;
    void saveColumns(
      columns.map(c => (c.id === current.id ? { ...c, name } : c)),
    );
  }

  function editColumns() {
    boardMenu = undefined;
    const current = board;
    if (!current) return;
    show({
      component: BoardColumns,
      props: {
        columns,
        save: async (next: Column[]) => {
          replaceBoard(
            await invoke<Board>("set_board_columns", {
              rid: repo.rid,
              board: current.id,
              columns: next,
              opts,
            }),
          );
        },
      },
    });
  }

  function addFromRepo(column?: Column) {
    boardMenu = undefined;
    show({
      component: AddBoardCard,
      props: {
        repos: sidebarData.repos.filter(r => r.rid !== repo.rid),
        onBoard: (shownBoard?.cards ?? []).map(p => cardKey(p.card)),
        add: (card: Card) => addCard(card, column),
      },
    });
  }

  let spaceMenu:
    { x: number; y: number; target: HTMLElement; column?: Column } | undefined =
    $state();

  // Right-clicking a card opens the card's own menu instead. Right-clicking
  // in an open column adds new cards to it; a closing column would close
  // them, so those go to the first open column as usual.
  function openSpaceMenu(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-key]")) return;
    event.preventDefault();
    const id = target.closest<HTMLElement>("[data-column]")?.dataset.column;
    const column = columns.find(c => c.id === id && !c.closes);
    spaceMenu = {
      x: event.clientX,
      y: event.clientY,
      target: event.currentTarget as HTMLElement,
      column,
    };
  }

  function fromSpaceMenu(action: (column?: Column) => void) {
    const column = spaceMenu?.column;
    spaceMenu = undefined;
    action(column);
  }

  let menu:
    { item: BoardItem; x: number; y: number; target: HTMLElement } | undefined =
    $state();

  function menuFor(item: BoardItem) {
    return {
      targets: canMove(item) ? columns.filter(c => canDrop(item, c.id)) : [],
      canRemove: isDelegate && (isForeign(item) || item.kind === "unresolved"),
      canPrioritize:
        isDelegate &&
        (item.kind === "issue" || item.kind === "patch") &&
        !isForeign(item),
    };
  }

  function openContextMenu(event: MouseEvent, item: BoardItem) {
    const { targets, canRemove, canPrioritize } = menuFor(item);
    if (targets.length === 0 && !canRemove && !canPrioritize) return;
    event.preventDefault();
    menu = {
      item,
      x: event.clientX,
      y: event.clientY,
      target: event.currentTarget as HTMLElement,
    };
  }

  const display = $derived(
    dnd.current?.over !== undefined && dnd.current.index !== undefined
      ? arrange(
          applyMove(settled, {
            item: dnd.current.item,
            column: dnd.current.over,
            index: dnd.current.index,
          }),
          settings.ordering,
          settings.descending,
        )
      : settled,
  );

  const shownColumns = $derived(
    visibleColumns(columns, settings, display, dnd.current !== undefined),
  );

  const groups = $derived(
    listGroups(settings, shownColumns, display, people, allLabels),
  );

  $effect(() => {
    const refused = dnd.current?.refused !== undefined;
    document.documentElement.classList.toggle("board-drop-refused", refused);
    return () =>
      document.documentElement.classList.remove("board-drop-refused");
  });

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") dnd.onEscape(event);
  }

  function onCardClick(item: BoardItem) {
    if (dnd.suppressClick) return;
    open(item);
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
  /* Over a column that won't take the card, its content fades out behind the
     reason, so the card keeps its size. */
  .ghost > :global(*) {
    transition: opacity 150ms ease-out;
  }
  .ghost.refused > :global(:not(.refusal)) {
    opacity: 0.04;
  }
  .ghost::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    background-color: var(--color-feedback-error-bg);
    opacity: 0;
    transition: opacity 150ms ease-out;
  }
  .ghost.refused::before {
    opacity: 1;
  }
  .refusal {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0 1rem;
    text-align: center;
    font: var(--txt-body-m-regular);
    color: var(--color-feedback-error-text);
  }
  .refusal-icon {
    display: flex;
  }
  .ghost.row .refusal {
    flex-direction: row;
    gap: 0.375rem;
    font: var(--txt-body-s-regular);
  }
  .column.refused,
  .group.refused {
    opacity: 0.5;
    transition: opacity 120ms ease-out;
  }
  :global(html.board-drop-refused),
  :global(html.board-drop-refused *) {
    cursor: not-allowed !important;
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
  /* Only the cards scroll, so the scrollbar starts below the column title.
     The cards are see-through over this background, so a hovered card's
     shadow falls across its neighbours without stacking above them. Neither
     this nor the cards may be positioned: WebKit paints positioned content
     over the column's overlay scrollbar. */
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
  .add-card {
    padding: 0.5rem;
    visibility: hidden;
  }
  .column:hover .add-card:not(.hidden),
  .add-card:focus-within {
    visibility: visible;
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
     own layers from the start or the change would show late. The cards
     themselves get none: WebKit paints layers over the column's overlay
     scrollbar, and the contents stay clear of it inside the card's padding. */
  .card > :global(*),
  .row > :global(*) {
    transition: opacity 0.2s ease;
    will-change: opacity;
  }
  .nudge-source {
    visibility: hidden;
  }
  .nudge {
    position: fixed;
    border-color: transparent;
    z-index: 100;
    background-color: var(--color-surface-canvas);
    box-sizing: border-box;
    pointer-events: none;
    cursor: not-allowed;
  }
  .nudge.releasing {
    transition: transform 240ms cubic-bezier(0.3, 1.6, 0.5, 1);
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
  .no-board {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .no-board .hint {
    color: var(--color-text-tertiary);
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
  .notice.error {
    color: var(--color-feedback-error-text);
  }
  .notice .dismiss {
    margin-left: auto;
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
  .card.placeholder > :global(*),
  .row.placeholder > :global(*) {
    visibility: hidden;
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
    border: 1px solid transparent;
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
    user-select: none;
    -webkit-user-select: none;
  }
  .row.ghost {
    transform: scale(1.01);
  }
  .row.ghost.landing {
    transform: none;
  }
  .row:hover {
    background-color: var(--color-surface-subtle);
  }

  .check {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .menu-heading {
    padding: 0.25rem 0.75rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
</style>

<svelte:window
  onkeydowncapture={onWindowKeydown}
  onpointermove={e => dnd.onPointerMove(e)}
  onpointerup={() => dnd.onPointerUp()}
  onpointercancel={() => dnd.onPointerCancel()} />

{#snippet content(item: BoardItem, layout: "card" | "row")}
  <BoardCard
    {item}
    {layout}
    properties={settings.properties}
    locked={!canMove(item)}
    rid={repo.rid}
    {repoName}
    seeding={seeding.includes(item.card.rid)}
    column={layout === "row" && settings.grouping !== "status"
      ? (columns.find(c => c.id === item.column)?.name ?? "")
      : undefined}
    onOpenPatch={openPatch} />
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
        {#if isDelegate && board}
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
        {#if board}
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
            onclick={() => createIssue()}>
            <Icon name="plus" />
            <span class="global-hide-on-small-desktop-down">New issue</span>
          </Button>
        {/if}
      </div>
    </Topbar>

    {#if saveError}
      <div class="notice error">
        <Icon name="warning" />
        <span class="txt-overflow">{saveError}</span>
        <div class="dismiss">
          <Button variant="naked" onclick={() => (saveError = undefined)}>
            <Icon name="close" />
          </Button>
        </div>
      </div>
    {/if}

    {#if !board}
      <div class="no-board">
        <Icon name="dashboard" />
        <span>This repository has no board yet.</span>
        {#if isDelegate}
          <Button styleHeight="2rem" variant="secondary" onclick={newBoard}>
            <Icon name="plus" />Create board
          </Button>
        {:else}
          <span class="hint">A delegate can create one.</span>
        {/if}
      </div>
    {:else if view === "board"}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="board" bind:this={boardEl} oncontextmenu={openSpaceMenu}>
        {#each shownColumns as column (column.id)}
          <div
            class="column"
            class:lifted={dnd.liftedColumn === column.id}
            class:refused={dnd.current?.refused === column.id}
            data-column={column.id}
            animate:flip={{ duration: 200, easing: cubicOut }}>
            <div class="column-header">
              {#if renaming?.id === column.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="column-rename"
                  aria-label="Column name"
                  autofocus
                  maxlength={MAX_NAME_LENGTH}
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
                  onpointerdown={e => dnd.onTitlePointerDown(e, column)}
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
                    class:placeholder={dnd.current?.item.key === item.key}
                    class:nudge-source={dnd.nudge?.item.key === item.key}
                    title={canMove(item) ? undefined : lockedReason}
                    style:height={dnd.current?.item.key === item.key
                      ? `${dnd.current.height}px`
                      : undefined}
                    data-key={item.key}
                    role="button"
                    tabindex="0"
                    animate:flip={{ duration: 200, easing: cubicOut }}
                    in:arriveIn
                    out:filterOut
                    onpointerdown={e => dnd.onCardPointerDown(e, item)}
                    onclick={() => onCardClick(item)}
                    oncontextmenu={e => openContextMenu(e, item)}
                    onkeydown={e => {
                      if (e.key === "Enter") open(item);
                    }}>
                    {@render content(item, "card")}
                  </div>
                {/each}
              </div>
              {#if board && !column.closes}
                <div class="add-card" class:hidden={dnd.current !== undefined}>
                  <Button
                    variant="naked"
                    styleWidth="100%"
                    title={`New issue in ${column.name}`}
                    ariaLabel={`New issue in ${column.name}`}
                    onclick={() => createIssue(column)}>
                    <Icon name="plus" />
                  </Button>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <ScrollArea style="height: 100%; min-width: 0;">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="list" bind:this={listEl} oncontextmenu={openSpaceMenu}>
          {#each groups as group (group.id)}
            <section
              class="group"
              class:refused={dnd.current?.refused !== undefined &&
                dnd.current.refused === group.id}
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
                    class:placeholder={dnd.current?.item.key === item.key}
                    class:nudge-source={dnd.nudge?.item.key === item.key}
                    title={canMove(item) ? undefined : lockedReason}
                    data-key={item.key}
                    role="button"
                    tabindex="0"
                    animate:flip={{ duration: 200, easing: cubicOut }}
                    in:arriveIn
                    out:filterOut
                    onpointerdown={e => dnd.onCardPointerDown(e, item)}
                    onclick={() => onCardClick(item)}
                    oncontextmenu={e => openContextMenu(e, item)}
                    onkeydown={e => {
                      if (e.key === "Enter") open(item);
                    }}>
                    {@render content(item, "row")}
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
</Layout>

{#if dnd.current}
  {@const drag = dnd.current}
  {@const landing = dnd.landing}
  <div
    class="ghost"
    class:card={view === "board"}
    class:row={view === "list"}
    class:landing
    class:refused={drag.refused && !landing}
    style:left="{landing ? landing.x : dnd.pointer.x - drag.offsetX}px"
    style:top="{landing ? landing.y : dnd.pointer.y - drag.offsetY}px"
    style:width="{drag.width}px">
    {@render content(drag.item, view === "board" ? "card" : "row")}
    {#if drag.refused && !landing}
      <div class="refusal" transition:fade={{ duration: 150 }}>
        <span class="refusal-icon"><Icon name="warning" /></span>
        <span>{refusalFor(drag.item, drag.refused)}</span>
      </div>
    {/if}
  </div>
{/if}

{#if dnd.nudge}
  {@const nudge = dnd.nudge}
  <div
    class="nudge"
    class:card={view === "board"}
    class:row={view === "list"}
    class:releasing={nudge.releasing}
    style:left="{nudge.left}px"
    style:top="{nudge.top}px"
    style:width="{nudge.width}px"
    style:transform="translate({nudge.dx}px, {nudge.dy}px)">
    {@render content(nudge.item, view === "board" ? "card" : "row")}
  </div>
{/if}

{#if spaceMenu}
  <ContextMenu
    x={spaceMenu.x}
    y={spaceMenu.y}
    target={spaceMenu.target}
    onclose={() => (spaceMenu = undefined)}>
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => fromSpaceMenu(createIssue)}>
      <Icon name="plus" />New issue
    </button>
    {#if isDelegate}
      <div class="menu-separator"></div>
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => fromSpaceMenu(newBoard)}>
        <Icon name="dashboard" />Create board
      </button>
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => fromSpaceMenu(editColumns)}>
        <Icon name="settings" />Edit columns
      </button>
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => fromSpaceMenu(addFromRepo)}>
        <Icon name="repository" />Add card from another repository
      </button>
    {/if}
  </ContextMenu>
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
        <Icon name="plus" />Create board
      </button>
      {#if boards.length > 1}
        <button class="menu-item" role="menuitem" onclick={renameBoard}>
          <Icon name="edit" />Rename board
        </button>
      {/if}
      <button class="menu-item" role="menuitem" onclick={editColumns}>
        <Icon name="settings" />Edit columns
      </button>
      <button class="menu-item" role="menuitem" onclick={() => addFromRepo()}>
        <Icon name="repository" />Add card from another repository
      </button>
    {/if}
  </ContextMenu>
{/if}

{#if menu}
  {@const item = menu.item}
  <BoardCardMenu
    {item}
    x={menu.x}
    y={menu.y}
    target={menu.target}
    {...menuFor(item)}
    onMove={column => moveToColumn(item, column)}
    onRemove={() => removeCard(item)}
    onPriority={priority => void setPriority(item, priority)}
    onclose={() => (menu = undefined)} />
{/if}
