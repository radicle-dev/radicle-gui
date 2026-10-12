import type { Comment } from "@bindings/cob/thread/Comment";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import * as issue from "@tests/support/cobs/issue.js";
import * as patch from "@tests/support/cobs/patch.js";
import {
  clone,
  createCollaborators,
  createProject,
} from "@tests/support/collaboration.js";
import {
  expect,
  goto,
  reload,
  test,
  useBackend,
  waitForCommand,
} from "@tests/support/fixtures.js";

const taskList =
  "Before the release:\n\n- [ ] Check the tone\n- [ ] Ask a reader";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function api(page: Page, peer: RadiclePeer, command: string, data: object) {
  return page.request
    .post(`http://127.0.0.1:${peer.httpdBaseUrl.port}/${command}`, { data })
    .then(response => response.json());
}

async function saveEmbed(
  page: Page,
  peer: RadiclePeer,
  rid: string,
  name: string,
  bytes: Uint8Array,
) {
  const response = await page.request.post(
    `http://127.0.0.1:${peer.httpdBaseUrl.port}/save_embed_by_bytes`,
    {
      headers: { rid, "Content-Type": "application/octet-stream" },
      data: Buffer.concat([Buffer.from(`${name}\0`), bytes]),
    },
  );
  return (await response.json()) as string;
}

async function createComment(
  page: Page,
  peer: RadiclePeer,
  rid: string,
  issueId: string,
  body: string,
  embedOid?: string,
  replyTo?: string,
) {
  return (await api(page, peer, "create_issue_comment", {
    rid,
    new: {
      id: issueId,
      body: embedOid ? `${body}\n\n[megaphone.txt](${embedOid})` : body,
      embeds: embedOid
        ? [{ name: "megaphone.txt", content: `git:${embedOid}` }]
        : [],
      replyTo,
    },
    opts: { announce: false },
  })) as Comment;
}

async function storedComment(
  page: Page,
  peer: RadiclePeer,
  rid: string,
  issueId: string,
  text: string,
) {
  const threads = (await api(page, peer, "comment_threads_by_issue_id", {
    rid,
    id: issueId,
  })) as Thread[];
  return threads
    .flatMap(thread => [thread.root, ...thread.replies])
    .find(comment => comment.edits.at(-1)?.body.includes(text));
}

async function createTaskIssue(peer: RadiclePeer, description = taskList) {
  const { rid, repoFolder } = await createProject(peer);
  const issueId = await issue.create(peer, "Tidy the notes", description, [], {
    cwd: repoFolder,
  });
  return { rid, issueId, repoFolder };
}

async function openTaskIssue(
  page: Page,
  peer: RadiclePeer,
  description = taskList,
) {
  const { rid, issueId } = await createTaskIssue(peer, description);
  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await expect(page.getByText("Before the release:")).toBeVisible();
}

test("ticking a task in an issue description is saved", async ({
  page,
  peer,
}) => {
  await openTaskIssue(page, peer);

  const tone = page.getByRole("checkbox", { name: "Check the tone" });
  const reader = page.getByRole("checkbox", { name: "Ask a reader" });
  await expect(tone).not.toBeChecked();

  await waitForCommand(page, "edit_issue", () => tone.press("Space"));
  await expect(tone).toBeChecked();
  await expect(tone).toBeFocused();

  await reload(page);
  await expect(tone).toBeChecked();
  await expect(reader).not.toBeChecked();

  await waitForCommand(page, "edit_issue", () => tone.click());
  await reload(page);
  await expect(tone).not.toBeChecked();
});

test("a task that fails to save is unticked again", async ({ page, peer }) => {
  await openTaskIssue(page, peer);
  let release: (() => void) | undefined;
  const released = new Promise<void>(resolve => (release = resolve));
  await page.route("**/edit_issue", async route => {
    await released;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "Unknown", message: "Not saved" }),
    });
  });

  const tone = page.getByRole("checkbox", { name: "Check the tone" });
  await tone.click();
  await expect(tone).toBeChecked();
  release?.();
  await expect(tone).not.toBeChecked();
});

test("emojis stay rendered after ticking a task", async ({ page, peer }) => {
  await openTaskIssue(page, peer, `${taskList}\n\nParty after 🎉`);
  const party = page.getByRole("img", { name: "🎉" });
  await expect(party).toBeVisible();

  await waitForCommand(page, "edit_issue", () =>
    page.getByRole("checkbox", { name: "Check the tone" }).click(),
  );
  await expect(
    page.getByRole("checkbox", { name: "Check the tone" }),
  ).toBeChecked();
  await expect(party).toBeVisible();
});

test("ticking a task doesn't load the embeds again", async ({ page, peer }) => {
  const { rid, repoFolder } = await createProject(peer);
  const oid = await saveEmbed(page, peer, rid, "dot.png", onePixelPng);
  const issueId = await issue.create(
    peer,
    "Tidy the notes",
    `${taskList}\n\n[dot.png](${oid})`,
    [],
    { cwd: repoFolder },
  );
  let loads = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/get_embed") {
      loads++;
    }
  });

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  const preview = page.locator('img[src^="blob:"]');
  await expect(preview).toBeVisible();
  expect(loads).toBe(1);

  const tone = page.getByRole("checkbox", { name: "Check the tone" });
  await waitForCommand(page, "edit_issue", () => tone.click());
  await expect(tone).toBeChecked();
  await expect(preview).toBeVisible();
  expect(loads).toBe(1);
});

test("ticking a task in a comment keeps the comment's embeds", async ({
  page,
  peer,
}) => {
  const { rid, issueId } = await createTaskIssue(peer);
  const oid = await saveEmbed(
    page,
    peer,
    rid,
    "megaphone.txt",
    new TextEncoder().encode("loud"),
  );
  await createComment(
    page,
    peer,
    rid,
    issueId,
    "Before the meeting:\n\n- [ ] Bring a megaphone",
    oid,
  );

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  const megaphone = page.getByRole("checkbox", { name: "Bring a megaphone" });
  await waitForCommand(page, "edit_issue", () => megaphone.click());
  await expect(megaphone).toBeChecked();

  const comment = await storedComment(
    page,
    peer,
    rid,
    issueId,
    "Bring a megaphone",
  );
  expect(comment?.edits.at(-1)?.body).toContain("- [x] Bring a megaphone");
  expect(comment?.embeds).toEqual([
    { name: "megaphone.txt", content: `git:${oid}` },
  ]);
});

test("ticking a task in a reply keeps the reply's embeds", async ({
  page,
  peer,
}) => {
  const { rid, issueId } = await createTaskIssue(peer);
  const oid = await saveEmbed(
    page,
    peer,
    rid,
    "megaphone.txt",
    new TextEncoder().encode("loud"),
  );
  const root = await createComment(page, peer, rid, issueId, "Who brings it?");
  await createComment(
    page,
    peer,
    rid,
    issueId,
    "- [ ] Bring a megaphone",
    oid,
    root.id,
  );

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  const megaphone = page.getByRole("checkbox", { name: "Bring a megaphone" });
  await waitForCommand(page, "edit_issue", () => megaphone.click());
  await expect(megaphone).toBeChecked();

  const reply = await storedComment(
    page,
    peer,
    rid,
    issueId,
    "Bring a megaphone",
  );
  expect(reply?.replyTo).toBe(root.id);
  expect(reply?.embeds).toEqual([
    { name: "megaphone.txt", content: `git:${oid}` },
  ]);
});

test("editing a comment keeps its embeds", async ({ page, peer }) => {
  const { rid, issueId } = await createTaskIssue(peer);
  const oid = await saveEmbed(
    page,
    peer,
    rid,
    "megaphone.txt",
    new TextEncoder().encode("loud"),
  );
  await createComment(page, peer, rid, issueId, "Bring a megaphone", oid);

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await page.getByText("Bring a megaphone").hover();
  const toggle = page.getByTitle("Comment actions").last();
  await toggle.click();
  await toggle
    .locator(`xpath=following::*[@role="button"][normalize-space()="Edit"][1]`)
    .click();
  await page
    .getByPlaceholder("Leave a comment")
    .first()
    .fill(`Bring two megaphones\n\n[megaphone.txt](${oid})`);
  await waitForCommand(page, "edit_issue", () =>
    page.getByRole("button", { name: /^Save/ }).click(),
  );

  const comment = await storedComment(
    page,
    peer,
    rid,
    issueId,
    "Bring two megaphones",
  );
  expect(comment?.embeds).toEqual([
    { name: "megaphone.txt", content: `git:${oid}` },
  ]);
});

test("a contributor can't tick tasks in someone else's issue", async ({
  page,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid, issueId, repoFolder } = await createTaskIssue(bob);
  await bob.rad(
    [
      "issue",
      "comment",
      issueId,
      "--message",
      "Before the meeting:\n\n- [ ] Bring a megaphone",
      "--quiet",
    ],
    { cwd: repoFolder },
  );
  await clone(eve, rid);
  await eve.startHttpd();
  await useBackend(page, eve);

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await expect(page.getByText("Check the tone")).toBeVisible();
  await expect(page.getByText("Bring a megaphone")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

async function createTaskPatch(peer: RadiclePeer) {
  const { rid, repoFolder } = await createProject(peer);
  const notes = Path.join(repoFolder, "notes.txt");
  const patchId = await patch.create(
    peer,
    ["Quiet the notes"],
    "feature/quiet",
    () => Fs.writeFile(notes, "one\n"),
    ["Quiet the notes", "- [ ] Lower the volume"],
    { cwd: repoFolder },
  );
  await Fs.writeFile(notes, "one\ntwo\n");
  await peer.git(["commit", "-am", "Keep the second line"], {
    cwd: repoFolder,
  });
  // Push options can't hold line breaks, so each task is its own message.
  await peer.git(
    [
      "push",
      "-o",
      "patch.message=Quieter after all",
      "-o",
      "patch.message=- [ ] Check the tone",
      "-o",
      "patch.message=- [ ] Ask a reader",
      "rad",
      `HEAD:refs/heads/patches/${patchId}`,
    ],
    { cwd: repoFolder },
  );
  await peer.rad(
    [
      "patch",
      "review",
      patchId,
      "--message=Before merging:\n\n- [ ] Rename the file",
      "--accept",
    ],
    { cwd: repoFolder },
  );
  return { rid, patchId };
}

async function openTaskPatch(page: Page, peer: RadiclePeer, query = "") {
  const { rid, patchId } = await createTaskPatch(peer);
  await page.goto(`/repos/${rid}/patches/${patchId}${query}`);
  await expect(page.getByText("Quieter after all").first()).toBeVisible();
}

test("ticking a task in a patch description is saved", async ({
  page,
  peer,
}) => {
  await openTaskPatch(page, peer);

  const volume = page.getByRole("checkbox", { name: "Lower the volume" });
  await waitForCommand(page, "edit_patch", () => volume.click());
  await expect(volume).toBeChecked();

  await reload(page);
  await expect(volume).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Check the tone" }),
  ).not.toBeChecked();
});

test("ticking a task in a revision keeps its subject", async ({
  page,
  peer,
}) => {
  await openTaskPatch(page, peer);

  const tone = page.getByRole("checkbox", { name: "Check the tone" });
  await waitForCommand(page, "edit_patch", () => tone.click());
  await expect(tone).toBeChecked();

  await reload(page);
  await expect(tone).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Ask a reader" }),
  ).not.toBeChecked();
  await expect(page.getByText("Quieter after all").first()).toBeVisible();
});

test("ticking a task on the changes tab is saved", async ({ page, peer }) => {
  await openTaskPatch(page, peer, "?view=changes");

  const reader = page.getByRole("checkbox", { name: "Ask a reader" });
  await waitForCommand(page, "edit_patch", () => reader.click());
  await expect(reader).toBeChecked();

  await reload(page);
  await expect(reader).toBeChecked();
});

test("ticking a task in your own review summary keeps the verdict", async ({
  page,
  peer,
}) => {
  await openTaskPatch(page, peer);

  const rename = page.getByRole("checkbox", { name: "Rename the file" });
  await waitForCommand(page, "edit_patch", () => rename.click());
  await expect(rename).toBeChecked();

  await reload(page);
  await expect(rename).toBeChecked();
  await expect(page.getByText("Accepted").first()).toBeVisible();
});

test("a contributor can't tick tasks in someone else's patch", async ({
  page,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid, patchId } = await createTaskPatch(bob);
  await clone(eve, rid);
  await eve.startHttpd();
  await useBackend(page, eve);

  await page.goto(`/repos/${rid}/patches/${patchId}`);
  await expect(
    page.getByText("Lower the volume", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Check the tone", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rename the file", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  await goto(page, `/repos/${rid}/patches/${patchId}?view=changes`);
  await expect(page.getByText("Ask a reader", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
