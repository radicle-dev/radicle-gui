import { beforeEach, expect, test, vi } from "vitest";

const key = "revisionListSettings";

const defaults = {
  sortDesc: false,
  groupByAuthor: false,
  showNumber: false,
  showStats: false,
  showReviewers: true,
};

async function load() {
  const { revisionListSettings } =
    await import("@app/lib/revisionListSettings");
  return revisionListSettings;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

test("starts with the defaults when nothing is stored", async () => {
  expect((await load()).value).toEqual(defaults);
});

test.each(Object.entries(defaults))(
  "fills in the defaults around a stored %s",
  async (setting, value) => {
    localStorage.setItem(key, JSON.stringify({ [setting]: !value }));

    expect((await load()).value).toEqual({ ...defaults, [setting]: !value });
  },
);

test("falls back to the defaults for an invalid stored value", async () => {
  localStorage.setItem(key, JSON.stringify({ sortDesc: "yes" }));

  expect((await load()).value).toEqual(defaults);
});

test("toggle flips one setting and persists it", async () => {
  const settings = await load();
  settings.toggle("showReviewers");
  settings.toggle("groupByAuthor");

  const expected = { ...defaults, showReviewers: false, groupByAuthor: true };
  expect(settings.value).toEqual(expected);
  expect(JSON.parse(localStorage.getItem(key) ?? "")).toEqual(expected);

  settings.toggle("groupByAuthor");

  expect(settings.value).toEqual({ ...defaults, showReviewers: false });
});
