import type { RepoSummary } from "@bindings/repo/RepoSummary";

interface Options {
  pinnedRepos: () => RepoSummary[];
  getOrder: () => string[];
  setOrder: (rids: string[]) => void;
}

export const PINNED_LIST_CLASS = "pinned-list";
export const DRAG_RID_ATTRIBUTE = "data-drag-rid";

const THRESHOLD_PX = 4;
const BODY_DRAGGING_CLASS = "dragging-pinned-repo";

export default function usePinnedDragReorder(options: Options) {
  let dragStart: { rid: string; x: number; y: number } | undefined;
  let suppressClick = false;
  let draggingRid = $state<string | undefined>(undefined);
  let dropTargetRid = $state<string | undefined>(undefined);
  let dropPosition = $state<"before" | "after" | undefined>(undefined);
  let ghostX = $state(0);
  let ghostY = $state(0);

  const draggedRepo = $derived(
    draggingRid !== undefined
      ? options.pinnedRepos().find(r => r.rid === draggingRid)
      : undefined,
  );

  $effect(() => {
    if (draggingRid !== undefined) {
      document.body.classList.add(BODY_DRAGGING_CLASS);
      return () => document.body.classList.remove(BODY_DRAGGING_CLASS);
    }
  });

  $effect(() => {
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  });

  function onMouseDown(e: MouseEvent, rid: string) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, .clipboard")) return;
    suppressClick = false;
    dragStart = { rid, x: e.clientX, y: e.clientY };
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
  }

  function onWindowMouseMove(e: MouseEvent) {
    if (!dragStart) return;
    if (!draggingRid) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.hypot(dx, dy) < THRESHOLD_PX) return;
      draggingRid = dragStart.rid;
    }
    ghostX = e.clientX;
    ghostY = e.clientY;
    updateDropTarget(e.clientX, e.clientY);
  }

  function updateDropTarget(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const list = el?.closest(`.${PINNED_LIST_CLASS}`) as HTMLElement | null;
    if (!list) {
      dropTargetRid = undefined;
      dropPosition = undefined;
      return;
    }
    let row = el?.closest(`[${DRAG_RID_ATTRIBUTE}]`) as HTMLElement | null;
    if (!row) {
      const rows = Array.from(
        list.querySelectorAll(`[${DRAG_RID_ATTRIBUTE}]`),
      ) as HTMLElement[];
      let nearestDistance = Infinity;
      for (const r of rows) {
        const rect = r.getBoundingClientRect();
        const distance = Math.abs(y - (rect.top + rect.height / 2));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          row = r;
        }
      }
    }
    if (!row) return;
    const rid = row.getAttribute(DRAG_RID_ATTRIBUTE);
    if (!rid) return;
    const rect = row.getBoundingClientRect();
    dropTargetRid = rid;
    dropPosition = y - rect.top < rect.height / 2 ? "before" : "after";
  }

  function onWindowMouseUp() {
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);

    const dragging = draggingRid;
    const target = dropTargetRid;
    const position = dropPosition;

    if (dragging && target && position && dragging !== target) {
      const without = options.getOrder().filter(r => r !== dragging);
      const targetIdx = without.indexOf(target);
      if (targetIdx !== -1) {
        const insertAt = position === "after" ? targetIdx + 1 : targetIdx;
        without.splice(insertAt, 0, dragging);
        options.setOrder(without);
      }
    }

    suppressClick = dragging !== undefined;
    dragStart = undefined;
    draggingRid = undefined;
    dropTargetRid = undefined;
    dropPosition = undefined;
  }

  function onClick(e: MouseEvent) {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    }
  }

  return {
    get draggingRid() {
      return draggingRid;
    },
    get dropTargetRid() {
      return dropTargetRid;
    },
    get dropPosition() {
      return dropPosition;
    },
    get draggedRepo() {
      return draggedRepo;
    },
    get ghostX() {
      return ghostX;
    },
    get ghostY() {
      return ghostY;
    },
    onMouseDown,
    onClick,
  };
}
