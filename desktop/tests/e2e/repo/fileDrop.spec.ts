import type { JSHandle, Locator, Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import { createProject } from "@tests/support/collaboration.js";
import { expect, test, waitForCommand } from "@tests/support/fixtures.js";

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function openIssue(page: Page, peer: RadiclePeer) {
  const { rid, issueId } = await createProject(peer);
  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await expect(page.getByText("Nobody reads them.")).toBeVisible();
  return rid;
}

function fileTransfer(
  page: Page,
  name: string,
): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(name => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["loud"], name, { type: "text/plain" }));
    return dataTransfer;
  }, name);
}

async function dropFile(target: Locator, dataTransfer: JSHandle<DataTransfer>) {
  for (const type of ["dragenter", "dragover", "drop"]) {
    await target.dispatchEvent(type, { dataTransfer });
  }
}

test("a dropped file only goes into the textarea under it", async ({
  page,
  peer,
}) => {
  await openIssue(page, peer);

  await page.getByText("Nobody reads them.").hover();
  await page.getByTitle("Edit description").click();
  const description = page.getByPlaceholder("Leave your comment");
  await expect(description).toHaveValue("Nobody reads them.");

  const composer = page.getByPlaceholder("Leave a comment");
  await waitForCommand(page, "save_embed_by_bytes", () =>
    fileTransfer(page, "notes.txt").then(transfer =>
      dropFile(composer, transfer),
    ),
  );
  await expect(composer).toHaveValue(/\[notes\.txt\]\(\w+\)/);
  await expect(description).toHaveValue("Nobody reads them.");
});

test("a file dropped while previewing is refused", async ({ page, peer }) => {
  await openIssue(page, peer);
  let uploads = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/save_embed_by_bytes") {
      uploads++;
    }
  });

  await page.getByPlaceholder("Leave a comment").fill("Draft");
  const composer = page.getByLabel("extended-textarea");
  await composer.getByRole("button", { name: "Preview" }).click();
  await dropFile(composer, await fileTransfer(page, "notes.txt"));

  await composer.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByPlaceholder("Leave a comment")).toHaveValue("Draft");
  expect(uploads).toBe(0);
});

test("the drop highlight clears once the file leaves", async ({
  page,
  peer,
}) => {
  await openIssue(page, peer);
  const transfer = await fileTransfer(page, "notes.txt");
  const composer = page.getByPlaceholder("Leave a comment");
  const highlight = page.getByText("Drop files to add them as embeds.");

  await composer.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(highlight).toBeVisible();
  // The highlight covers the textarea, so it is entered before that is left.
  await highlight.dispatchEvent("dragenter", { dataTransfer: transfer });
  await composer.dispatchEvent("dragleave", { dataTransfer: transfer });
  await expect(highlight).toBeVisible();

  await highlight.dispatchEvent("dragleave", { dataTransfer: transfer });
  await expect(highlight).toBeHidden();
});

test("a pasted image is stored as the image itself", async ({ page, peer }) => {
  const rid = await openIssue(page, peer);
  const composer = page.getByPlaceholder("Leave a comment");

  await waitForCommand(page, "save_embed_by_bytes", () =>
    composer.evaluate((textarea, png) => {
      const clipboardData = new DataTransfer();
      const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      clipboardData.items.add(
        new File([bytes], "image.png", { type: "image/png" }),
      );
      textarea.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, onePixelPng),
  );
  await expect(composer).toHaveValue(/\[image\.png\]\(\w+\)/);

  const oid = /\[image\.png\]\((\w+)\)/.exec(await composer.inputValue())?.[1];
  const response = await page.request.post(
    `http://127.0.0.1:${peer.httpdBaseUrl.port}/get_embed`,
    { data: { rid, oid, name: "image.png" } },
  );
  const body = await response.body();
  const end = body.indexOf(0);
  expect(body.subarray(0, end).toString()).toBe("image/png");
  expect(body.subarray(end + 1)).toEqual(Buffer.from(onePixelPng, "base64"));
});
