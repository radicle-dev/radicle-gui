import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import {
  expect,
  gitOptions,
  test,
  useBackend,
} from "@tests/support/fixtures.js";

test("explains why an alias is invalid", async ({ page }) => {
  await page.route(
    url => url.pathname === "/startup",
    route =>
      route.fulfill({
        status: 500,
        json: {
          code: "IdentityError.MissingProfile",
          message: "No profile found",
        },
      }),
  );
  await page.goto("/");

  const alias = page.getByPlaceholder("Enter desired alias");
  await alias.fill("has space");
  await expect(
    page.getByText("Alias cannot contain whitespace."),
  ).toBeVisible();

  await alias.fill("a".repeat(33));
  await expect(
    page.getByText("Alias is too long, max 32 characters."),
  ).toBeVisible();
  await expect(page.getByText("Alias cannot contain whitespace.")).toBeHidden();

  await alias.fill("alice");
  await expect(
    page.getByText("Max 32 characters, no whitespace."),
  ).toBeVisible();
});

test("creates an identity and opens the guide", async ({
  page,
  peerManager,
  sshAuthSock,
  stateDir,
}) => {
  const peer = await peerManager.createPeer({
    name: "newcomer",
    gitOptions: gitOptions["alice"],
    sshAuthSock,
  });
  // Start from a node that has never had an identity.
  const home = Path.join(stateDir, "peers", "newcomer", "home");
  await Fs.rm(home, { recursive: true, force: true });
  await Fs.mkdir(home, { recursive: true });
  await peer.startHttpd();
  await useBackend(page, peer);

  await page.goto("/");
  await page.getByPlaceholder("Enter desired alias").fill("newcomer");
  await page
    .getByPlaceholder("Enter passphrase to protect your keys")
    .fill("secret");
  await page.getByPlaceholder("Repeat passphrase").fill("secret");
  await page.getByRole("button", { name: /Create new identity/ }).click();

  await expect(page).toHaveURL(/\/guide/);
  await expect(page.getByText("newcomer").first()).toBeVisible();
});
