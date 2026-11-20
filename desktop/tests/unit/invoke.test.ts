import { keys } from "@radicle-gui/core/keys";
import { afterEach, describe, expect, test, vi } from "vitest";

import { invoke } from "@app/lib/invoke";
import { queryClient } from "@app/lib/query";

vi.mock("@app/lib/query", async () => {
  const { createQueryClient } =
    await import("@radicle-gui/ui/lib/query.svelte");
  return { queryClient: createQueryClient() };
});

const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const id = "d87dcfe8c2b3200e78b128d9b959cfdf7063fefe";

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateQueries.mockClear();
});

describe("invoke", () => {
  test("a write refetches what it changed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("null", { status: 200 })),
    );
    await invoke("edit_issue", { rid, cobId: id });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: keys.issue(rid, id),
    });
  });

  // A command can fail after writing part of a change.
  test("a failed write still refetches what it may have changed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(invoke("edit_issue", { rid, cobId: id })).rejects.toThrow(
      "down",
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: keys.issue(rid, id),
    });
  });

  test("a read refetches nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("null", { status: 200 })),
    );
    await invoke("issue_by_id", { rid, id });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
