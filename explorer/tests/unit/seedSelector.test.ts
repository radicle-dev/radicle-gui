import { beforeEach, describe, expect, test, vi } from "vitest";
import { get } from "svelte/store";

const { oak, iris, custom } = vi.hoisted(() => ({
  oak: { hostname: "oak.radicle.garden", port: 443, scheme: "https" },
  iris: { hostname: "iris.radicle.network", port: 443, scheme: "https" },
  custom: { hostname: "seed.example.com", port: 443, scheme: "https" },
}));

vi.mock("@app/lib/config", () => ({
  default: { preferredSeeds: [oak] },
}));

async function loadSeedSelector() {
  vi.resetModules();
  return import("@app/views/nodes/SeedSelector");
}

describe("dropping a retired default seed on load", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("clears a picked seed that is no longer a default", async () => {
    localStorage.setItem("selectedSeed", JSON.stringify(iris));

    const { explicitSeed, determineSeed } = await loadSeedSelector();

    expect(get(explicitSeed)).toBeUndefined();
    expect(localStorage.getItem("selectedSeed")).toBeNull();
    expect(determineSeed()).toEqual(oak);
  });

  test("keeps a picked seed that is still a default", async () => {
    localStorage.setItem("selectedSeed", JSON.stringify(oak));

    const { explicitSeed } = await loadSeedSelector();

    expect(get(explicitSeed)).toEqual(oak);
  });

  test("keeps a picked seed that is bookmarked", async () => {
    localStorage.setItem("selectedSeed", JSON.stringify(custom));
    localStorage.setItem("bookmarkedSeeds", JSON.stringify([custom]));

    const { explicitSeed, determineSeed } = await loadSeedSelector();

    expect(get(explicitSeed)).toEqual(custom);
    expect(determineSeed()).toEqual(custom);
  });

  test("keeps a bookmarked former default", async () => {
    localStorage.setItem("selectedSeed", JSON.stringify(iris));
    localStorage.setItem("bookmarkedSeeds", JSON.stringify([iris]));

    const { explicitSeed } = await loadSeedSelector();

    expect(get(explicitSeed)).toEqual(iris);
  });

  test("leaves users without a picked seed on the default", async () => {
    const { explicitSeed, determineSeed } = await loadSeedSelector();

    expect(get(explicitSeed)).toBeUndefined();
    expect(determineSeed()).toEqual(oak);
  });
});
