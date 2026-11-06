import { type Form, laidOver } from "@app/views/profile/form";
import { expect, test } from "vitest";

const empty: Form = {
  displayName: "laptop",
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
