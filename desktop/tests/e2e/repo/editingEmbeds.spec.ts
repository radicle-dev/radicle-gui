import type { Issue } from "@bindings/cob/issue/Issue";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { Locator, Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import { api, saveEmbed } from "@tests/support/api.js";
import { createProject } from "@tests/support/collaboration.js";
import { expect, test, waitForCommand } from "@tests/support/fixtures.js";

// An edit replaces the embed list of what it edits, so saving an edit that
// doesn't carry the earlier embeds forward drops them, while the body still
// links them.

const opts = { announce: false };

async function megaphone(page: Page, peer: RadiclePeer, rid: string) {
  const oid = await saveEmbed(
    page,
    peer,
    rid,
    "megaphone.txt",
    new TextEncoder().encode("loud"),
  );
  return {
    embed: { name: "megaphone.txt", content: `git:${oid}` },
    link: `[megaphone.txt](${oid})`,
  };
}

async function storedRevision(
  page: Page,
  peer: RadiclePeer,
  rid: string,
  patchId: string,
) {
  const revisions = (await api(page, peer, "revisions_by_patch", {
    rid,
    id: patchId,
  })) as Revision[];
  return revisions[0];
}

async function patchWithEmbed(page: Page, peer: RadiclePeer) {
  const { rid, patchId } = await createProject(peer);
  const { embed, link } = await megaphone(page, peer, rid);
  await api(page, peer, "edit_patch", {
    rid,
    cobId: patchId,
    action: {
      type: "revision.edit",
      revision: patchId,
      description: `Shout the third line\n\nReaders skim, so the key line should stand out.\n\n${link}`,
      embeds: [embed],
    },
    opts,
  });
  return { rid, patchId, embed, link };
}

async function saveEdit(page: Page, command: string, body: string) {
  await page
    .getByRole("textbox", { name: "textarea-comment" })
    .first()
    .fill(body);
  await waitForCommand(page, command, () =>
    page.getByRole("button", { name: /^Save/ }).click(),
  );
}

async function pasteFile(textarea: Locator, name: string) {
  await waitForCommand(textarea.page(), "save_embed_by_bytes", () =>
    textarea.evaluate((element, name) => {
      const clipboardData = new DataTransfer();
      clipboardData.items.add(new File(["loud"], name, { type: "text/plain" }));
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, name),
  );
  const pattern = new RegExp(`\\[${name.replace(".", "\\.")}\\]\\((\\w+)\\)`);
  await expect(textarea).toHaveValue(pattern);
  return pattern.exec(await textarea.inputValue())?.[1];
}

test("editing an issue description keeps its embeds", async ({
  page,
  peer,
}) => {
  const { rid, issueId } = await createProject(peer);
  const { embed, link } = await megaphone(page, peer, rid);
  await api(page, peer, "edit_issue", {
    rid,
    cobId: issueId,
    action: {
      type: "comment.edit",
      id: issueId,
      body: `Nobody reads them.\n\n${link}`,
      embeds: [embed],
    },
    opts,
  });

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await page.getByText("Nobody reads them.").hover();
  await page.getByTitle("Edit description").click();
  await saveEdit(page, "edit_issue", `Nobody hears them.\n\n${link}`);

  const issue = (await api(page, peer, "issue_by_id", {
    rid,
    id: issueId,
  })) as Issue;
  expect(issue.body?.edits.at(-1)?.body).toContain("Nobody hears them.");
  expect(issue.body?.embeds).toEqual([embed]);
});

test("a file attached before the issue reloads is still saved", async ({
  page,
  peer,
}) => {
  const { rid, issueId } = await createProject(peer);
  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await page.getByText("Nobody reads them.").hover();
  await page.getByTitle("Edit description").click();
  const oid = await pasteFile(
    page.getByPlaceholder("Leave your comment"),
    "notes.txt",
  );

  // Posting a comment reloads the issue while the description is being edited.
  await page.getByPlaceholder("Leave a comment").fill("Louder, please");
  await waitForCommand(page, "create_issue_comment", () =>
    page.getByRole("button", { name: /^Comment/ }).click(),
  );
  await expect(page.getByText("Louder, please")).toBeVisible();
  await waitForCommand(page, "edit_issue", () =>
    page.getByRole("button", { name: /^Save/ }).click(),
  );

  const issue = (await api(page, peer, "issue_by_id", {
    rid,
    id: issueId,
  })) as Issue;
  expect(issue.body?.embeds).toEqual([
    { name: "notes.txt", content: `git:${oid}` },
  ]);
});

test("editing a patch description keeps its embeds", async ({ page, peer }) => {
  const { rid, patchId, embed, link } = await patchWithEmbed(page, peer);

  await page.goto(`/repos/${rid}/patches/${patchId}`);
  await page.getByText("Readers skim").first().hover();
  await page.getByTitle("Edit description").first().click();
  await saveEdit(
    page,
    "edit_patch",
    `Shout the third line\n\nReaders skim, so make it loud.\n\n${link}`,
  );

  const description = (await storedRevision(page, peer, rid, patchId))
    .description;
  expect(description.at(-1)?.body).toContain("so make it loud");
  expect(description.at(-1)?.embeds).toEqual([embed]);
});

test("editing a patch description on the changes tab keeps its embeds", async ({
  page,
  peer,
}) => {
  const { rid, patchId, embed, link } = await patchWithEmbed(page, peer);

  await page.goto(`/repos/${rid}/patches/${patchId}?view=changes`);
  // The diff moves the description into place when it first renders, and a
  // click that lands during the move is dropped.
  await expect(page.locator("[data-line-type]").first()).toBeVisible();
  await page.getByText("Readers skim").hover();
  await page.getByTitle("Edit description").click();
  await saveEdit(
    page,
    "edit_patch",
    `Readers skim, so make it loud.\n\n${link}`,
  );

  const description = (await storedRevision(page, peer, rid, patchId))
    .description;
  expect(description.at(-1)?.body).toContain("so make it loud");
  expect(description.at(-1)?.embeds).toEqual([embed]);
});
