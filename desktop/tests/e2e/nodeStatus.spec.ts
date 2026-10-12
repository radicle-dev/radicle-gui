import { expect, test } from "@tests/support/fixtures.js";

test("shows whether the node is running", async ({ page, peer }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Online" })).toBeVisible();

  await peer.stopNode();
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
});
