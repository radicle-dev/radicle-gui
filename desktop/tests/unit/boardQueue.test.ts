import type { Board } from "@bindings/cob/board/Board";
import type { Card } from "@bindings/cob/board/Card";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { QueuedChange } from "@app/lib/board";
import type { BoardWriter } from "@app/lib/boardQueue.svelte";
import { BoardQueue, FLUSH_DELAY_MS } from "@app/lib/boardQueue.svelte";

const RID = "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5";
const ME = "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";

function card(oid: string): Card {
  return { rid: RID, typeName: "xyz.radicle.issue", oid };
}

function board(cards: [Card, string, string][]): Board {
  return {
    id: "board-1",
    name: "Board",
    createdAt: 0,
    columns: [
      { id: "todo", name: "Todo" },
      { id: "done", name: "Done", closes: "solved" },
    ],
    cards: cards.map(([c, column, position]) => ({
      card: c,
      column,
      position,
      movedBy: { did: ME },
      movedAt: 1,
    })),
  };
}

function move(
  c: Card,
  column: string,
  position: string,
  extra: Partial<QueuedChange> = {},
): QueuedChange {
  return {
    rid: RID,
    board: "board-1",
    opts: { announce: true },
    card: c,
    change: { kind: "move", column, position },
    ...extra,
  };
}

const a = card("aaaa");
const b = card("bbbb");
const committed = board([[a, "todo", "V"]]);

function setup(rejected: Card[] = []) {
  const writer = {
    update: vi.fn<BoardWriter["update"]>(async () => rejected),
    setState: vi.fn<BoardWriter["setState"]>().mockResolvedValue(),
    reload: vi.fn<BoardWriter["reload"]>().mockResolvedValue(),
    error: vi.fn<BoardWriter["error"]>(),
  };
  return { writer, queue: new BoardQueue(writer) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockReturnValue();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BoardQueue", () => {
  test("writes once nothing has changed for the delay", async () => {
    const { writer, queue } = setup();
    queue.enqueue(move(a, "done", "V"), committed, true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS - 1);
    expect(writer.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writer.update).toHaveBeenCalledTimes(1);
    expect(queue.queued).toEqual([]);
    expect(queue.writing).toEqual([]);
  });

  test("a later change restarts the delay and joins the batch", async () => {
    const { writer, queue } = setup();
    queue.enqueue(move(a, "done", "V"), committed, true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS - 100);
    queue.enqueue(move(b, "todo", "k"), committed, true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS - 100);
    expect(writer.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(writer.update).toHaveBeenCalledTimes(1);
    expect(writer.update.mock.calls[0][0].moves).toEqual([
      { card: a, column: "done", position: "V" },
      { card: b, column: "todo", position: "k" },
    ]);
  });

  test("the last change to a card replaces the earlier ones", async () => {
    const { writer, queue } = setup();
    queue.enqueue(move(a, "done", "V"), committed, true);
    queue.enqueue(move(a, "done", "k"), committed, true);
    expect(queue.queued).toHaveLength(1);
    await queue.flush();

    expect(writer.update).toHaveBeenCalledTimes(1);
    expect(writer.update.mock.calls[0][0].moves).toEqual([
      { card: a, column: "done", position: "k" },
    ]);
  });

  test("a change that cancels out isn't written", async () => {
    const { writer, queue } = setup();
    queue.enqueue(move(a, "done", "V"), committed, true);
    queue.enqueue(move(a, "todo", "W"), committed, true, {
      before: "M",
      after: "k",
    });
    expect(queue.queued).toEqual([]);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS);

    expect(writer.update).not.toHaveBeenCalled();
  });

  test("a change made while its card is being written stays queued", async () => {
    const { writer, queue } = setup();
    let finish: ((cards: Card[]) => void) | undefined;
    writer.update.mockImplementationOnce(
      () => new Promise(resolve => (finish = resolve)),
    );
    const first = move(a, "done", "V");
    queue.enqueue(first, committed, true);
    const flushed = queue.flush();
    await Promise.resolve();
    expect(queue.writing).toEqual([first]);
    expect(
      queue.inFlight(
        "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5/xyz.radicle.issue/aaaa",
      ),
    ).toBe(first);

    // Moving it back to where the committed board has it is still a change,
    // because the write in flight is the baseline now.
    const second = move(a, "todo", "V");
    queue.enqueue(second, committed, true);
    expect(queue.queued).toEqual([second]);

    finish?.([]);
    await flushed;
    expect(queue.writing).toEqual([]);
    expect(queue.queued).toEqual([second]);

    await queue.flush();
    expect(writer.update).toHaveBeenCalledTimes(2);
    expect(writer.update.mock.calls[1][0].entries).toEqual([second]);
    expect(queue.queued).toEqual([]);
  });

  test("flushing without announcing writes quietly", async () => {
    const { writer, queue } = setup();
    queue.enqueue(move(a, "done", "V"), committed, true);
    await queue.flush(false);
    expect(writer.update.mock.calls[0][1]).toBe(false);

    queue.enqueue(move(a, "done", "k"), committed, true);
    await queue.flush();
    expect(writer.update.mock.calls[1][1]).toBe(true);

    queue.enqueue(
      move(a, "done", "V", { opts: { announce: false } }),
      committed,
      true,
    );
    await queue.flush();
    expect(writer.update.mock.calls[2][1]).toBe(false);
  });

  test("flushing cancels the pending write and runs it now", async () => {
    const { writer, queue } = setup();
    queue.enqueue(move(a, "done", "V"), committed, true);
    await queue.flush();
    expect(writer.update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS);
    expect(writer.update).toHaveBeenCalledTimes(1);
  });

  test("states follow the board write, announced once", async () => {
    const { writer, queue } = setup();
    const solved = { status: "closed", reason: "solved" } as const;
    queue.enqueue(move(a, "done", "V", { state: solved }), committed, true);
    queue.enqueue(move(b, "done", "k", { state: solved }), committed, true);
    await queue.flush();

    expect(writer.setState.mock.calls).toEqual([
      [RID, "aaaa", solved, false],
      [RID, "bbbb", solved, true],
    ]);
    expect(writer.reload).toHaveBeenCalledWith(RID);
    expect(writer.error).not.toHaveBeenCalled();
  });

  test("a rejected card keeps its issue's state and shows an error", async () => {
    const { writer, queue } = setup([a]);
    const solved = { status: "closed", reason: "solved" } as const;
    queue.enqueue(move(a, "done", "V", { state: solved }), committed, true);
    queue.enqueue(move(b, "done", "k", { state: solved }), committed, true);
    await queue.flush();

    expect(writer.setState.mock.calls).toEqual([[RID, "bbbb", solved, true]]);
    expect(writer.error).toHaveBeenCalledWith(
      "One move wasn't saved because you don't have permission.",
    );
    expect(writer.reload).toHaveBeenCalledTimes(1);
    expect(queue.queued).toEqual([]);
    expect(queue.writing).toEqual([]);
  });

  test("a failed board write drops the batch and reloads", async () => {
    const { writer, queue } = setup();
    writer.update.mockRejectedValueOnce(new Error("boom"));
    queue.enqueue(
      move(a, "done", "V", { state: { status: "closed", reason: "solved" } }),
      committed,
      true,
    );
    await queue.flush();

    expect(writer.error).toHaveBeenCalledWith(
      "The board couldn't be saved: boom",
    );
    expect(writer.setState).not.toHaveBeenCalled();
    expect(writer.reload).toHaveBeenCalledWith(RID);
    expect(queue.queued).toEqual([]);
    expect(queue.writing).toEqual([]);
  });

  test("a failed state change is reported without a reload", async () => {
    const { writer, queue } = setup();
    writer.setState.mockRejectedValueOnce(new Error("nope"));
    queue.enqueue(
      move(a, "done", "V", { state: { status: "closed", reason: "solved" } }),
      committed,
      true,
    );
    await queue.flush();

    expect(writer.error).toHaveBeenCalledWith(
      "An issue's state couldn't be changed: nope",
    );
    expect(writer.reload).not.toHaveBeenCalled();
  });
});
