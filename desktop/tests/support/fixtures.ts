/* eslint-disable @typescript-eslint/naming-convention */
import type { PeerManager, RadiclePeer } from "./peerManager.js";
import type { Page } from "@playwright/test";

import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import type * as Stream from "node:stream";
import { stripVTControlCharacters } from "node:util";

import { expect, test as base } from "@playwright/test";
import * as issue from "@tests/support/cobs/issue.js";
import * as patch from "@tests/support/cobs/patch.js";
import { createPeerManager } from "@tests/support/peerManager.js";
import { createRepo } from "@tests/support/repo.js";
import { createOptions, supportDir, tmpDir } from "@tests/support/support.js";
import chalk from "chalk";
import { execa } from "execa";
import waitOn from "wait-on";

import { formatOid } from "@app/lib/utils.js";

export { expect };

const fixturesDir = Path.resolve(supportDir, "..", "./fixtures");

export const test = base.extend<{
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  forAllTests: void;
  stateDir: string;
  peerManager: PeerManager;
  peer: RadiclePeer;
  sshAuthSock: string;
  outputLog: Stream.Writable;
}>({
  forAllTests: [
    async ({ outputLog, page }, use) => {
      // Otherwise the app opens the guide on its first launch, depending on
      // how fast startup is.
      await page.addInitScript(() =>
        localStorage.setItem("appFirstLaunch", "false"),
      );

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
          if (tearingDown.has(page)) {
            return;
          }
          if (navigating.has(page) && isCancelledFetch(msg)) {
            return;
          }
          // Only says some resize notifications waited for the next frame.
          if (msg.message.startsWith("ResizeObserver loop")) {
            return;
          }
          expect(
            false,
            `Test failed because there was a console error in the app: ${msg}`,
          ).toBeTruthy();
        });
      }

      const playwrightLabel =
        " ".repeat(23) + "→ " + chalk.yellowBright("playwright") + ": ";

      function isLocalhost(url: URL): boolean {
        // A blob URL has no hostname of its own; it belongs to the origin
        // that created it.
        if (url.protocol === "blob:") {
          return isLocalhost(new URL(url.pathname));
        }
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
            path: "./public/radicle.svg",
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
    // The page outlives the peers and keeps polling them, so its requests
    // fail once they shut down. The test is already over by then.
    tearingDown.add(page);
    await peerManager.shutdown();
  },

  peer: async ({ page, peerManager }, use) => {
    const peer = await peerManager.createPeer({
      name: "httpd",
      gitOptions: gitOptions["bob"],
    });

    await peer.startNode();
    await peer.startHttpd();
    await useBackend(page, peer);

    await use(peer);
  },

  // eslint-disable-next-line no-empty-pattern
  sshAuthSock: async ({}, use) => {
    const dir = await Fs.mkdtemp(Path.join(Os.tmpdir(), "radicle-ssh-agent-"));
    const socket = Path.join(dir, "agent.sock");
    const agent = execa("ssh-agent", ["-D", "-a", socket]);
    agent.catch(() => undefined);
    await waitOn({ resources: [`socket:${socket}`], timeout: 5000 });

    await use(socket);

    agent.kill();
    await Fs.rm(dir, { recursive: true, force: true });
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

const navigating = new WeakSet<Page>();
const tearingDown = new WeakSet<Page>();

// WebKit reports a fetch that was cancelled because the page went away as an
// access control failure, or as a failed load.
function isCancelledFetch(error: Error) {
  return /Fetch API cannot load .* due to access control checks|Load failed/.test(
    error.message + error.stack,
  );
}

async function navigate(page: Page, action: () => Promise<unknown>) {
  navigating.add(page);
  try {
    await action();
    // WebKit reports fetches the old page had in flight after the new one
    // has loaded, so keep ignoring them until the network settles.
    await page.waitForLoadState("networkidle");
  } finally {
    navigating.delete(page);
  }
}

export async function reload(page: Page) {
  await navigate(page, () => page.reload());
}

// Use instead of `page.goto` when the page already shows the app.
export async function goto(page: Page, url: string) {
  await navigate(page, () => page.goto(url));
}

// Runs `action` and waits for the backend command it sends to finish. The UI
// often updates before the write lands, and a reload would cancel it.
export async function waitForCommand(
  page: Page,
  command: string,
  action: () => Promise<void>,
) {
  const response = page.waitForResponse(
    response => new URL(response.url()).pathname === `/${command}`,
  );
  await action();
  await response;
}

// Call before the first `page.goto`.
export async function useBackend(page: Page, peer: RadiclePeer) {
  await page.addInitScript(port => {
    window.__TEST_HTTP_API_PORT__ = port;
  }, peer.httpdBaseUrl.port);
}

function log(text: string, label: string, outputLog: Stream.Writable) {
  const output = text
    .split("\n")
    .map(line => `${label}${chalk.dim(line)}`)
    .join("\n");

  outputLog.write(`${stripVTControlCharacters(output)}\n`);
  if (!process.env.CI) {
    console.log(output);
  }
}

export async function createCobsFixture(
  peerManager: PeerManager,
  peer: RadiclePeer,
) {
  await peer.rad(["follow", peer.nodeId, "--alias", "palm"]);
  await Fs.mkdir(Path.join(tmpDir, "repos", "cobs"), { recursive: true });
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
    "This issue has been closed\n\nsource: [link](https://radicle.xyz)",
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
    ["patch", "review", patchOne, "-m", "LGTM", "--accept"],
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
    [
      "patch",
      "review",
      patchTwo,
      "-m",
      "Not the README we are looking for",
      "--reject",
    ],
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
    ["patch", "review", patchThree, "-m", "This looks better", "--accept"],
    createOptions(repoFolder, 2),
  );
  // Don't let palm act on the patch before it has eve's review.
  await peer.waitForEvent(
    event =>
      event.type === "refsFetched" &&
      event.rid === rid &&
      event.remote === eve.nodeId &&
      event.updated.some(update =>
        Object.values(update).some(ref =>
          ref.name.endsWith(`/xyz.radicle.patch/${patchThree}`),
        ),
      ),
    10_000,
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
    [
      "patch",
      "review",
      patchThree,
      "-m",
      "No this doesn't look better",
      "--reject",
    ],
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
    [
      "patch",
      "review",
      patchFour,
      "-m",
      "No review due to patch being archived.",
      "--accept",
    ],
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
  await Fs.mkdir(Path.join(tmpDir, "repos", "markdown"), { recursive: true });
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

export async function createAsciidocFixture(peer: RadiclePeer) {
  const { repoFolder } = await createRepo(peer, { name: "asciidoc" });

  // An older version of a file, so a test can show the same path at two
  // revisions.
  await Fs.writeFile(
    Path.join(repoFolder, "notes.txt"),
    "An earlier version of the notes.\n",
  );
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Add notes"], { cwd: repoFolder });

  await Fs.writeFile(
    Path.join(repoFolder, "README.adoc"),
    [
      "= AsciiDoc Fixture",
      "",
      "A paragraph with a `code span` and a https://radicle.xyz[link].",
      "",
      "== Rendering",
      "",
      "[source,rust]",
      "----",
      "fn main() {}",
      "----",
      "",
      "|===",
      "|Column A |Column B",
      "",
      "|1 |2",
      "|===",
      "",
      // An AsciiDoc cell holding an unbreakable token: the column must stay
      // inside the viewport instead of widening the page.
      '[cols="2a,1",options="header"]',
      "|===",
      "|URI |Refers to",
      "",
      "|",
      "....",
      `rad:z${"L".repeat(120)}`,
      "....",
      "|A repository",
      "|===",
      "",
      "NOTE: An admonition.",
      "",
      "A statement.footnote:[A footnote.]",
      "",
      "== Includes",
      "",
      "include::_include.adoc[tag=alpha]",
      "",
      // A remote include must be refused without any network request.
      "include::https://example.invalid/remote.adoc[]",
      "",
      "A link to link:notes.txt[the notes] in the same repository.",
      "",
      "== Untrusted markup",
      "",
      // A passthrough block is the one place AsciiDoc emits author-supplied
      // HTML verbatim, so it is what the sanitizer has to catch.
      "++++",
      '<script>window.xssMarker = "script";</script>',
      '<img src="x" onerror="window.xssMarker = \'onerror\';">',
      '<iframe src="https://example.invalid"></iframe>',
      "<a href=\"javascript:window.xssMarker = 'href';\">link</a>",
      "<div onclick=\"window.xssMarker = 'onclick';\">click</div>",
      "++++",
      "",
    ].join("\n"),
  );

  await Fs.writeFile(
    Path.join(repoFolder, "notes.txt"),
    "Notes from a sibling file.\n",
  );

  await Fs.writeFile(
    Path.join(repoFolder, "_include.adoc"),
    [
      "// tag::alpha[]",
      "Alpha section text.",
      "// end::alpha[]",
      "// tag::beta[]",
      "Beta section text.",
      "// end::beta[]",
      "",
    ].join("\n"),
  );

  // Each level includes the next one twice, so without a read budget the
  // reads grow exponentially with Asciidoctor's include depth.
  await Fs.writeFile(
    Path.join(repoFolder, "bomb.adoc"),
    ["= Include Bomb", "", "include::_bomb.adoc[]", ""].join("\n"),
  );
  await Fs.writeFile(
    Path.join(repoFolder, "_bomb.adoc"),
    ["include::_bomb.adoc[]", "include::_bomb.adoc[]", ""].join("\n"),
  );

  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Add AsciiDoc readme"], { cwd: repoFolder });
  await peer.git(["push", "rad"], { cwd: repoFolder });
}

export const aliceMainHead = "7babd25a74eb3752ec24672b5edf0e7ecb4daf24";
export const aliceMainCommitMessage =
  "Verify that crate::DoubleColon::should_work()";
export const aliceMainCommitCount = 8;
export const aliceRemote =
  "did:key:z6MkqGC3nWZhYieEVTVDKW5v588CiGfsDSmRVG9ZwwWTvLSK";
export const shortAliceHead = formatOid(aliceMainHead);
export const bobRemote =
  "did:key:z6Mkg49NtQR2LyYRDCQFK4w1VVHqhypZSSRo7HsyuN7SV7v5";
export const bobHead = "82f570ec909e77c7e1bb764f1429b1e01b1b4a90";
export const bobMainCommitCount = 9;
export const shortBobHead = formatOid(bobHead);
export const cobRid = "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe";
export const markdownRid = "rad:z2tchH2Ti4LxRKdssPQYs6VHE5rsg";
export const shortNodeRemote = "z6MktU…1xB22S";
export const gitOptions = {
  alice: {
    GIT_AUTHOR_NAME: "Alice Liddell",
    GIT_AUTHOR_EMAIL: "alice@radicle.xyz",
    GIT_AUTHOR_DATE: "1727621093",
    GIT_COMMITTER_NAME: "Alice Liddell",
    GIT_COMMITTER_EMAIL: "alice@radicle.xyz",
    GIT_COMMITTER_DATE: "1727621093",
  },
  bob: {
    GIT_AUTHOR_NAME: "Bob Belcher",
    GIT_AUTHOR_EMAIL: "bob@radicle.xyz",
    GIT_AUTHOR_DATE: "1727621093",
    GIT_COMMITTER_NAME: "Bob Belcher",
    GIT_COMMITTER_EMAIL: "bob@radicle.xyz",
    GIT_COMMITTER_DATE: "1730220293",
  },

  eve: {
    GIT_AUTHOR_NAME: "Eve Johnson",
    GIT_AUTHOR_EMAIL: "eve@radicle.xyz",
    GIT_AUTHOR_DATE: "1727621093",
    GIT_COMMITTER_NAME: "Eve Johnson",
    GIT_COMMITTER_EMAIL: "eve@radicle.xyz",
    GIT_COMMITTER_DATE: "1730220293",
  },
};
export const defaultConfig: Config = {
  publicExplorer: "https://radicle.network/nodes/$host/$rid$path",
  preferredSeeds: [],
  web: {
    pinned: {
      repositories: [],
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

export type Config = {
  publicExplorer: string;
  preferredSeeds: string[];
  cli: { hints: boolean };
  web: {
    pinned: {
      repositories: string[];
    };
    imageUrl?: string;
    name?: string;
    description?: string;
  };
  node: NodeConfig;
};

export type NodeConfig = {
  alias: string;
  peers: { type: "static" } | { type: "dynamic" };
  listen: string[];
  connect: string[];
  externalAddresses: string[];
  proxy?: string;
  onion?: { mode: "proxy"; address: string } | { mode: "forward" };
  log: "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";
  network: "main" | "test";
  relay: "always" | "never" | "auto";
  limits: {
    routingMaxSize: number;
    routingMaxAge: number;
    fetchConcurrency: number;
    gossipMaxAge: number;
    maxOpenFiles: number;
    rate: {
      inbound: {
        fillRate: number;
        capacity: number;
      };
      outbound: {
        fillRate: number;
        capacity: number;
      };
    };
    connection: {
      inbound: number;
      outbound: number;
    };
  };
  workers: number;
  seedingPolicy:
    | {
        default: "block";
      }
    | {
        default: "allow";
        scope: "followed" | "all";
      };
};
