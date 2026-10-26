import type { Page } from "@playwright/test";
import { test, expect, markdownUrl } from "@tests/support/fixtures.js";

async function goToSection(section: string, page: Page) {
  await page.goto(`${markdownUrl}/tree/main/cheatsheet.md`, {
    waitUntil: "networkidle",
  });
  await page.locator(`[href="${section}"]`).click();
}

test.describe("markdown rendering basics", async () => {
  test.use({ viewport: { width: 1600, height: 1200 } });

  test("table of contents", async ({ page }) => {
    await page.goto(
      `${markdownUrl}/tree/main/cheatsheet.md#table-of-contents`,
      {
        waitUntil: "networkidle",
      },
    );
    await expect(page.getByText("Table of Contents")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("headers", async ({ page }) => {
    await goToSection("#headers", page);
    await expect(page.getByText("###### H6")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("emphasis", async ({ page }) => {
    await goToSection("#emphasis", page);
    await expect(page.getByText("Emphasis, aka").first()).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("lists", async ({ page }) => {
    await goToSection("#lists", page);
    await expect(page.getByText("First ordered list").first()).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("links", async ({ page }) => {
    await goToSection("#links", page);
    await expect(page.getByText("There are two ways")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("images", async ({ page }) => {
    await goToSection("#images", page);
    await expect(page.getByText("Here's our logo").first()).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("code and syntax highlighting", async ({ page }) => {
    await goToSection("#code", page);
    await expect(page.getByText("Code blocks are part")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("code clipboard icon on hover", async ({ page }) => {
    await goToSection("#code", page);
    const codeBlock = page
      .locator("div.pre-wrapper")
      .filter({ hasText: "Inline `code` has `back-ticks" });
    await expect(
      codeBlock.locator("radicle-clipboard > .clipboard"),
    ).toBeHidden();
    await codeBlock.hover();
    await expect(page).toHaveScreenshot();
  });

  test("tables", async ({ page }) => {
    await goToSection("#tables", page);
    await expect(page.getByText("Tables aren't part of the")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("blockquotes", async ({ page }) => {
    await goToSection("#blockquotes", page);
    await expect(page.getByText("Blockquotes are").first()).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("inline HTML", async ({ page }) => {
    await goToSection("#html", page);
    await expect(page.getByText("You can also use raw HTML")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("horizontal rule", async ({ page }) => {
    await goToSection("#hr", page);
    await expect(page.getByText("Three or more...").first()).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("line breaks", async ({ page }) => {
    await goToSection("#lines", page);
    await expect(page.getByText("My basic recommendation")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test("videos", async ({ page }) => {
    await goToSection("#videos", page);
    await expect(page.getByText("They can't be added")).toBeVisible();
    await expect(page).toHaveScreenshot();
  });
});

test("footnotes", async ({ page }) => {
  await page.goto(`${markdownUrl}/tree/main/footnotes.md#footnotes`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({ fullPage: true });

  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("math", async ({ page }) => {
  await page.goto(`${markdownUrl}/tree/main/math.md`, {
    waitUntil: "networkidle",
  });
  await expect(page.getByText("The Cauchy-Schwarz Inequality")).toBeVisible();
  await expect(
    page.locator(".katex-display .katex-html").first(),
  ).toBeVisible();
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("mermaid diagrams", async ({ page }) => {
  await page.goto(`${markdownUrl}/tree/main/mermaid.md`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator(".mermaid-diagram svg")).toHaveCount(2);
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("broken mermaid shows warning and does not block subsequent diagrams", async ({
  page,
}) => {
  await page.goto(`${markdownUrl}/tree/main/mermaid-broken.md`, {
    waitUntil: "networkidle",
  });
  // Our custom warning replaces mermaid's built-in error overlay.
  await expect(page.locator(".mermaid-error")).toBeVisible();
  // The original source for the broken diagram stays visible.
  await expect(page.locator("pre code.language-mermaid")).toBeVisible();
  // The valid diagram following the broken one still renders.
  await expect(page.locator(".mermaid-diagram svg")).toHaveCount(1);
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("relative image not able to being loaded", async ({ page }) => {
  await page.goto(`${markdownUrl}/tree/main/loading-image.md`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("underline links that contain emojis", async ({ page }) => {
  await page.goto(`${markdownUrl}/tree/main/link-files.md`);
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("markdown in issues is not overflowing", async ({ page }) => {
  await page.goto(`${markdownUrl}/issues`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("link", { name: "This title has **markdown**" }).click();
  await expect(page).toHaveScreenshot({ fullPage: true });
});
