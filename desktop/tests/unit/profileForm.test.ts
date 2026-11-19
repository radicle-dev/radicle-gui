import { compareVersions, type Form, laidOver } from "@app/views/profile/form";
import { expect, test } from "vitest";

const empty: Form = {
  displayName: "",
  fullName: "",
  pronouns: "",
  bio: "",
  location: "",
  timezone: "",
  avatar: "",
  banner: "",
  links: [],
};

const loaded: Form = {
  ...empty,
  displayName: "Alice",
  bio: "Curiouser.",
  links: [{ id: 0, url: "https://alice.example", label: "Website" }],
};

test("a create form laid over an existing profile keeps what was not typed", () => {
  // Its own empty list, as a form built on its own has.
  const typed: Form = { ...empty, pronouns: "she/her", links: [] };
  const merged = laidOver(typed, loaded, empty);

  expect(merged.pronouns).toBe("she/her");
  expect(merged.displayName).toBe("Alice");
  expect(merged.bio).toBe("Curiouser.");
  expect(merged.links).toEqual(loaded.links);
});

test("typed links replace the loaded ones", () => {
  const typed: Form = {
    ...empty,
    links: [{ id: 1, url: "mailto:alice@example.com" }],
  };

  expect(laidOver(typed, loaded, empty).links).toEqual(typed.links);
});

test("a split takes one-sided changes and leaves both-sided ones to pick", () => {
  const base = { version: 1, displayName: "Alice", bio: "Curiouser." };
  const mine = { ...base, bio: "Curiouser and curiouser." };
  const theirs = {
    ...base,
    bio: "Down the rabbit hole.",
    location: "Wonderland",
  };

  expect(compareVersions(mine, theirs, base)).toEqual([
    { field: "bio", changedOn: "both" },
    { field: "location", changedOn: "theirs" },
  ]);
});

test("a split with no common version leaves every difference to pick", () => {
  const mine = { version: 1, displayName: "Alice" };
  const theirs = { version: 1, displayName: "Alice", location: "Wonderland" };

  expect(compareVersions(mine, theirs, undefined)).toEqual([
    { field: "location", changedOn: "both" },
  ]);
});
