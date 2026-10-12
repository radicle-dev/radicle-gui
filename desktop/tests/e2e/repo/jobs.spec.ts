import type { RadiclePeer } from "@tests/support/peerManager.js";

import { expect, test } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";
import { radJobBinary } from "@tests/support/support.js";

async function recordRun(
  peer: RadiclePeer,
  repoFolder: string,
  head: string,
  log: string,
  outcome: "succeeded" | "failed" | "started",
) {
  const job = (args: string[]) =>
    peer.spawn(radJobBinary, ["--no-sync", ...args], { cwd: repoFolder });
  const { stdout: runId } = await job(["run", head, log]);
  if (outcome !== "started") {
    await job([outcome, head, runId.trim()]);
  }
}

test("CI runs are summarised and link to their logs", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder } = await createRepo(peer, { name: "ci" });
  const { stdout: head } = await peer.git(["rev-parse", "HEAD"], {
    cwd: repoFolder,
  });
  await peer.spawn(radJobBinary, ["--no-sync", "new", head.trim()], {
    cwd: repoFolder,
  });
  await recordRun(
    peer,
    repoFolder,
    head.trim(),
    "https://ci.example.com/runs/passing",
    "succeeded",
  );
  await recordRun(
    peer,
    repoFolder,
    head.trim(),
    "https://github.com/o/r/actions/runs/12345/job/1",
    "failed",
  );

  await page.goto(`/repos/${rid}/home`);
  const summary = page.getByRole("button", { name: /1 passed · 1 failed/ });
  await expect(summary).toBeVisible();

  await summary.click();
  await expect(page.getByRole("link", { name: /run 12345/ })).toHaveAttribute(
    "href",
    "https://github.com/o/r/actions/runs/12345/job/1",
  );
  await expect(
    page.locator('a[href="https://ci.example.com/runs/passing"]'),
  ).toBeVisible();
});

test("a running job is shown as running", async ({ page, peer }) => {
  const { rid, repoFolder } = await createRepo(peer, { name: "ci" });
  const { stdout: head } = await peer.git(["rev-parse", "HEAD"], {
    cwd: repoFolder,
  });
  await peer.spawn(radJobBinary, ["--no-sync", "new", head.trim()], {
    cwd: repoFolder,
  });
  await recordRun(
    peer,
    repoFolder,
    head.trim(),
    "https://ci.example.com/runs/slow",
    "started",
  );

  await page.goto(`/repos/${rid}/home`);
  await expect(page.getByRole("button", { name: /1 running/ })).toBeVisible();
});
