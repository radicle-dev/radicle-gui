/* eslint-disable @typescript-eslint/naming-convention */
import type { Config } from "@http-client";
import type { PeerManager, RadiclePeer } from "./peerManager.js";
import type * as Stream from "node:stream";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { test as base, expect } from "@playwright/test";
import { execa } from "execa";
import chalk from "chalk";

import * as issue from "@tests/support/cobs/issue.js";
import * as patch from "@tests/support/cobs/patch.js";
import { createOptions, supportDir, tmpDir } from "@tests/support/support.js";
import { createPeerManager } from "@tests/support/peerManager.js";
import { createRepo } from "@tests/support/repo.js";
import { formatCommit } from "@app/lib/utils.js";

export { expect };

const fixturesDir = Path.resolve(supportDir, "..", "./fixtures");

export const test = base.extend<{
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  forAllTests: void;
  stateDir: string;
  peerManager: PeerManager;
  peer: RadiclePeer;
  outputLog: Stream.Writable;
}>({
  forAllTests: [
    async ({ outputLog, page }, use) => {
      // Flag that tests are running so the app uses the test httpd port
      // (8081 from config.test.json) instead of the production default (8080)
      // for /nodes/localhost requests.
      await page.addInitScript(() => {
        globalThis.__PLAYWRIGHT__ = true;
      });

      const browserLabel = " ".repeat(23) + "→ " + chalk.blue("browser") + ": ";
      page.on("console", msg => {
        // Ignore common console logs that we don't care about.
        if (
          msg.text().startsWith("[vite] connected.") ||
          msg.text().startsWith("[vite] connecting...") ||
          msg.text().startsWith("Not able to parse url") ||
          msg
            .text()
            .includes("Please make sure it wasn't preloaded for nothing.")
        ) {
          return;
        }
        log(msg.text(), browserLabel, outputLog);
      });

      if (!process.env.CONTINUE_ON_ERRORS) {
        page.on("pageerror", msg => {
          expect(
            false,
            `Test failed because there was a console error in the app: ${msg}`,
          ).toBeTruthy();
        });
      }

      const playwrightLabel =
        " ".repeat(23) + "→ " + chalk.yellowBright("playwright") + ": ";

      function isLocalhost(url: URL) {
        return url.hostname === "localhost" || url.hostname === "127.0.0.1";
      }

      await page.route(
        url => !isLocalhost(url),
        route => {
          log(
            `Aborted remote request: ${route.request().url()}`,
            playwrightLabel,
            outputLog,
          );
          return route.abort();
        },
      );

      await page.route(
        url =>
          url.href.startsWith("https://www.gravatar.com/avatar/") ||
          (url.href.endsWith(".png") && !isLocalhost(url)),
        route => {
          return route.fulfill({
            status: 200,
            path: "./public/favicon.png",
          });
        },
      );

      await use();
    },
    { scope: "test", auto: true },
  ],

  outputLog: async ({ stateDir }, use) => {
    const logFile = await Fs.open(Path.join(stateDir, "test.log"), "a");
    await use(logFile.createWriteStream());
    await logFile.close();
  },

  peerManager: async ({ stateDir, outputLog, page }, use) => {
    const peerManager = await createPeerManager({
      dataDir: Path.resolve(Path.join(stateDir, "peers")),
      outputLog,
    });
    await use(peerManager);
    // A test can end with requests still in flight, because the router pushes
    // the URL before the route finishes loading. Close the page before the
    // nodes go away, so those requests don't fail against a dead httpd and
    // trip the page error handler above after the test has already passed.
    await page.close();
    await peerManager.shutdown();
  },

  peer: async ({ peerManager }, use) => {
    const peer = await peerManager.createPeer({
      name: "httpd",
      gitOptions: gitOptions["bob"],
    });

    await peer.startNode();
    await peer.startHttpd();

    await use(peer);
  },

  // eslint-disable-next-line no-empty-pattern
  stateDir: async ({}, use, testInfo) => {
    const stateDir = testInfo.outputDir;
    await Fs.rm(stateDir, { recursive: true, force: true });
    await Fs.mkdir(stateDir, { recursive: true });

    await use(stateDir);
    if (
      process.env.CI &&
      (testInfo.status === "passed" || testInfo.status === "skipped")
    ) {
      await Fs.rm(stateDir, { recursive: true });
    }
  },
});

function log(text: string, label: string, outputLog: Stream.Writable) {
  const output = text
    .split("\n")
    .map(line => `${label}${chalk.dim(line)}`)
    .join("\n");

  outputLog.write(`${output}\n`);
  if (!process.env.CI) {
    console.log(output);
  }
}

export async function createSourceBrowsingFixture(
  peerManager: PeerManager,
  palm: RadiclePeer,
) {
  const repoName = "source-browsing";
  const sourceBrowsingDir = Path.join(tmpDir, "repos", repoName);
  await Fs.mkdir(sourceBrowsingDir, { recursive: true });
  await execa("tar", [
    "-xf",
    Path.join(fixturesDir, `repos/${repoName}.tar.bz2`),
    "-C",
    sourceBrowsingDir,
  ]);
  const rid = sourceBrowsingRid;
  const alice = await peerManager.createPeer({
    name: "alice",
    gitOptions: gitOptions["alice"],
  });
  const aliceRepoPath = Path.join(alice.checkoutPath, "source-browsing");
  const bob = await peerManager.createPeer({
    name: "bob",
    gitOptions: gitOptions["bob"],
  });
  const bobRepoPath = Path.join(bob.checkoutPath, "source-browsing");
  await alice.startNode({
    node: {
      ...defaultConfig.node,
      connect: [palm.address],
      alias: "alice",
    },
  });
  await bob.startNode({
    node: { ...defaultConfig.node, connect: [palm.address], alias: "bob" },
  });
  await palm.waitForEvent({ type: "peerConnected", nid: alice.nodeId }, 1000);
  await palm.waitForEvent({ type: "peerConnected", nid: bob.nodeId }, 1000);

  await alice.git(["clone", sourceBrowsingDir], { cwd: alice.checkoutPath });
  await alice.git(["checkout", "feature/branch"], { cwd: aliceRepoPath });
  await alice.git(["checkout", "feature/move-copy-files"], {
    cwd: aliceRepoPath,
  });
  await alice.git(["checkout", "orphaned-branch"], { cwd: aliceRepoPath });
  await alice.git(["checkout", "main"], { cwd: aliceRepoPath });
  await alice.rad(
    [
      "init",
      "--name",
      repoName,
      "--default-branch",
      "main",
      "--description",
      "Git repository for source browsing tests",
      "--public",
    ],
    { cwd: aliceRepoPath },
  );
  await alice.waitForEvent(
    {
      type: "seedDiscovered",
      rid,
      nid: palm.nodeId,
    },
    2000,
  );

  // Needed due to rad init not pushing all branches.
  await alice.git(["push", "rad", "--all"], { cwd: aliceRepoPath });
  await alice.stopNode();

  await bob.waitForEvent(
    {
      type: "seedDiscovered",
      rid,
      nid: palm.nodeId,
    },
    2000,
  );

  await bob.rad(["clone", rid], { cwd: bob.checkoutPath });

  await Fs.writeFile(
    Path.join(bob.checkoutPath, "source-browsing", "README.md"),
    "Updated readme",
  );
  await bob.git(["add", "README.md"], { cwd: bobRepoPath });
  await bob.git(
    [
      "commit",
      "--message",
      "Update readme",
      "--date",
      "Mon Dec 21 14:00 2022 +0100",
    ],
    { cwd: bobRepoPath },
  );
  await bob.git(["push", "rad"], { cwd: bobRepoPath });
  await bob.stopNode();
}

export async function createCobsFixture(
  peerManager: PeerManager,
  peer: RadiclePeer,
) {
  await peer.rad(["follow", peer.nodeId, "--alias", "palm"]);
  await Fs.mkdir(Path.join(tmpDir, "repos", "cobs"));
  const { repoFolder, rid, defaultBranch } = await createRepo(peer, {
    name: "cobs",
  });
  const eve = await peerManager.createPeer({
    name: "eve",
    gitOptions: gitOptions["eve"],
  });
  await eve.startNode({
    node: { ...defaultConfig.node, connect: [peer.address], alias: "eve" },
  });
  await eve.rad(["clone", rid], { cwd: eve.checkoutPath });

  const issueOne = await issue.create(
    peer,
    "This `title` has **markdown**",
    "This is a description\nWith some multiline text.",
    ["bug", "feature-request"],
    { cwd: repoFolder },
  );
  await peer.rad(
    ["issue", "react", issueOne, "--emoji", "👍", "--to", issueOne],
    {
      cwd: repoFolder,
    },
  );
  await peer.rad(
    ["issue", "react", issueOne, "--emoji", "🎉", "--to", issueOne],
    {
      cwd: repoFolder,
    },
  );
  await peer.rad(
    ["issue", "assign", issueOne, "--add", `did:key:${peer.nodeId}`],
    createOptions(repoFolder, 1),
  );
  const { stdout: commentIssueOne } = await peer.rad(
    [
      "issue",
      "comment",
      issueOne,
      "--message",
      "This is a multiline comment\n\nWith some more text.",
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 2),
  );
  await peer.rad(
    ["issue", "react", issueOne, "--emoji", "🙏", "--to", commentIssueOne],
    {
      cwd: repoFolder,
    },
  );
  const { stdout: replyIssueOne } = await peer.rad(
    [
      "issue",
      "comment",
      issueOne,
      "--message",
      "This is a reply, to a first comment.",
      "--reply-to",
      commentIssueOne,
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 3),
  );
  await peer.rad(
    ["issue", "react", issueOne, "--emoji", "🚀", "--to", replyIssueOne],
    {
      cwd: repoFolder,
    },
  );
  await peer.rad(
    [
      "issue",
      "comment",
      issueOne,
      "--message",
      "A root level comment after a reply, for margins sake.",
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 4),
  );

  const issueTwo = await issue.create(
    peer,
    "A closed issue",
    "This issue has been closed\n\nsource: [link](https://radicle.dev)",
    [],
    { cwd: repoFolder },
  );
  await peer.rad(
    ["issue", "state", issueTwo, "--closed"],
    createOptions(repoFolder, 1),
  );

  const issueThree = await issue.create(
    peer,
    "A solved issue",
    "This issue has been solved\n\n```js\nconsole.log('hello world')\nconsole.log(\"\")\n```",
    [],
    { cwd: repoFolder },
  );
  await peer.rad(
    ["issue", "state", issueThree, "--solved"],
    createOptions(repoFolder, 1),
  );

  const patchOne = await patch.create(
    peer,
    ["Add README", "This commit adds more information to the README"],
    "feature/add-readme",
    () => Fs.writeFile(Path.join(repoFolder, "README.md"), "# Cobs Repo"),
    ["Let's add a README", "This repo needed a README"],
    { cwd: repoFolder },
  );
  const { stdout: commentPatchOne } = await peer.rad(
    [
      "patch",
      "comment",
      patchOne,
      "--message",
      "I'll review the patch",
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 1),
  );
  await peer.rad(
    [
      "patch",
      "comment",
      patchOne,
      "--message",
      "Thanks for that!",
      "--reply-to",
      commentPatchOne,
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 2),
  );
  await peer.rad(
    [
      "patch",
      "comment",
      patchOne,
      "--message",
      "Yeah no problem!",
      "--reply-to",
      commentPatchOne,
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 3),
  );
  const { stdout: commentTwo } = await peer.rad(
    [
      "patch",
      "comment",
      patchOne,
      "--message",
      "Looking good so far",
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 4),
  );
  await peer.rad(
    [
      "patch",
      "comment",
      patchOne,
      "--message",
      "Thanks again!",
      "--reply-to",
      commentTwo,
      "--quiet",
      "--no-announce",
    ],
    createOptions(repoFolder, 5),
  );
  await peer.rad(
    ["patch", "review", patchOne, "--accept"],
    createOptions(repoFolder, 6),
  );
  await patch.merge(
    peer,
    defaultBranch,
    "feature/add-readme",
    createOptions(repoFolder, 7),
  );

  const patchTwo = await patch.create(
    peer,
    ["Add subtitle to README"],
    "feature/add-more-text",
    () => Fs.appendFile(Path.join(repoFolder, "README.md"), "\n\n## Subtitle"),
    [],
    { cwd: repoFolder },
  );
  await peer.rad(
    ["patch", "review", patchTwo, "--reject"],
    createOptions(repoFolder, 1),
  );

  const patchThree = await patch.create(
    peer,
    [
      "Rewrite subtitle to README",
      "This was really necessary",
      "Blazingly fast",
    ],
    "feature/better-subtitle",
    () => Fs.appendFile(Path.join(repoFolder, "README.md"), "\n\n## Better?"),
    [
      "Taking another stab at the README",
      "This is a big improvement over the last one",
      "Hopefully **this** is the last time",
    ],
    { cwd: repoFolder },
  );
  await peer.rad(
    ["patch", "label", patchThree, "--add", "documentation"],
    createOptions(repoFolder, 1),
  );
  await eve.rad(
    ["patch", "review", patchThree, "--accept"],
    createOptions(repoFolder, 2),
  );
  await Fs.appendFile(
    Path.join(repoFolder, "README.md"),
    "\n\nHad to push a new revision",
  );
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Add more text"], { cwd: repoFolder });
  await peer.git(
    [
      "push",
      "-o",
      "patch.message=Most of the missing README text was caused by the git-daemon not having a writers block. It seems like using an RNG was not a good enough solution.",
      "-o",
      "patch.message=After this change, the README seem to be written correctly",
      "rad",
      "feature/better-subtitle",
    ],
    createOptions(repoFolder, 3),
  );
  await peer.rad(
    ["patch", "review", patchThree, "--reject"],
    createOptions(repoFolder, 2),
  );

  const patchFour = await patch.create(
    peer,
    ["This patch is going to be archived"],
    "feature/archived",
    () => Fs.writeFile(Path.join(repoFolder, "CONTRIBUTING.md"), "# Archived"),
    [],
    { cwd: repoFolder },
  );
  await peer.rad(
    ["patch", "review", patchFour, "--accept"],
    createOptions(repoFolder, 1),
  );
  await peer.rad(["patch", "archive", patchFour], createOptions(repoFolder, 2));

  const patchFive = await patch.create(
    peer,
    ["This patch is going to be reverted to draft"],
    "feature/draft",
    () => Fs.writeFile(Path.join(repoFolder, "LICENSE"), "Draft"),
    [],
    { cwd: repoFolder },
  );
  await peer.rad(
    ["patch", "ready", patchFive, "--undo"],
    createOptions(repoFolder, 1),
  );
}

export async function createMarkdownFixture(peer: RadiclePeer) {
  await Fs.mkdir(Path.join(tmpDir, "repos", "markdown"));
  await execa("tar", [
    "-xf",
    Path.join(fixturesDir, "repos", "markdown.tar.bz2"),
    "-C",
    Path.join(tmpDir, "repos", "markdown"),
  ]);
  const { repoFolder } = await createRepo(peer, { name: "markdown" });
  await Fs.cp(Path.join(tmpDir, "repos", "markdown"), repoFolder, {
    recursive: true,
  });
  await Fs.writeFile(
    Path.join(repoFolder, "markdown-code.md"),
    [
      "```javascript",
      'alert("test"); // ❌',
      'confirm("test"); // ❌✅',
      'prompt("test"); // 👩‍💻',
      "```",
      "",
      "```",
      "plain: ❌ ✅",
      "```",
      "",
    ].join("\n"),
  );

  await peer.git(["add", "."], { cwd: repoFolder });
  const commitMessage = `Add Markdown cheat sheet

  Borrowed from [Adam Pritchard][ap].
  No modifications were made.

  [ap]: https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet`;
  await peer.git(["commit", "-m", commitMessage], {
    cwd: repoFolder,
  });
  await peer.git(["push", "rad"], { cwd: repoFolder });
  await issue.create(
    peer,
    "This `title` has **markdown**",
    'This is a description\n\nWith some multiline text.\n\n```\n23-11-06 10:19 ➜  radicle-jetbrains-plugin git:(main) rad id update --title "Godify jchrist" --description "where jchrist ascends to a god of this project" --delegate did:key:z6MkpaATbhkGbSMysNomYTFVvKG5bnNKYZ2cCamfoHzX9SnL --threshold 1\n\n✓ Identity revision 029837dde8f5c49704e50a19cd709473ac66a456 created\n```',
    ["bug", "feature-request"],
    { cwd: repoFolder },
  );
}

export async function createCommitsFixture(peer: RadiclePeer) {
  await Fs.mkdir(Path.join(tmpDir, "repos", "commits"));
  const { repoFolder } = await createRepo(peer, { name: "commits" });

  // Create 30 more commits for a total of 31 using git fast-import for speed
  const baseDate = 1671125284; // Same as Alice's date
  const authorName = gitOptions["alice"].GIT_AUTHOR_NAME;
  const authorEmail = gitOptions["alice"].GIT_AUTHOR_EMAIL;

  // Get the initial commit hash to use as parent
  const { stdout: initialCommit } = await peer.git(["rev-parse", "HEAD"], {
    cwd: repoFolder,
  });

  // Build fast-import data stream
  let fastImportData = "";
  for (let i = 1; i <= 30; i++) {
    const commitDate = baseDate + i;
    const message = `Commit ${i}`;
    const parent = i === 1 ? initialCommit.trim() : `:${i - 1}`;
    fastImportData += `commit refs/heads/main
mark :${i}
author ${authorName} <${authorEmail}> ${commitDate} +0000
committer ${authorName} <${authorEmail}> ${commitDate} +0000
data ${message.length}
${message}
from ${parent}

`;
  }

  // Write to temp file and pipe it to git fast-import
  const fastImportFile = Path.join(tmpDir, "repos", "commits-fast-import");
  await Fs.writeFile(fastImportFile, fastImportData);

  await peer.spawn(
    "bash",
    ["-c", `git fast-import --force < "${fastImportFile}"`],
    {
      cwd: repoFolder,
    },
  );

  await Fs.unlink(fastImportFile);
  await peer.git(["push", "rad"], { cwd: repoFolder });
}

export const aliceMainHead = "7babd25a74eb3752ec24672b5edf0e7ecb4daf24";
export const aliceMainCommitMessage =
  "Verify that crate::DoubleColon::should_work()";
export const aliceMainCommitCount = 8;
export const aliceRemote =
  "did:key:z6MkqGC3nWZhYieEVTVDKW5v588CiGfsDSmRVG9ZwwWTvLSK";
export const shortAliceHead = formatCommit(aliceMainHead);
export const bobRemote =
  "did:key:z6Mkg49NtQR2LyYRDCQFK4w1VVHqhypZSSRo7HsyuN7SV7v5";
export const bobHead = "82f570ec909e77c7e1bb764f1429b1e01b1b4a90";
export const bobMainCommitCount = 9;
export const shortBobHead = formatCommit(bobHead);
export const sourceBrowsingRid = "rad:z4BwwjPCFNVP27FwVbDFgwVwkjcir";
export const cobRid = "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe";
export const markdownRid = "rad:z2tchH2Ti4LxRKdssPQYs6VHE5rsg";
export const commitsRid = "rad:z2ysBeUDZnHejYvaToxYopZiUA3oy";
export const sourceBrowsingUrl = `/nodes/localhost/${sourceBrowsingRid}`;
export const cobUrl = `/nodes/localhost/${cobRid}`;
export const markdownUrl = `/nodes/localhost/${markdownRid}`;
export const commitsUrl = `/nodes/localhost/${commitsRid}`;
export const shortNodeRemote = "z6MktU…1xB22S";
export const gitOptions = {
  alice: {
    GIT_AUTHOR_NAME: "Alice Liddell",
    GIT_AUTHOR_EMAIL: "alice@radicle.xyz",
    GIT_AUTHOR_DATE: "1671125284",
    GIT_COMMITTER_NAME: "Alice Liddell",
    GIT_COMMITTER_EMAIL: "alice@radicle.xyz",
    GIT_COMMITTER_DATE: "1671125284",
  },
  bob: {
    GIT_AUTHOR_NAME: "Bob Belcher",
    GIT_AUTHOR_EMAIL: "bob@radicle.xyz",
    GIT_AUTHOR_DATE: "1671125284",
    GIT_COMMITTER_NAME: "Bob Belcher",
    GIT_COMMITTER_EMAIL: "bob@radicle.xyz",
    GIT_COMMITTER_DATE: "1671627600",
  },

  eve: {
    GIT_AUTHOR_NAME: "Eve Johnson",
    GIT_AUTHOR_EMAIL: "eve@radicle.xyz",
    GIT_AUTHOR_DATE: "1671125284",
    GIT_COMMITTER_NAME: "Eve Johnson",
    GIT_COMMITTER_EMAIL: "eve@radicle.xyz",
    GIT_COMMITTER_DATE: "1671627600",
  },
};
export const defaultConfig: Config = {
  publicExplorer: "https://radicle.network/nodes/$host/$rid$path",
  preferredSeeds: [],
  web: {
    pinned: {
      repositories: ["rad:z4BwwjPCFNVP27FwVbDFgwVwkjcir"],
    },
  },
  cli: {
    hints: true,
  },
  node: {
    alias: "alice",
    listen: [],
    peers: {
      type: "dynamic",
    },
    connect: [],
    externalAddresses: [],
    network: "main",
    log: "INFO",
    relay: "auto",
    limits: {
      routingMaxSize: 1000,
      routingMaxAge: 604800,
      gossipMaxAge: 1209600,
      fetchConcurrency: 1,
      maxOpenFiles: 4096,
      rate: {
        inbound: {
          fillRate: 5.0,
          capacity: 1024,
        },
        outbound: {
          fillRate: 10.0,
          capacity: 2048,
        },
      },
      connection: {
        inbound: 128,
        outbound: 16,
      },
    },
    workers: 8,
    seedingPolicy: {
      default: "block",
    },
  },
};
