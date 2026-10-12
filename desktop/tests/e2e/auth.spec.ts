import {
  expect,
  gitOptions,
  test,
  useBackend,
} from "@tests/support/fixtures.js";

test("unlocks encrypted keys through the ssh-agent", async ({
  page,
  peerManager,
  sshAuthSock,
}) => {
  const peer = await peerManager.createPeer({
    name: "locked",
    gitOptions: gitOptions["bob"],
    passphrase: "asdf",
    sshAuthSock,
  });
  await peer.logOut();
  await peer.startHttpd();
  await useBackend(page, peer);

  await page.goto("/");
  await expect(page.getByText("Unlock keys")).toBeVisible();

  await page
    .getByPlaceholder("Enter passphrase to unlock your keys")
    .fill("wrong");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(
    page.getByText("Not able to decrypt keys with provided passphrase."),
  ).toBeVisible();

  await page
    .getByPlaceholder("Enter passphrase to unlock your keys")
    .fill("asdf");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Unlock keys")).toBeHidden();
});
