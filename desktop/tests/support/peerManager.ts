import type * as Execa from "execa";

import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import * as readline from "node:readline/promises";
import * as Stream from "node:stream";
import * as Util from "node:util";

import { type Config, defaultConfig } from "@tests/support/fixtures.js";
import { logPrefix } from "@tests/support/logPrefix.js";
import { randomTag, testHttpApiBinary } from "@tests/support/support.js";
import { execa } from "execa";
import getPort from "get-port";
import matches from "lodash/matches.js";
import waitOn from "wait-on";

import { sleep } from "@app/lib/sleep.js";

export type RefsUpdate =
  | { updated: { name: string; old: string; new: string } }
  | { created: { name: string; oid: string } }
  | { deleted: { name: string; oid: string } }
  | { skipped: { name: string; oid: string } };

export type NodeEvent =
  | {
      type: "refsFetched";
      remote: string;
      rid: string;
      updated: RefsUpdate[];
    }
  | {
      type: "refsSynced";
      remote: string;
      rid: string;
    }
  | {
      type: "seedDiscovered";
      rid: string;
      nid: string;
    }
  | {
      type: "seedDropped";
      nid: string;
      rid: string;
    }
  | {
      type: "peerConnected";
      nid: string;
    }
  | {
      type: "peerDisconnected";
      nid: string;
      reason: string;
    };

export interface RoutingEntry {
  nid: string;
  rid: string;
}

interface PeerOptions {
  // Name for easy identification. Used on file system and in logs.
  name: string;
  gitOptions?: Record<string, string>;
  // Without one the keys are unencrypted and need no ssh-agent.
  passphrase?: string;
  sshAuthSock?: string;
}

interface PeerManagerParams extends PeerOptions {
  dataPath: string;
  radSeed: string;
  outputLog: Stream.Writable;
}

export interface PeerManager {
  createPeer(params: PeerOptions): Promise<RadiclePeer>;
  /**
   * Kill all processes spawned by any of the peers
   */
  shutdown(): Promise<void>;
}

export async function createPeerManager(createParams: {
  dataDir: string;
  outputLog?: Stream.Writable;
}): Promise<PeerManager> {
  let outputLog: Stream.Writable;
  let outputLogFile: Fs.FileHandle;
  if (createParams.outputLog) {
    outputLog = createParams.outputLog;
  } else {
    outputLogFile = await Fs.open(
      Path.join(createParams.dataDir, "peerManager.log"),
      "a",
    );
    outputLog = outputLogFile.createWriteStream();
  }

  const peers: RadiclePeer[] = [];
  return {
    async createPeer(params) {
      const peer = await RadiclePeer.create({
        dataPath: createParams.dataDir,
        ...params,
        radSeed: Array(64)
          .fill((peers.length + 1).toString())
          .join(""),
        outputLog,
      });
      peers.push(peer);

      return peer;
    },
    async shutdown() {
      await Promise.all(peers.map(peer => peer.shutdown()));
    },
  };
}

// Specialize the return type of `execa()` to guarantee that `stdout` and
// `stderr` are strings.
type SpawnResult = Execa.ResultPromise<
  SpawnOptions & {
    stdout: (line: unknown) => AsyncGenerator<string, void, void>;
    stderr: (line: unknown) => AsyncGenerator<string, void, void>;
    encoding: "utf8";
  }
>;

// `Execa.Options` is a union of the text and binary encoding variants. Exclude
// the binary variant, which requires `encoding`, so that the omitted result
// stays assignable to `Execa.Options`.
export type SpawnOptions = Omit<
  Exclude<Execa.Options, { readonly encoding: string }>,
  "stdin" | "stdout" | "stderr" | "lines" | "encoding"
>;

export interface BaseUrl {
  hostname: string;
  port: number;
  scheme: string;
}

export class RadiclePeer {
  public checkoutPath: string;
  public nodeId: string;

  #radSeed: string;
  #socket: string;
  #radHome: string;
  #eventRecords: NodeEvent[] = [];
  #outputLog: Stream.Writable;
  #gitOptions?: Record<string, string>;
  #passphrase: string;
  #sshAuthSock?: string;
  #listenSocketAddr?: string;
  #httpdBaseUrl?: BaseUrl;
  #nodeProcess?: SpawnResult;
  // Name for easy identification. Used on file system and in logs.
  #name: string;
  #childProcesses: SpawnResult[] = [];

  private constructor(props: {
    checkoutPath: string;
    nodeId: string;
    radSeed: string;
    socket: string;
    gitOptions?: Record<string, string>;
    radHome: string;
    logFile: Stream.Writable;
    name: string;
    passphrase: string;
    sshAuthSock?: string;
  }) {
    this.checkoutPath = props.checkoutPath;
    this.nodeId = props.nodeId;
    this.#gitOptions = props.gitOptions;
    this.#radSeed = props.radSeed;
    this.#socket = props.socket;
    this.#radHome = props.radHome;
    this.#outputLog = props.logFile;
    this.#name = props.name;
    this.#passphrase = props.passphrase;
    this.#sshAuthSock = props.sshAuthSock;
  }

  public async waitForEvent(
    searchEvent: NodeEvent | ((event: NodeEvent) => boolean),
    timeoutInMs: number,
  ) {
    const start = new Date().getTime();
    const predicate =
      typeof searchEvent === "function" ? searchEvent : matches(searchEvent);

    while (true) {
      if (this.#eventRecords.find(predicate)) {
        return;
      }
      if (new Date().getTime() - start > timeoutInMs) {
        throw Error(
          `Timeout waiting for event on node ${this.#name} ${Util.inspect(
            searchEvent,
            { depth: null },
          )}`,
        );
      }
      await sleep(100);
    }
  }

  public static async create({
    dataPath,
    name,
    gitOptions,
    radSeed: node,
    outputLog: logFile,
    passphrase = "",
    sshAuthSock,
  }: PeerManagerParams): Promise<RadiclePeer> {
    const checkoutPath = Path.join(dataPath, name, "copy");
    await Fs.mkdir(checkoutPath, { recursive: true });
    const radHome = Path.join(dataPath, name, "home");
    await Fs.mkdir(radHome, { recursive: true });

    const socketDir = await Fs.mkdtemp(
      Path.join(Os.tmpdir(), `radicle-${randomTag()}`),
    );
    const socket = Path.join(socketDir, "control.sock");

    /* eslint-disable @typescript-eslint/naming-convention */
    const env = {
      ...gitOptions,
      RAD_HOME: radHome,
      RAD_PASSPHRASE: passphrase,
      RAD_KEYGEN_SEED: node,
      RAD_SOCKET: socket,
      SSH_AUTH_SOCK: sshAuthSock,
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    await execa("rad", ["auth", "--alias", name], { env });
    const { stdout: nodeId } = await execa("rad", ["self", "--nid"], { env });

    return new RadiclePeer({
      checkoutPath,
      gitOptions,
      radSeed: node,
      socket,
      nodeId,
      radHome,
      logFile,
      name,
      passphrase,
      sshAuthSock,
    });
  }

  /**
   Removes the peers identity file from the `ssh-agent`
   **/
  public async logOut(): Promise<void> {
    await this.spawn("ssh-add", ["-d", `${this.#radHome}/keys/radicle.pub`]);
  }

  public async authenticate(): Promise<void> {
    await this.spawn("rad", ["auth"]);
  }

  // Without a port the OS picks a free one, which the server reports back.
  // Choosing one up front raced between workers: the second server failed to
  // bind, and its page talked to the other worker's server instead.
  public async startHttpd(port?: number): Promise<void> {
    const httpd = this.spawn(testHttpApiBinary, [
      "--listen",
      `127.0.0.1:${port ?? 0}`,
    ]);
    if (port) {
      await waitOn({ resources: [`tcp:127.0.0.1:${port}`], timeout: 10_000 });
    } else {
      port = await reportedPort(httpd);
    }
    this.#httpdBaseUrl = { hostname: "127.0.0.1", port, scheme: "http" };
  }

  public async startNode(config: Partial<Config> = defaultConfig) {
    const listenPort = await getPort();
    this.#listenSocketAddr = `0.0.0.0:${listenPort}`;

    await updateConfig(this.#radHome, config);

    this.#nodeProcess = this.spawn("radicle-node", [
      "--listen",
      this.#listenSocketAddr,
    ]);

    await waitOn({
      resources: [`socket:${this.#socket}`],
      timeout: 2000,
    });

    const { stdout } = this.rad(["node", "events"], {
      cwd: this.#radHome,
    });

    if (!stdout) {
      throw new Error("Could not get stdout to track events");
    }

    readline
      .createInterface({
        input: stdout,
        terminal: false,
      })
      .on("line", line => {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          console.log("Error parsing event", line);
          return;
        }

        this.#eventRecords.push(event);
        for (const line of Util.inspect(event, { depth: null }).split("\n")) {
          this.#outputLog.write(
            `${logPrefix(`${this.#name} node events`)} ${line}\n`,
          );
        }
      });
  }

  public async stopNode() {
    // Don’t leak unhandled rejections when forcefully killing the process
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.#nodeProcess?.catch(() => {});
    this.#nodeProcess?.kill("SIGTERM");

    await waitOn({
      resources: [`socket:${this.#socket}`],
      reverse: true,
      timeout: 2000,
    });
  }

  /**
   * Kill all child processes created with `spawn()`, including the node and
   * httpd processes.
   */
  public async shutdown() {
    // We don’t care about proper cleanup. We just want to make sure that no
    // processes are running anymore.
    this.#childProcesses.forEach(p => {
      // Don’t leak unhandled rejections when forcefully killing the process
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      p.catch(() => {});
      p.kill("SIGKILL");
    });
  }

  public get address(): string {
    if (!this.#listenSocketAddr) {
      throw new Error("Remote node has no listen addr yet");
    }
    return `${this.nodeId}@${this.#listenSocketAddr}`;
  }

  public uiUrl(): string {
    if (!this.#httpdBaseUrl) {
      throw new Error("No httpd service running");
    }

    return `/nodes/${this.#httpdBaseUrl.hostname}:${this.#httpdBaseUrl.port}`;
  }

  public ridUrl(rid: string): string {
    return `/nodes/${this.httpdBaseUrl.hostname}:${this.httpdBaseUrl.port}/${rid}`;
  }

  public get httpdBaseUrl(): BaseUrl {
    if (!this.#httpdBaseUrl) {
      throw new Error("No httpd service running");
    }

    return this.#httpdBaseUrl;
  }

  public git(args: string[] = [], opts?: SpawnOptions): SpawnResult {
    return this.spawn("git", args, { ...opts });
  }

  public rad(args: string[] = [], opts?: SpawnOptions): SpawnResult {
    return this.spawn("rad", args, { ...opts });
  }

  public spawn(
    cmd: string,
    args: string[] = [],
    opts?: SpawnOptions,
  ): SpawnResult {
    const prefix = logPrefix(`${this.#name} ${cmd}`);
    const outputLog = this.#outputLog;

    function* logWithPrefix(line: unknown) {
      if (typeof line === "string") {
        outputLog.write(`${prefix} ${line}\n`, "utf8");
      }
      yield line;
    }

    /* eslint-disable @typescript-eslint/naming-convention */
    const childProcess = execa(cmd, args, {
      ...opts,
      env: {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        RAD_HOME: this.#radHome,
        RAD_PASSPHRASE: this.#passphrase,
        SSH_AUTH_SOCK: this.#sshAuthSock,
        RAD_LOCAL_TIME: "1671125284",
        RAD_KEYGEN_SEED: this.#radSeed,
        RAD_SOCKET: this.#socket,
        ...opts?.env,
        ...this.#gitOptions,
      },
      encoding: "utf8",
      stdout: logWithPrefix,
      stderr: logWithPrefix,
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    this.#childProcesses.push(childProcess);

    return childProcess;
  }
}

async function updateConfig(radHome: string, configParams: Partial<Config>) {
  const configPath = Path.join(radHome, "config.json");
  const configFile = await Fs.readFile(configPath, "utf-8");
  const config = {
    defaultConfig,
    ...JSON.parse(configFile),
  };
  config.preferredSeeds = [];
  config.web = { ...config.web, ...configParams.web };
  config.node = {
    ...config.node,
    ...configParams.node,
    network: "test",
  };
  await Fs.writeFile(configPath, JSON.stringify(config), "utf-8");
}

async function reportedPort(httpd: SpawnResult): Promise<number> {
  if (!httpd.stdout) {
    throw new Error("test-http-api has no stdout to read its port from");
  }
  const lines = readline.createInterface({ input: httpd.stdout });
  const exited = httpd.then(
    () => {
      throw new Error("test-http-api exited before it was listening");
    },
    (error: unknown) => {
      throw error;
    },
  );
  const listening = (async () => {
    for await (const line of lines) {
      const match = /^listening on .*:(\d+)$/.exec(line);
      if (match) {
        lines.close();
        return Number(match[1]);
      }
    }
    throw new Error("test-http-api closed its output before it was listening");
  })();
  return Promise.race([listening, exited]);
}
