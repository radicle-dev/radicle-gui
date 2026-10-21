import {
  expect,
  sourceBrowsingUrl,
  sourceBrowsingRid,
  test,
  cobUrl,
  markdownUrl,
} from "@tests/support/fixtures.js";

// We explicitly run all clipboard tests withing the context of a single test
// so that we don't run into race conditions, because there is no way to isolate
// the clipboard in Playwright yet.
test("copy to clipboard", async ({ page, browserName, context }) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  } else if (browserName === "webkit") {
    // We aren't able to programmatically change the permissions in webkit.
    test.skip();
  }

  async function expectClipboard(content: string) {
    const clipboardContent = await page.evaluate<string>(
      "navigator.clipboard.readText()",
    );
    expect(clipboardContent).toBe(content);
  }

  await page.goto(sourceBrowsingUrl);

  // Reset system clipboard to a known state.
  await page.evaluate<string>("navigator.clipboard.writeText('')");

  // Repo ID.
  {
    await page.getByLabel("repo-id").click();
    await expectClipboard(sourceBrowsingRid);
  }

  // `rad clone` URL.
  {
    await page.getByRole("button", { name: "Clone" }).first().click();
    await page
      .locator(".cmd:has-text('rad clone')")
      .locator(".clipboard")
      .first()
      .click();
    await expectClipboard(`rad clone ${sourceBrowsingRid}`);
  }

  // `git clone` URL.
  {
    await page.getByRole("button", { name: "Git" }).click();
    await page
      .locator(".cmd:has-text('git clone')")
      .locator(".clipboard")
      .first()
      .click();
    await expectClipboard(
      `git clone http://localhost/${sourceBrowsingRid.replace(
        "rad:",
        "",
      )}.git source-browsing`,
    );
  }

  // After switching the patch or issue listing the `<Id>` components should return new COB ids.
  {
    await page.goto(`${cobUrl}/patches`);
    await page.getByRole("button", { name: "59a0821", exact: true }).click();
    await expectClipboard("59a0821edc73630bce540596cffc7854da557365");

    await page.getByRole("link", { name: "Draft" }).click();
    await page.getByRole("button", { name: "783d33c", exact: true }).click();
    await expectClipboard("783d33c5b14e13234d4d7affa98bd0b52d1b1ea3");
  }

  // Markdown code block copy.
  {
    await page.goto(`${markdownUrl}/tree/main/cheatsheet.md#code`);
    const codeBlock = page
      .locator("div.pre-wrapper")
      .filter({ hasText: "Inline `code` has `back-ticks around` it." })
      .first();
    await codeBlock.hover();
    await codeBlock.getByRole("button", { name: "Copy" }).click();
    await page.pause();
    await expectClipboard("Inline `code` has `back-ticks around` it.\n");
  }

  // Selected source lines keep their newlines, including an empty line.
  {
    await page.goto(`${markdownUrl}/tree/main/markdown-code.md#L1`);
    const from = await page.locator("#L5").getByText("```").boundingBox();
    const to = await page.locator("#L8").getByText("plain:").boundingBox();
    if (!from || !to) {
      throw new Error("source lines not rendered");
    }
    await page.mouse.move(from.x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y + to.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press("ControlOrMeta+C");
    await expectClipboard("```\n\n```\n");
  }

  // Link to a patch comment.
  {
    await page.goto(`${cobUrl}/patches`);
    await page
      .getByRole("link", { name: "Taking another stab at the README" })
      .click();
    const review = page.locator(".card", { hasText: "rejected revision" });
    const reviewId = await review.getAttribute("id");
    await review.hover();
    await review.getByRole("button", { name: "Copy link to comment" }).click();
    await expectClipboard(`${page.url()}#${reviewId}`);
  }

  // Clear the system clipboard contents so developers don't wonder why there's
  // random stuff in their clipboard after running tests.
  await page.evaluate<string>("navigator.clipboard.writeText('')");
});
