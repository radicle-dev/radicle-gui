import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import { api } from "@tests/support/api.js";
import {
  aliceRemote,
  expect,
  test,
  waitForCommand,
} from "@tests/support/fixtures.js";

// A profile on the peer that the page is told another controller has edited
// too. A real second version needs a second device, so the backend's answer
// gets one added on its way to the page.
async function splitProfile(
  page: Page,
  peer: RadiclePeer,
  fork: { profileNewer: boolean; otherFiles: boolean; base?: object },
) {
  await api(page, peer, "create_actor", {
    profile: { version: 1, displayName: "alice" },
    opts: { announce: false },
  });
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  await page.route(/\/actor$/, async route => {
    const response = await route.fetch();
    const actor = await response.json();
    await route.fulfill({
      response,
      json: {
        ...actor,
        forks: [
          {
            did: aliceRemote,
            head: actor.head,
            profile: { version: 1, displayName: "alice", bio: "from phone" },
            changes: [
              "--- a/.radicle/profile.json",
              "+++ b/.radicle/profile.json",
              "@@ -1,4 +1,5 @@",
              " {",
              '   "version": 1,',
              '-  "displayName": "alice"',
              '+  "displayName": "alice",',
              '+  "bio": "from phone"',
              " }",
              "",
            ].join("\n"),
            ...fork,
          },
        ],
      },
    });
  });

  await page.goto("/profile");
  await expect(page.getByText(/Also edited on/)).toBeVisible();
}

test("a split is closed by saving the profile as it is", async ({
  page,
  peer,
}) => {
  await splitProfile(page, peer, {
    profileNewer: false,
    otherFiles: true,
  });
  await expect(
    page.getByText(/also changed other files in the repository/),
  ).toBeVisible();

  await page.getByRole("button", { name: /View raw changes/ }).click();
  await expect(page.getByText('"bio": "from phone"')).toBeVisible();
  await page.keyboard.press("Escape");

  await page.unroute(/\/actor$/);
  await waitForCommand(page, "update_actor_profile", () =>
    page.getByRole("button", { name: "Save profile" }).click(),
  );

  await expect(page.getByText(/Also edited on/)).toBeHidden();
});

test("a newer version elsewhere cannot be saved over", async ({
  page,
  peer,
}) => {
  await splitProfile(page, peer, { profileNewer: true, otherFiles: false });
  await expect(
    page.getByText(/also changed other files in the repository/),
  ).toBeHidden();

  await expect(
    page.getByText(/was written by a newer Desktop, so this one cannot/),
  ).toBeVisible();
  await expect(
    page.getByText("Written by a newer Desktop", { exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeDisabled();
});

test("discarding keeps what only the other device changed", async ({
  page,
  peer,
}) => {
  await splitProfile(page, peer, {
    profileNewer: false,
    otherFiles: false,
    base: { version: 1, displayName: "alice" },
  });
  const bio = page.locator("textarea.bio");
  await expect(bio).toHaveValue("from phone");

  await page.getByRole("button", { name: "Discard" }).click();

  await expect(bio).toHaveValue("from phone");
});
