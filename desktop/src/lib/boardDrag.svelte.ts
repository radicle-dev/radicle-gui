import type { Column } from "@bindings/cob/board/Column";

import { tick } from "svelte";

import type { BoardItem } from "@app/lib/board";

const DRAG_THRESHOLD = 4;
const LANDING_MS = 160;
const NUDGE_MAX = 24;

export interface DragHost {
  // The element the cards are dropped into; its columns carry `data-column`
  // and its cards `data-key`.
  readonly container: HTMLElement | undefined;
  // Columns side by side, else stacked groups.
  readonly horizontal: boolean;
  readonly draggable: boolean;
  readonly columns: Column[];
  readonly canReorderColumns: boolean;
  canMove(item: BoardItem): boolean;
  canDrop(item: BoardItem, column: string): boolean;
  sameSpot(item: BoardItem, column: string, index: number): boolean;
  drop(item: BoardItem, column: string, index: number): void;
  reorderColumns(columns: Column[]): void;
}

interface Grab {
  item: BoardItem;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export type Drag = Grab & {
  over: string | undefined;
  index: number | undefined;
  // The column under the pointer when it won't take the card.
  refused: string | undefined;
};

interface LockedGrab {
  item: BoardItem;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
}

export type Nudge = LockedGrab & { dx: number; dy: number; releasing: boolean };

interface ColumnGrab {
  id: string;
  x: number;
  active: boolean;
}

function layoutRect(el: Element): { x: number; y: number; rect: DOMRect } {
  const rect = el.getBoundingClientRect();
  const matrix = new DOMMatrix(getComputedStyle(el).transform);
  return { x: rect.left - matrix.m41, y: rect.top - matrix.m42, rect };
}

function rubber(distance: number): number {
  return (
    Math.sign(distance) *
    NUDGE_MAX *
    (1 - Math.exp(-Math.abs(distance) / (NUDGE_MAX * 3)))
  );
}

// Cards are dragged with a floating copy; a card the viewer can't move
// follows the pointer a little and springs back instead. Column titles drag
// the column among the visible ones.
export class BoardDrag {
  #host: DragHost;
  #pending: (Grab & { x: number; y: number }) | undefined;
  #drag: Drag | undefined = $state();
  #pointer = $state({ x: 0, y: 0 });
  #landing: { x: number; y: number } | undefined = $state();
  #suppressClick = false;
  #scrollFrame: number | undefined;
  #lockedGrab: LockedGrab | undefined;
  #nudge: Nudge | undefined = $state();
  #columnGrab: ColumnGrab | undefined = $state();
  #columnPreview: Column[] | undefined = $state();

  constructor(host: DragHost) {
    this.#host = host;
  }

  get current(): Drag | undefined {
    return this.#drag;
  }

  get pointer(): { x: number; y: number } {
    return this.#pointer;
  }

  get landing(): { x: number; y: number } | undefined {
    return this.#landing;
  }

  get nudge(): Nudge | undefined {
    return this.#nudge;
  }

  get columnPreview(): Column[] | undefined {
    return this.#columnPreview;
  }

  get liftedColumn(): string | undefined {
    return this.#columnPreview && this.#columnGrab?.id;
  }

  // Whether the click that ends a gesture should be ignored.
  get suppressClick(): boolean {
    return this.#suppressClick;
  }

  #swallowNextClick() {
    this.#suppressClick = true;
    setTimeout(() => (this.#suppressClick = false));
  }

  onCardPointerDown(event: PointerEvent, item: BoardItem) {
    if (event.button !== 0 || this.#landing || !this.#host.draggable) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!this.#host.canMove(item)) {
      this.#lockedGrab = {
        item,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };
      return;
    }
    this.#pending = {
      item,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  onTitlePointerDown(event: PointerEvent, column: Column) {
    if (!this.#host.canReorderColumns || event.button !== 0) return;
    this.#columnGrab = { id: column.id, x: event.clientX, active: false };
  }

  onPointerMove(event: PointerEvent) {
    if (this.#moveColumn(event)) return;
    if (this.#lockedGrab) {
      const dx = event.clientX - this.#lockedGrab.x;
      const dy = event.clientY - this.#lockedGrab.y;
      if (this.#nudge || Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        this.#nudge = {
          ...this.#lockedGrab,
          dx: rubber(dx),
          dy: rubber(dy),
          releasing: false,
        };
      }
      return;
    }
    if (this.#landing) return;
    this.#pointer = { x: event.clientX, y: event.clientY };
    if (this.#drag) {
      this.#updateOver();
      if (this.#scrollFrame === undefined) {
        this.#scrollFrame = requestAnimationFrame(() => this.#autoScroll());
      }
    } else if (
      this.#pending &&
      Math.hypot(
        event.clientX - this.#pending.x,
        event.clientY - this.#pending.y,
      ) > DRAG_THRESHOLD
    ) {
      this.#drag = {
        ...this.#pending,
        over: undefined,
        index: undefined,
        refused: undefined,
      };
      this.#pending = undefined;
      this.#updateOver();
    }
  }

  onPointerUp() {
    if (this.#endColumn(false)) return;
    this.#releaseNudge();
    this.#pending = undefined;
    void this.#land(false);
  }

  onPointerCancel() {
    this.#releaseNudge();
    this.#pending = undefined;
    if (!this.#landing) this.#drag = undefined;
  }

  // Whether an Escape press ended a gesture.
  onEscape(event: KeyboardEvent): boolean {
    if (this.#columnGrab) {
      event.preventDefault();
      this.#endColumn(true);
      return true;
    }
    if (this.#nudge) {
      this.#releaseNudge();
      return true;
    }
    if (this.#drag || this.#pending) {
      event.preventDefault();
      event.stopPropagation();
      this.#pending = undefined;
      void this.#land(true);
      return true;
    }
    return false;
  }

  #releaseNudge() {
    this.#lockedGrab = undefined;
    if (!this.#nudge) return;
    this.#swallowNextClick();
    const key = this.#nudge.item.key;
    this.#nudge = { ...this.#nudge, dx: 0, dy: 0, releasing: true };
    setTimeout(() => {
      if (this.#nudge?.item.key === key && this.#nudge.releasing) {
        this.#nudge = undefined;
      }
    }, 260);
  }

  #columnAt(x: number, y: number): string | undefined {
    const container = this.#host.container;
    const bounds = container?.getBoundingClientRect();
    if (!container || !bounds || y < bounds.top || y > bounds.bottom) {
      return undefined;
    }
    let nearest: { column: string; distance: number } | undefined;
    for (const el of container.querySelectorAll<HTMLElement>("[data-column]")) {
      const rect = el.getBoundingClientRect();
      const [pos, start, end] = this.#host.horizontal
        ? [x, rect.left, rect.right]
        : [y, rect.top, rect.bottom];
      const distance = pos < start ? start - pos : pos > end ? pos - end : 0;
      if (!nearest || distance < nearest.distance) {
        nearest = { column: el.dataset.column!, distance };
      }
    }
    return nearest?.column;
  }

  // The number of other cards in `column` whose middle is above the pointer,
  // ignoring any flip animation still moving them.
  #indexAt(column: string, y: number, key: string): number {
    const el = this.#host.container?.querySelector(
      `[data-column="${CSS.escape(column)}"]`,
    );
    if (!el) return 0;
    let index = 0;
    for (const card of el.querySelectorAll<HTMLElement>("[data-key]")) {
      if (card.dataset.key === key) continue;
      const { y: top, rect } = layoutRect(card);
      if (top + rect.height / 2 < y) index++;
    }
    return index;
  }

  // Only reassigning on a change keeps the columns from re-rendering on every
  // pointer move, which would restart the cards' flip animations mid-flight.
  #updateOver() {
    if (!this.#drag) return;
    const column = this.#columnAt(this.#pointer.x, this.#pointer.y);
    const allowed =
      column !== undefined && this.#host.canDrop(this.#drag.item, column);
    const over = allowed ? column : undefined;
    const refused = allowed ? undefined : column;
    const index =
      over === undefined
        ? undefined
        : this.#indexAt(over, this.#pointer.y, this.#drag.item.key);
    if (
      over !== this.#drag.over ||
      index !== this.#drag.index ||
      refused !== this.#drag.refused
    ) {
      this.#drag = { ...this.#drag, over, index, refused };
    }
  }

  #autoScroll() {
    this.#scrollFrame = undefined;
    const container = this.#host.container;
    if (!this.#drag || this.#landing || !container || !this.#host.horizontal) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const edge = 80;
    const speed =
      this.#pointer.x > rect.right - edge
        ? 12
        : this.#pointer.x < rect.left + edge
          ? -12
          : 0;
    if (speed === 0) return;
    container.scrollLeft += speed;
    this.#updateOver();
    this.#scrollFrame = requestAnimationFrame(() => this.#autoScroll());
  }

  // The column a card just left keeps its placeholder while it fades out, so
  // the slot is looked up in the column the card lands in.
  #slotPosition(): { x: number; y: number } | undefined {
    if (!this.#drag) return undefined;
    const column = this.#drag.over ?? this.#drag.item.column;
    const el = this.#host.container?.querySelector<HTMLElement>(
      `[data-column="${CSS.escape(column)}"] .placeholder`,
    );
    if (!el) return undefined;
    const { x, y } = layoutRect(el);
    return { x, y };
  }

  async #land(cancel: boolean) {
    if (!this.#drag || this.#landing) return;
    this.#swallowNextClick();

    if (cancel) {
      this.#drag = {
        ...this.#drag,
        over: undefined,
        index: undefined,
        refused: undefined,
      };
      await tick();
    }
    const slot = this.#slotPosition();
    if (slot) {
      this.#landing = slot;
      await new Promise(resolve => setTimeout(resolve, LANDING_MS));
    }

    const { item, over, index } = this.#drag;
    if (
      !cancel &&
      over !== undefined &&
      index !== undefined &&
      !this.#host.sameSpot(item, over, index)
    ) {
      this.#host.drop(item, over, index);
    }
    this.#drag = undefined;
    this.#landing = undefined;
  }

  // Moves the dragged column among the visible ones as the pointer crosses
  // their middles; hidden columns keep their place in the full order.
  #moveColumn(event: PointerEvent): boolean {
    const grab = this.#columnGrab;
    if (!grab) return false;
    const columns = this.#host.columns;
    if (!grab.active) {
      if (Math.abs(event.clientX - grab.x) < DRAG_THRESHOLD) return true;
      grab.active = true;
      this.#columnPreview = [...columns];
    }
    const others = [
      ...(this.#host.container?.querySelectorAll<HTMLElement>(
        "[data-column]",
      ) ?? []),
    ].filter(el => el.dataset.column !== grab.id);
    let index = 0;
    for (const el of others) {
      const { x, rect } = layoutRect(el);
      if (x + rect.width / 2 < event.clientX) index++;
    }
    const order = (this.#columnPreview ?? columns).filter(
      c => c.id !== grab.id,
    );
    const dragged = columns.find(c => c.id === grab.id)!;
    const anchor = others[index - 1]?.dataset.column;
    const at = anchor ? order.findIndex(c => c.id === anchor) + 1 : 0;
    const next = [...order.slice(0, at), dragged, ...order.slice(at)];
    if (next.some((c, i) => c.id !== this.#columnPreview?.[i]?.id)) {
      this.#columnPreview = next;
    }
    return true;
  }

  #endColumn(cancel: boolean): boolean {
    if (!this.#columnGrab) return false;
    const { active } = this.#columnGrab;
    this.#columnGrab = undefined;
    const next = this.#columnPreview;
    this.#columnPreview = undefined;
    if (active) {
      this.#swallowNextClick();
      if (!cancel && next) this.#host.reorderColumns(next);
    }
    return true;
  }
}
