import { expect, markdownRid, test } from "@tests/support/fixtures.js";
import { chromium } from "playwright";

// We explicitly run all clipboard tests within the context of a single test
// so that we don't run into race conditions, because there is no way to isolate
// the clipboard in Playwright yet.
test("copy to clipboard", async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();

  await page.goto("/inbox");

  // Reset system clipboard to a known state.
  await page.evaluate<string>("navigator.clipboard.writeText('')");

  // Repo ID.
  {
    const repoLink = page.getByRole("link", { name: "markdown" });
    await repoLink.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy RID" }).click();
    const clipboardContent = await page.evaluate<string>(
      "navigator.clipboard.readText()",
    );
    expect(clipboardContent).toBe(markdownRid);
  }

  // Clear the system clipboard contents so developers don't wonder why there's
  // random stuff in their clipboard after running tests.
  await page.evaluate<string>("navigator.clipboard.writeText('')");
});
