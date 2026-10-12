import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Request = { id: number; patch: string; cacheKeyPrefix?: string };

// Stands in for the parse worker. Tests decide how each instance behaves.
class FakeWorker {
  static instances: FakeWorker[] = [];
  static failToStart = false;

  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  requests: Request[] = [];

  constructor() {
    if (FakeWorker.failToStart) throw new Error("no workers here");
    FakeWorker.instances.push(this);
  }

  postMessage(request: Request) {
    this.requests.push(request);
  }

  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}

const processPatch = vi.fn((patch: string) => ({
  files: [{ name: `main-thread:${patch}` }],
}));

vi.mock("@app/lib/pierreParse.worker?worker", () => ({ default: FakeWorker }));
vi.mock("@pierre/diffs", () => ({ processPatch }));

async function load() {
  vi.resetModules();
  return (await import("@app/lib/pierreParse")).parsePatch;
}

// Lets the worker receive the request before the test replies.
async function tick() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failToStart = false;
  processPatch.mockClear();
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parsePatch", () => {
  test("parses in the worker", async () => {
    const parsePatch = await load();
    const result = parsePatch("patch", "rev1");
    await tick();
    const [worker] = FakeWorker.instances;
    const [request] = worker.requests;
    expect(request).toMatchObject({ patch: "patch", cacheKeyPrefix: "rev1" });

    worker.reply({ id: request.id, files: [{ name: "from-worker" }] });

    expect(await result).toEqual([{ name: "from-worker" }]);
    expect(processPatch).not.toHaveBeenCalled();
  });

  test("routes out-of-order replies to the right request", async () => {
    const parsePatch = await load();
    const first = parsePatch("one");
    const second = parsePatch("two");
    await tick();
    const [worker] = FakeWorker.instances;
    const [a, b] = worker.requests;

    worker.reply({ id: b.id, files: [{ name: "two" }] });
    worker.reply({ id: a.id, files: [{ name: "one" }] });

    expect(await first).toEqual([{ name: "one" }]);
    expect(await second).toEqual([{ name: "two" }]);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  test("parses on the main thread when the worker can't start", async () => {
    FakeWorker.failToStart = true;
    const parsePatch = await load();

    expect(await parsePatch("patch", "rev1")).toEqual([
      { name: "main-thread:patch" },
    ]);
    expect(processPatch).toHaveBeenCalledWith("patch", "rev1");
  });

  test("falls back to the main thread when the worker reports an error", async () => {
    const parsePatch = await load();
    const result = parsePatch("patch");
    await tick();
    const [worker] = FakeWorker.instances;

    worker.reply({ id: worker.requests[0].id, error: "bad patch" });

    expect(await result).toEqual([{ name: "main-thread:patch" }]);
  });

  test("a crashed worker fails over its pending requests and is not reused", async () => {
    const parsePatch = await load();
    const pending = parsePatch("one");
    await tick();
    const [worker] = FakeWorker.instances;

    worker.onerror?.({ message: "crashed" });

    expect(await pending).toEqual([{ name: "main-thread:one" }]);
    expect(await parsePatch("two")).toEqual([{ name: "main-thread:two" }]);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  test("ignores replies for unknown requests", async () => {
    const parsePatch = await load();
    const result = parsePatch("patch");
    await tick();
    const [worker] = FakeWorker.instances;

    worker.reply({ id: 999, files: [{ name: "stray" }] });
    worker.reply({ id: worker.requests[0].id, files: [{ name: "real" }] });

    expect(await result).toEqual([{ name: "real" }]);
  });
});
