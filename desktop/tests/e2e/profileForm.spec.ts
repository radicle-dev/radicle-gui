import { api } from "@tests/support/api.js";
import { expect, test, waitForCommand } from "@tests/support/fixtures.js";

test("creating a profile shows what to do next, saving one is confirmed briefly", async ({
  page,
  peer: _peer,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  await page.goto("/profile");
  await page.getByRole("button", { name: "Create a new profile" }).click();
  const field = (label: string) =>
    page.locator(".field", { hasText: label }).getByRole("textbox");

  await field("Display name").fill("Alice Liddell");
  await waitForCommand(page, "create_actor", () =>
    page.getByRole("button", { name: "Create profile" }).click(),
  );

  // A new profile is announced with how to add the other devices.
  const created = page.locator(".modal", { hasText: "Profile created" });
  await expect(created).toContainText("Alice Liddell");
  await expect(created).toContainText("Add your other devices");
  await created.getByRole("button", { name: "Go to Keys" }).click();
  await expect(page).toHaveURL(/\/profile\?tab=keys$/);
  await page.getByRole("link", { name: "Profile" }).first().click();

  await field("Full name").fill("Alice Pleasance Liddell");

  await waitForCommand(page, "update_actor_profile", () =>
    page.getByRole("button", { name: "Save profile" }).click(),
  );
  await expect(page.getByText("Saved.")).toBeVisible();

  // A save is routine, so its confirmation goes by itself.
  await expect(page.getByText("Saved.")).toBeHidden();
});

// A picture of one pixel.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("a picture chosen for the profile is saved with it and shown from then on", async ({
  page,
  peer: _peer,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  await page.goto("/profile");
  await page.getByRole("button", { name: "Create a new profile" }).click();
  const field = (label: string) =>
    page.locator(".field", { hasText: label }).getByRole("textbox");
  const avatar = page.getByLabel("avatar picture");
  // The picture itself, not the pattern shown while there is none.
  const shown = page.locator(".preview.avatar img[alt='']");
  const remove = page.getByRole("button", { name: "Remove", exact: true });
  const source = page.locator(".source");
  const unsaved = page.getByText("New picture, not saved yet");

  await field("Display name").fill("Alice Liddell");

  // A file that is no picture is not taken, whatever it is called.
  await avatar.setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a picture"),
  });
  await expect(
    page.getByText("This file is not a picture that can be shown."),
  ).toBeVisible();
  await expect(remove).toBeHidden();
  await expect(shown).toBeHidden();

  // The name it was given says nothing of what it is saved as.
  await avatar.setInputFiles({
    name: "me.jpg",
    mimeType: "image/jpeg",
    buffer: png,
  });
  await expect(shown).toBeVisible();
  await expect(remove).toBeVisible();
  await expect(unsaved).toBeVisible();

  await waitForCommand(page, "create_actor", () =>
    page.getByRole("button", { name: "Create profile" }).click(),
  );
  await page.getByRole("button", { name: "Done" }).click();

  await expect(source).toHaveText("avatar.png");
  await expect(shown).toBeVisible();
  await expect(unsaved).toBeHidden();

  // It is read back from the profile, not kept by the page.
  await page.reload();
  await expect(source).toHaveText("avatar.png");
  await expect(shown).toBeVisible();

  // A picture taken back before the save changes nothing.
  await avatar.setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: png,
  });
  await remove.click();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeDisabled();
});

test("the published history lists every version once, however its pages overlap", async ({
  page,
  peer,
}) => {
  const version = (index: number, overrides: object = {}) => ({
    commit: index.toString(16).padStart(40, "0"),
    parents: [(index + 1).toString(16).padStart(40, "0")],
    savedAt: 0,
    author: `did:key:${peer.nodeId}`,
    fields: ["bio"],
    live: true,
    ...overrides,
  });
  const versions = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, at) => version(from + at));
  // The profile moves by a whole page while the list is read, so the second
  // page holds nothing new.
  const pages: Record<number, object> = {
    0: {
      cursor: 0,
      more: true,
      content: [version(0, { live: false }), ...versions(1, 20)],
    },
    20: { cursor: 20, more: true, content: versions(0, 20) },
    40: {
      cursor: 40,
      more: false,
      content: [...versions(20, 22), version(22, { parents: [] })],
    },
  };
  const asked: number[] = [];
  await page.route(/\/actor_profile_history$/, route => {
    const { skip } = route.request().postDataJSON() as { skip: number };
    asked.push(skip);

    return route.fulfill({ json: pages[skip] });
  });
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  await page.goto("/profile");
  await page.getByRole("button", { name: "Create a new profile" }).click();
  await page
    .locator(".field", { hasText: "Display name" })
    .getByRole("textbox")
    .fill("Alice Liddell");
  await waitForCommand(page, "create_actor", () =>
    page.getByRole("button", { name: "Create profile" }).click(),
  );
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "View history" }).click();
  const rows = page.locator(".modal .entry");
  const more = page.getByRole("button", { name: "Show more" });

  await expect(rows).toHaveCount(20);
  // Only the version that waits for a controller is marked.
  await expect(page.getByText("Not the profile yet")).toHaveCount(1);
  await expect(rows.first()).toContainText("Not the profile yet");

  await more.click();
  await expect.poll(() => asked).toEqual([0, 20]);
  await expect(rows).toHaveCount(20);

  await more.click();
  await expect(rows).toHaveCount(23);
  await expect(rows.last()).toContainText("Created the profile");
  await expect(more).toBeHidden();
  expect(asked).toEqual([0, 20, 40]);
});

test("a profile this device cannot publish alone is only shown", async ({
  page,
  peer,
}) => {
  await api(page, peer, "create_actor", {
    profile: { version: 1, displayName: "alice", bio: "published" },
    opts: { announce: false },
  });
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  // A profile that takes two controllers needs a second one, so the
  // backend's answer is told to need them.
  await page.route(/\/actor$/, async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), threshold: 2 },
    });
  });
  await page.goto("/profile");

  await expect(
    page.getByText(/need 2 controllers to agree, so it is shown here/),
  ).toBeVisible();
  await expect(page.locator("textarea.bio")).toHaveValue("published");
  await expect(page.locator("textarea.bio")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeDisabled();
});

test("a device that does not control the profile is offered no edit", async ({
  page,
  peer,
}) => {
  await api(page, peer, "create_actor", {
    profile: { version: 1, displayName: "alice" },
    opts: { announce: false },
  });
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  // A key without control joins from a second device, so the backend's
  // answer is told this one has none, and that the profile names a picture.
  await page.route(/\/actor$/, async route => {
    const response = await route.fetch();
    const actor = await response.json();
    await route.fulfill({
      response,
      json: {
        ...actor,
        keys: actor.keys.map((key: object) => ({ ...key, controller: false })),
        profile: { ...actor.profile, avatar: "https://example.com/me.png" },
      },
    });
  });
  await page.goto("/profile");

  await expect(
    page.getByText(/Only a device that controls this profile can edit it/),
  ).toBeVisible();
  await expect(page.getByText("https://example.com/me.png")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" })).toBeHidden();
  await expect(page.getByText(/Everything you save here/)).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeDisabled();
});
