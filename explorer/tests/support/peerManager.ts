/* eslint-disable @typescript-eslint/naming-convention */
import type { Config, BaseUrl } from "@http-client";
import type * as Execa from "execa";

import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import * as Stream from "node:stream";
import * as Util from "node:util";
import * as readline from "node:readline/promises";
import getPort from "get-port";
import matches from "lodash/matches.js";
import waitOn from "wait-on";
import { configSchema } from "@http-client/lib/shared.js";
import { defaultConfig } from "@tests/support/fixtures.js";
import { execa } from "execa";
import { logPrefix } from "@tests/support/logPrefix.js";
import { randomTag } from "@tests/support/support.js";
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

interface PeerManagerParams {
  dataPath: string;
  radSeed: string;
  // Name for easy identification. Used on file system and in logs.
  name: string;
  gitOptions?: Record<string, string>;
  outputLog: Stream.Writable;
}

export interface PeerManager {
  createPeer(params: {
    name: string;
    gitOptions?: Record<string, string>;
  }): Promise<RadiclePeer>;
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
        name: params.name,
        gitOptions: params.gitOptions,
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

type SpawnOptions = Omit<
  Execa.Options,
  "stdin" | "stdout" | "stderr" | "lines" | "encoding"
>;

export class RadiclePeer {
  public checkoutPath: string;
  public nodeId: string;

  #radSeed: string;
  #socket: string;
  #radHome: string;
  #eventRecords: NodeEvent[] = [];
  #outputLog: Stream.Writable;
  #gitOptions?: Record<string, string>;
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
  }) {
    this.checkoutPath = props.checkoutPath;
    this.nodeId = props.nodeId;
    this.#gitOptions = props.gitOptions;
    this.#radSeed = props.radSeed;
    this.#socket = props.socket;
    this.#radHome = props.radHome;
    this.#outputLog = props.logFile;
    this.#name = props.name;
  }

  public async waitForEvent(searchEvent: NodeEvent, timeoutInMs: number) {
    const start = new Date().getTime();

    while (true) {
      if (this.#eventRecords.find(matches(searchEvent))) {
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
  }: PeerManagerParams): Promise<RadiclePeer> {
    const checkoutPath = Path.join(dataPath, name, "copy");
    await Fs.mkdir(checkoutPath, { recursive: true });
    const radHome = Path.join(dataPath, name, "home");
    await Fs.mkdir(radHome, { recursive: true });

    const socketDir = await Fs.mkdtemp(
      Path.join(Os.tmpdir(), `radicle-${randomTag()}`),
    );
    const socket = Path.join(socketDir, "control.sock");

    const env = {
      ...gitOptions,
      RAD_HOME: radHome,
      RAD_PASSPHRASE: "asdf",
      RAD_KEYGEN_SEED: node,
      RAD_SOCKET: socket,
    };

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
    });
  }

  public async startHttpd(port?: number): Promise<void> {
    if (!port) {
      port = await getPort();
    }
    this.#httpdBaseUrl = {
      hostname: "127.0.0.1",
      port,
      scheme: "http",
    };
    void this.spawn("radicle-httpd", [
      "--listen",
      `${this.#httpdBaseUrl.hostname}:${this.#httpdBaseUrl.port}`,
    ]);

    await waitOn({
      resources: [
        `tcp:${this.#httpdBaseUrl.hostname}:${this.#httpdBaseUrl.port}`,
      ],
      timeout: 2000,
    });
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

    const childProcess = execa(cmd, args, {
      ...opts,
      env: {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        RAD_HOME: this.#radHome,
        RAD_PASSPHRASE: "asdf",
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

    this.#childProcesses.push(childProcess);

    return childProcess;
  }
}

async function updateConfig(radHome: string, configParams: Partial<Config>) {
  const configPath = Path.join(radHome, "config.json");
  const configFile = await Fs.readFile(configPath, "utf-8");
  const config = configSchema.parse({
    defaultConfig,
    ...JSON.parse(configFile),
  });
  config.preferredSeeds = [];
  config.web = { ...config.web, ...configParams.web };
  config.node = {
    ...config.node,
    ...configParams.node,
    network: "test",
  };
  await Fs.writeFile(configPath, JSON.stringify(config), "utf-8");
}
