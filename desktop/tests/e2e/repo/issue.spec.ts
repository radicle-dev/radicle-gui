import { cobRid, expect, test } from "@tests/support/fixtures.js";

test("navigate single issue", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues?status=all`);
  await page.getByText("This title has **markdown**").click();

  await expect(page).toHaveURL(/\/issues\/[0-9a-f]{40}/);
});

test("correct order of threads", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "cobs" }).click();
  await page.getByRole("link", { name: "Issues" }).click();
  await page.getByText("This title has **markdown**").click();
  const body = page.locator(".description-body");
  await expect(body.getByText("This is a description")).toBeVisible();

  const topLevelComments = await page.locator(".comments").all();
  expect(topLevelComments).toHaveLength(2);

  const [first, second] = topLevelComments;
  await expect(first.getByText("This is a multiline comment")).toBeVisible();
  await expect(
    first.getByText("This is a reply, to a first comment"),
  ).toBeVisible();
  await expect(
    second.getByText("A root level comment after a reply, for margins sake."),
  ).toBeVisible();
});

test("creation of top level comments", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "cobs" }).click();
  await page.getByRole("link", { name: "Issues" }).click();
  await page.getByRole("button", { name: "New" }).click();
  await page
    .getByPlaceholder("Title")
    .fill("Make sure that comment creation is working");
  await page
    .getByPlaceholder("Description")
    .fill(
      "It's important for us that the comment creation flow works as expected.",
    );
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Make sure that comment creation is working",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "It's important for us that the comment creation flow works as expected.",
    ),
  ).toBeVisible();

  await page
    .getByPlaceholder("Leave a comment")
    .fill("A top level comment by playwright");
  await page.getByRole("button", { name: /^Comment/ }).click();
  await expect(
    page.getByText("A top level comment by playwright"),
  ).toBeVisible();

  await page.getByLabel("icon-reply").first().click();
  await page
    .getByPlaceholder("Reply to comment")
    .fill(
      "A top level comment by playwright created by replying to the issue body",
    );
  await page.getByRole("button", { name: /^Reply/ }).click();
  await expect(
    page.getByText(
      "A top level comment by playwright created by replying to the issue body",
    ),
  ).toBeVisible();

  await page.getByLabel("icon-reply").click();
  await page
    .getByPlaceholder("Reply to comment")
    .fill("A reply comment by playwright replying to the first comment");
  await page.getByRole("button", { name: /^Reply/ }).click();
  await expect(
    page.getByText(
      "A reply comment by playwright replying to the first comment",
    ),
  ).toBeVisible();
});

test("create issue with only a title", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues`);
  await page.getByRole("button", { name: "New" }).click();
  const save = page.getByRole("button", { name: /^Save/ });
  await expect(save).toBeDisabled();

  await page.getByPlaceholder("Title").fill("An issue without a description");
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page).toHaveURL(/\/issues\/[0-9a-f]{40}/);
  await expect(
    page.getByRole("button", { name: "An issue without a description" }),
  ).toBeVisible();
});

test("create issue with only a title via shortcut", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues`);
  await page.getByRole("button", { name: "New" }).click();
  await page
    .getByPlaceholder("Title")
    .fill("An issue without a description via shortcut");
  await page.getByPlaceholder("Title").press("ControlOrMeta+Enter");

  await expect(page).toHaveURL(/\/issues\/[0-9a-f]{40}/);
  await expect(
    page.getByRole("button", {
      name: "An issue without a description via shortcut",
    }),
  ).toBeVisible();
});

test("shortcut does not create issue without a title", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues`);
  await page.getByRole("button", { name: "New" }).click();
  const url = page.url();

  await page.getByPlaceholder("Title").press("ControlOrMeta+Enter");
  const description = page.getByPlaceholder("Description");
  await description.fill("A description without a title");
  await description.press("ControlOrMeta+Enter");

  await page.getByRole("button", { name: "Preview" }).click();
  await page.keyboard.press("ControlOrMeta+Enter");

  await expect(page.getByText("No title.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save/ })).toBeDisabled();
  expect(page.url()).toBe(url);
});

test("shortcut does not submit an empty comment", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues?status=all`);
  await page.getByText("This title has **markdown**").click();
  const comments = page.locator(".comments");
  await expect(comments).toHaveCount(2);

  const input = page.getByPlaceholder("Leave a comment");
  await input.fill("   ");
  await input.press("ControlOrMeta+Enter");

  await expect(input).toHaveValue("   ");
  await expect(comments).toHaveCount(2);
});

test("each code block gets one copy button", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues`);
  await page.getByRole("button", { name: "New" }).click();
  await page.getByPlaceholder("Title").fill("Code blocks in two places");
  await page
    .getByPlaceholder("Description")
    .fill("First:\n\n```js\nconsole.log('one')\n```");
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(
    page.getByRole("button", { name: "Code blocks in two places" }),
  ).toBeVisible();

  // A second Markdown block on the page used to wrap the first one's code
  // again.
  await page
    .getByPlaceholder("Leave a comment")
    .fill("Second:\n\n```js\nconsole.log('two')\n```");
  await page.getByRole("button", { name: /^Comment/ }).click();

  await expect(page.locator("pre")).toHaveCount(2);
  await expect(page.locator(".pre-wrapper")).toHaveCount(2);
  await expect(page.locator(".pre-wrapper radicle-clipboard")).toHaveCount(2);
  await expect(page.locator(".pre-wrapper .pre-wrapper")).toHaveCount(0);
});
