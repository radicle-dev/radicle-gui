import type { Board } from "@bindings/cob/board/Board";
import type { Card } from "@bindings/cob/board/Card";
import type { State } from "@bindings/cob/issue/State";

import { SvelteMap } from "svelte/reactivity";

import type { Batch, Bounds, QueuedChange } from "@app/lib/board";
import {
  baselinePlacement,
  batches,
  cardKey,
  isUnchanged,
} from "@app/lib/board";

export const FLUSH_DELAY_MS = 2500;

export interface BoardWriter {
  // Writes a batch as one operation and returns the cards whose changes the
  // backend rejected.
  update(batch: Batch, announce: boolean): Promise<Card[]>;
  setState(
    rid: string,
    oid: string,
    state: State,
    announce: boolean,
  ): Promise<void>;
  // The committed board or issues of `rid` changed underneath the queue.
  reload(rid: string): Promise<void>;
  error(message: string): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Changes wait until nothing has changed for a moment, so a burst becomes one
// operation and one update of the signed refs. Queued changes are shown on
// top of the committed board until written; entries being written keep their
// issue state until the issue's own write lands.
export class BoardQueue {
  #queued = new SvelteMap<string, QueuedChange>();
  #writing = new SvelteMap<string, QueuedChange>();
  #writer: BoardWriter;
  #delay: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #flushing: Promise<void> = Promise.resolve();

  constructor(writer: BoardWriter, delay = FLUSH_DELAY_MS) {
    this.#writer = writer;
    this.#delay = delay;
  }

  get queued(): QueuedChange[] {
    return [...this.#queued.values()];
  }

  get writing(): QueuedChange[] {
    return [...this.#writing.values()];
  }

  inFlight(key: string): QueuedChange | undefined {
    return this.#writing.get(key);
  }

  // A change that leaves the card where it stands, such as a card moved away
  // and back, drops the queued change instead of adding one.
  enqueue(
    entry: QueuedChange,
    committed: Board | undefined,
    manual: boolean,
    bounds?: Bounds,
  ) {
    const key = cardKey(entry.card);
    const placed = baselinePlacement(
      committed,
      entry.card,
      this.#writing.get(key),
    );
    if (isUnchanged(entry, placed, manual, bounds)) {
      this.#queued.delete(key);
    } else {
      this.#queued.set(key, entry);
    }
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), this.#delay);
  }

  flush(announce = true): Promise<void> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const write = () => this.#writeQueued(announce);
    this.#flushing = this.#flushing.then(write, write);
    return this.#flushing;
  }

  // Entries changed again while they were being written stay queued.
  #settle(entries: QueuedChange[]) {
    for (const entry of entries) {
      const key = cardKey(entry.card);
      if (this.#queued.get(key) === entry) this.#queued.delete(key);
    }
  }

  async #writeQueued(announce: boolean) {
    for (const batch of batches(this.queued)) {
      const { rid, entries } = batch;
      for (const entry of entries)
        this.#writing.set(cardKey(entry.card), entry);
      const announcing = announce && batch.opts.announce;

      try {
        let rejected: string[];
        try {
          const cards = await this.#writer.update(batch, announcing);
          rejected = cards.map(cardKey);
          if (cards.length === 1) {
            this.#writer.error(
              "One move wasn't saved because you don't have permission.",
            );
          } else if (cards.length > 1) {
            this.#writer.error(
              `${cards.length} moves weren't saved because you don't have permission.`,
            );
          }
        } catch (error) {
          console.error("Saving the board failed", error);
          this.#writer.error(
            `The board couldn't be saved: ${errorMessage(error)}`,
          );
          this.#settle(entries);
          await this.#writer.reload(rid);
          continue;
        }
        this.#settle(entries);

        const lifecycle = entries.filter(
          e => e.state && !rejected.includes(cardKey(e.card)),
        );
        let changed = false;
        for (const [index, entry] of lifecycle.entries()) {
          try {
            await this.#writer.setState(
              rid,
              entry.card.oid,
              entry.state!,
              announcing && index === lifecycle.length - 1,
            );
            changed = true;
          } catch (error) {
            console.error("Changing the issue's state failed", error);
            this.#writer.error(
              `An issue's state couldn't be changed: ${errorMessage(error)}`,
            );
          }
        }
        if (changed || rejected.length > 0) await this.#writer.reload(rid);
      } finally {
        for (const entry of entries) {
          const key = cardKey(entry.card);
          if (this.#writing.get(key) === entry) this.#writing.delete(key);
        }
      }
    }
  }
}
