import { nidFor, rng } from "./hash";

export type NodeStatus = "starting" | "connecting" | "online" | "offline";
export type Transport = "WebTransport" | "WebRTC" | "Relay";

export interface Peer {
  nid: string;
  label: string;
  kind: "seed" | "peer";
  // Person key when the peer is someone's own node.
  person?: string;
  transport: Transport;
  latencyMs: number;
  connectedAt: number;
  inBytes: number;
  outBytes: number;
}

export interface NetEvent {
  id: number;
  time: number;
  kind: "connect" | "disconnect" | "fetch" | "announce" | "serve";
  text: string;
  rid?: string;
}

const SEEDS: { label: string; transport: Transport; latency: number }[] = [
  { label: "ash.seeds.rad", transport: "WebTransport", latency: 38 },
  { label: "rowan.seeds.rad", transport: "WebTransport", latency: 61 },
  { label: "seed.tidal.rad", transport: "WebTransport", latency: 112 },
  { label: "seed.meshwork.net", transport: "WebTransport", latency: 168 },
];

const PEERS: { person: string; transport: Transport; latency: number }[] = [
  { person: "ada", transport: "WebRTC", latency: 24 },
  { person: "mira", transport: "WebRTC", latency: 47 },
  { person: "tomas", transport: "Relay", latency: 140 },
  { person: "yuki", transport: "WebRTC", latency: 180 },
  { person: "zeynep", transport: "WebRTC", latency: 58 },
  { person: "priya", transport: "WebRTC", latency: 121 },
  { person: "felix", transport: "Relay", latency: 92 },
];

export interface RepoRef {
  rid: string;
  name: string;
}

export class Network {
  status = $state<NodeStatus>("starting");
  peers = $state<Peer[]>([]);
  events = $state<NetEvent[]>([]);
  startedAt = $state(Date.now());
  inBytes = $state(0);
  outBytes = $state(0);
  tabVisible = $state(true);

  #timers: ReturnType<typeof setTimeout>[] = [];
  #interval: ReturnType<typeof setInterval> | undefined;
  #nextId = 1;
  #random = rng("network");
  #repos: () => RepoRef[] = () => [];
  #aliasOf: (person: string) => string = p => p;

  configure(repos: () => RepoRef[], aliasOf: (person: string) => string) {
    this.#repos = repos;
    this.#aliasOf = aliasOf;
  }

  log(kind: NetEvent["kind"], text: string, rid?: string) {
    this.events = [
      { id: this.#nextId++, time: Date.now(), kind, text, rid },
      ...this.events,
    ].slice(0, 200);
  }

  #later(ms: number, fn: () => void) {
    this.#timers.push(setTimeout(fn, ms));
  }

  start() {
    this.stop();
    this.status = "starting";
    this.startedAt = Date.now();
    this.peers = [];
    this.#later(700, () => {
      this.status = "connecting";
    });
    const all = [
      ...SEEDS.map(s => ({ ...s, kind: "seed" as const, person: undefined })),
      ...PEERS.map(p => ({
        ...p,
        kind: "peer" as const,
        label: `${this.#aliasOf(p.person)}'s node`,
      })),
    ];
    all.forEach((p, i) => {
      this.#later(900 + i * 380, () => {
        this.peers = [
          ...this.peers,
          {
            nid: nidFor(`peer:${p.label}`),
            label: p.label,
            kind: p.kind,
            person: p.person,
            transport: p.transport,
            latencyMs: p.latency,
            connectedAt: Date.now(),
            inBytes: 0,
            outBytes: 0,
          },
        ];
        this.log(
          "connect",
          `Connected to ${p.label} over ${p.transport}`,
        );
        if (i === 1) this.status = "online";
      });
    });
    this.#later(900 + all.length * 380 + 300, () => {
      const repos = this.#repos();
      this.log(
        "announce",
        `Announced ${repos.length} repositories to ${this.peers.length} peers`,
      );
      repos.slice(0, 3).forEach((repo, i) => {
        this.#later(400 + i * 500, () => {
          const refs = 1 + Math.floor(this.#random() * 6);
          this.log(
            "fetch",
            `Fetched ${refs} ref${refs === 1 ? "" : "s"} for ${repo.name}`,
            repo.rid,
          );
        });
      });
    });
    this.#interval = setInterval(() => this.#tick(), 1500);
  }

  stop() {
    this.#timers.forEach(clearTimeout);
    this.#timers = [];
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = undefined;
  }

  goOffline() {
    this.stop();
    this.status = "offline";
    this.peers = [];
    this.log("disconnect", "Node stopped. Changes are kept and will sync later");
  }

  #tick() {
    if (this.status !== "online") return;
    const factor = this.tabVisible ? 1 : 0.15;
    let tickIn = 0;
    let tickOut = 0;
    this.peers = this.peers.map(p => {
      const inc = Math.floor(this.#random() * 2400 * factor);
      const out = Math.floor(this.#random() * 1600 * factor);
      tickIn += inc;
      tickOut += out;
      return {
        ...p,
        inBytes: p.inBytes + inc,
        outBytes: p.outBytes + out,
        latencyMs: Math.max(
          8,
          Math.round(p.latencyMs + (this.#random() - 0.5) * 8),
        ),
      };
    });
    this.inBytes += tickIn;
    this.outBytes += tickOut;

    const roll = this.#random();
    const repos = this.#repos();
    if (repos.length === 0) return;
    const repo = repos[Math.floor(this.#random() * repos.length)];
    const peer = this.peers[Math.floor(this.#random() * this.peers.length)];
    if (!peer) return;
    if (roll < 0.06) {
      this.log("fetch", `Fetched updates for ${repo.name} from ${peer.label}`, repo.rid);
    } else if (roll < 0.1) {
      this.log("serve", `Served ${repo.name} to ${peer.label}`, repo.rid);
    }
  }
}
