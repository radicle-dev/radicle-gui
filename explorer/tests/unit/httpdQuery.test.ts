import { afterEach, describe, expect, test, vi } from "vitest";

import { HttpdClient } from "@http-client";

const api = new HttpdClient({
  hostname: "localhost",
  port: 8081,
  scheme: "http",
});

function captureRequestUrl(): () => string {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response("[]", { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return () => String(fetchMock.mock.calls[0][0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("search query serialization", () => {
  test("omits absent filters instead of sending them as strings", async () => {
    const requestUrl = captureRequestUrl();

    await api.repo.searchIssues("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5", {
      q: "hello",
      status: "open",
      author: undefined,
      assignee: undefined,
      label: "bug",
      page: 0,
      perPage: 10,
    });

    const params = new URLSearchParams(new URL(requestUrl()).search);
    expect(params.get("q")).toEqual("hello");
    expect(params.get("label")).toEqual("bug");
    expect(params.has("author")).toBe(false);
    expect(params.has("assignee")).toBe(false);
  });

  test("keeps falsy values that are not undefined", async () => {
    const requestUrl = captureRequestUrl();

    await api.repo.searchPatches("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5", {
      q: "",
      page: 0,
      perPage: 10,
    });

    const params = new URLSearchParams(new URL(requestUrl()).search);
    expect(params.get("q")).toEqual("");
    expect(params.get("page")).toEqual("0");
  });
});
