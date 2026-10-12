import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import * as Zlib from "node:zlib";

import { expect, test } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(Zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

// A blank PNG saved at 144 DPI, the way macOS saves Retina screenshots.
function retinaPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const density = Buffer.alloc(9);
  density.writeUInt32BE(5669, 0);
  density.writeUInt32BE(5669, 4);
  density[8] = 1;
  const rows = Buffer.alloc((width * 3 + 1) * height);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("pHYs", density),
    chunk("IDAT", Zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const logo =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#08f"/></svg>\n';

async function createRichRepo(peer: RadiclePeer) {
  const { rid, repoFolder } = await createRepo(peer, { name: "rich" });
  await Fs.mkdir(Path.join(repoFolder, "images"));
  await Fs.mkdir(Path.join(repoFolder, "docs"));
  await Fs.writeFile(Path.join(repoFolder, "images", "logo.svg"), logo);
  await Fs.writeFile(
    Path.join(repoFolder, "images", "shot.png"),
    retinaPng(64, 8),
  );
  await Fs.writeFile(
    Path.join(repoFolder, "README.md"),
    [
      "# Rich",
      "",
      "> [!NOTE]",
      "> Read the guide first.",
      "",
      // A `%` that doesn't start an escape must not stop the rest of the
      // document from being enhanced.
      "![Half](50%.png)",
      "",
      "![Logo](images/logo.svg)",
      "",
      "![Screenshot](./images/shot.png)",
      "",
      "```mermaid",
      "graph TD; Start-->Finish",
      "```",
      "",
    ].join("\n"),
  );
  await Fs.writeFile(
    Path.join(repoFolder, "docs", "guide.adoc"),
    ["= Guide", "", "image::../images/logo.svg[Guide logo]", ""].join("\n"),
  );
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Write a rich readme"], { cwd: repoFolder });
  await peer.git(["push", "rad", "main"], { cwd: repoFolder });
  return { rid };
}

test("render alerts, diagrams and repository images in a readme", async ({
  page,
  peer,
}) => {
  const { rid } = await createRichRepo(peer);
  await page.goto(`/repos/${rid}/home`);

  const readme = page.locator(".markdown");
  await expect(
    readme.locator(".alert-note").getByText("Read the guide first."),
  ).toBeVisible();
  await expect(readme.locator(".mermaid-diagram svg")).toBeVisible();
  await expect(readme.locator(".mermaid-diagram")).toContainText("Finish");

  const logoImage = readme.getByRole("img", { name: "Logo" });
  await expect(logoImage).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      logoImage.evaluate(image => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(40);

  const screenshot = readme.getByRole("img", { name: "Screenshot" });
  await expect(screenshot).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      screenshot.evaluate(image => image.getBoundingClientRect().width),
    )
    .toBe(32);
});

test("redraw a diagram when the theme changes", async ({ page, peer }) => {
  const { rid } = await createRichRepo(peer);
  await page.goto(`/repos/${rid}/home`);

  const diagram = page.locator(".mermaid-diagram svg");
  await expect(diagram).toBeVisible();
  const darkId = await diagram.getAttribute("id");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect(diagram).not.toHaveAttribute("id", darkId ?? "");
  await expect(page.locator(".mermaid-diagram")).toHaveCount(1);
});

test("show repository images in an AsciiDoc file", async ({ page, peer }) => {
  const { rid } = await createRichRepo(peer);
  await page.goto(`/repos/${rid}/home`);

  await page.getByText("docs", { exact: true }).click();
  await page.getByText("guide.adoc", { exact: true }).click();

  const image = page.locator(".asciidoc").getByRole("img", {
    name: "Guide logo",
  });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      image.evaluate(element => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(40);
});
