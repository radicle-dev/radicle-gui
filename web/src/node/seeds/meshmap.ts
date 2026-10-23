import type { RepoSeed } from "./types";

const readme = `# meshmap

A web map of a community mesh network: every rooftop router as a dot,
every radio link as a line coloured by how well it's doing.

This is the screen we pull up on a phone on a roof when something is
wrong, so it has to load fast on a bad connection and keep working when
the connection goes away entirely.

## Development

    npm install
    npm run dev

Until the bridge exists the map draws \`public/fixture.json\`.

## How it works

Each site in \`public/sites.json\` has a router id, a name and coordinates.
Links between sites are coloured by their ETX cost as reported by meshd:
green up to 384 (one lost hello in eight), orange up to 1024, red above,
grey for a dead link.
`;

const license = `meshmap is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option)
any later version. See https://www.gnu.org/licenses/agpl-3.0.txt.
`;

const gitignore = `node_modules/
dist/
.env
*.local
`;

const packageJson = `{
  "name": "meshmap",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json"
  },
  "dependencies": {
    "leaflet": "^1.9.4"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^3.1.1",
    "@tsconfig/svelte": "^5.0.4",
    "@types/leaflet": "^1.9.12",
    "svelte": "^4.2.18",
    "svelte-check": "^3.8.4",
    "typescript": "^5.5.3",
    "vite": "^5.3.4"
  }
}
`;

const tsconfig = `{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "tests/**/*.ts"]
}
`;

const viteConfig = `import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Relative base so the build can be dropped into any directory on any host,
// including a router's uhttpd.
export default defineConfig({
  plugins: [svelte()],
  base: "./",
});
`;

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1971c2" />
    <title>meshmap</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const mainTs = `import App from "./App.svelte";

const app = new App({ target: document.getElementById("app")! });

export default app;
`;

const typesTs = `export interface Site {
  routerId: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Link {
  from: string;
  to: string;
  cost: number;
  deliveryRatio: number;
}
`;

const typesTsLive = `export interface Site {
  routerId: string;
  name: string;
  lat: number;
  lon: number;
  /** Base URL of the bridge on this router, e.g. "http://[fd42:6d65:7368:12::1]:8080". */
  bridge: string;
}

/** One entry of meshd's \`neighbours\` control command. */
export interface Neighbour {
  router_id: string;
  addr: string;
  cost: number;
  delivery_ratio: number;
}

export interface NodeReport {
  version: string;
  neighbours: Neighbour[];
  fetchedAt: number;
}

export interface Link {
  from: string;
  to: string;
  cost: number;
  deliveryRatio: number;
}
`;

const qualityTs = `export type Quality = "good" | "fair" | "poor" | "dead";

/**
 * Bucket a meshd link cost. 256 is a perfect link; 384 is roughly one lost
 * hello in eight, 1024 is half of them lost. 65535 means unreachable.
 */
export function quality(cost: number): Quality {
  if (cost >= 0xffff) return "dead";
  if (cost <= 384) return "good";
  if (cost <= 1024) return "fair";
  return "poor";
}

export const colours: Record<Quality, string> = {
  good: "#2f9e44",
  fair: "#f08c00",
  poor: "#e03131",
  dead: "#868e96",
};
`;

const qualityTsAccessible = `export type Quality = "good" | "fair" | "poor" | "dead";

/**
 * Bucket a meshd link cost. 256 is a perfect link; 384 is roughly one lost
 * hello in eight, 1024 is half of them lost. 65535 means unreachable.
 */
export function quality(cost: number): Quality {
  if (cost >= 0xffff) return "dead";
  if (cost <= 384) return "good";
  if (cost <= 1024) return "fair";
  return "poor";
}

// Okabe-Ito colours: distinguishable with the common colour vision
// deficiencies, and in bright sunlight on a phone.
export const colours: Record<Quality, string> = {
  good: "#0072b2",
  fair: "#e69f00",
  poor: "#d55e00",
  dead: "#999999",
};

// Colour alone isn't enough, so worse links are also drawn dashed.
export const dashes: Record<Quality, string | undefined> = {
  good: undefined,
  fair: "10 5",
  poor: "3 6",
  dead: "1 8",
};

export const labels: Record<Quality, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  dead: "Down",
};
`;

const mapSvelte = `<script lang="ts">
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { onMount } from "svelte";

  import { colours, quality } from "../lib/quality";
  import type { Link, Site } from "../lib/types";

  export let sites: Site[];
  export let links: Link[];

  let container: HTMLDivElement;
  let layer: L.LayerGroup | undefined;

  onMount(() => {
    const map = L.map(container).setView([sites[0].lat, sites[0].lon], 15);
    L.tileLayer("https://tiles.example.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "Map data © OpenStreetMap contributors",
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    return () => map.remove();
  });

  $: if (layer) draw(layer, sites, links);

  function draw(layer: L.LayerGroup, sites: Site[], links: Link[]) {
    layer.clearLayers();
    const byId = new Map(sites.map(s => [s.routerId, s]));
    for (const link of links) {
      const a = byId.get(link.from);
      const b = byId.get(link.to);
      if (!a || !b) continue;
      L.polyline(
        [
          [a.lat, a.lon],
          [b.lat, b.lon],
        ],
        { color: colours[quality(link.cost)], weight: 4, opacity: 0.85 },
      )
        .bindTooltip(\`\${a.name} – \${b.name}: cost \${link.cost}\`)
        .addTo(layer);
    }
    for (const site of sites) {
      L.circleMarker([site.lat, site.lon], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#1971c2",
        fillOpacity: 1,
      })
        .bindTooltip(site.name)
        .addTo(layer);
    }
  }
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    height: 100%;
    width: 100%;
  }
</style>
`;

const appSvelte = `<script lang="ts">
  import { onMount } from "svelte";

  import MeshMap from "./components/MeshMap.svelte";
  import type { Link, Site } from "./lib/types";

  let sites: Site[] = [];
  let links: Link[] = [];
  let error: string | undefined;

  onMount(async () => {
    try {
      const res = await fetch("fixture.json");
      ({ sites, links } = await res.json());
    } catch (e) {
      error = \`Couldn't load fixture.json: \${e}\`;
    }
  });
</script>

<header>
  <h1>meshmap</h1>
</header>

<main>
  {#if error}
    <p class="error">{error}</p>
  {:else if sites.length > 0}
    <MeshMap {sites} {links} />
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #dee2e6;
  }
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }
  main {
    position: relative;
    height: calc(100vh - 2.6rem);
  }
  .error {
    padding: 1rem;
    color: #c92a2a;
  }
</style>
`;

const appSvelteLive = `<script lang="ts">
  import { onMount } from "svelte";

  import MeshMap from "./components/MeshMap.svelte";
  import NodePanel from "./components/NodePanel.svelte";
  import { fetchAll } from "./lib/api";
  import { buildLinks } from "./lib/links";
  import type { NodeReport, Site } from "./lib/types";

  const REFRESH_MS = 15_000;

  let sites: Site[] = [];
  let reports = new Map<string, NodeReport | Error>();
  let selected: string | undefined;
  let error: string | undefined;

  $: links = buildLinks(reports);
  $: site = sites.find(s => s.routerId === selected);

  async function refresh() {
    reports = await fetchAll(sites);
  }

  onMount(async () => {
    try {
      const res = await fetch("sites.json");
      sites = await res.json();
    } catch (e) {
      error = \`Couldn't load sites.json: \${e}\`;
      return;
    }
    await refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  });
</script>

<header>
  <h1>meshmap</h1>
</header>

<main>
  {#if error}
    <p class="error">{error}</p>
  {:else if sites.length > 0}
    <MeshMap {sites} {links} {reports} on:select={e => (selected = e.detail)} />
  {/if}
  {#if site}
    <NodePanel {site} {sites} {links} on:close={() => (selected = undefined)} />
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #dee2e6;
  }
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }
  main {
    position: relative;
    height: calc(100vh - 2.6rem);
  }
  .error {
    padding: 1rem;
    color: #c92a2a;
  }
</style>
`;

const fixture = `{
  "sites": [
    { "routerId": "02a1b2fffec3d4e5", "name": "Plaza", "lat": -13.5163, "lon": -71.9785 },
    { "routerId": "02a1b2fffec3d4f1", "name": "Bakery", "lat": -13.5141, "lon": -71.9752 },
    { "routerId": "02a1b2fffec3d502", "name": "Water tower", "lat": -13.5122, "lon": -71.9801 }
  ],
  "links": [
    { "from": "02a1b2fffec3d4e5", "to": "02a1b2fffec3d4f1", "cost": 256, "deliveryRatio": 1 },
    { "from": "02a1b2fffec3d4f1", "to": "02a1b2fffec3d502", "cost": 455, "deliveryRatio": 0.75 },
    { "from": "02a1b2fffec3d502", "to": "02a1b2fffec3d4e5", "cost": 1820, "deliveryRatio": 0.375 }
  ]
}
`;

const fixtureCerroVerde = `{
  "sites": [
    { "routerId": "02a1b2fffec3d4e5", "name": "Plaza", "lat": -13.5163, "lon": -71.9785 },
    { "routerId": "02a1b2fffec3d4f1", "name": "Bakery", "lat": -13.5141, "lon": -71.9752 },
    { "routerId": "02a1b2fffec3d502", "name": "Water tower", "lat": -13.5122, "lon": -71.9801 },
    { "routerId": "02a1b2fffec3d513", "name": "Cooperative", "lat": -13.5178, "lon": -71.9733 },
    { "routerId": "02a1b2fffec3d524", "name": "Rooftop 5", "lat": -13.5195, "lon": -71.9769 },
    { "routerId": "02a1b2fffec3d535", "name": "Gateway", "lat": -13.5109, "lon": -71.9744 }
  ],
  "links": [
    { "from": "02a1b2fffec3d4e5", "to": "02a1b2fffec3d4f1", "cost": 256, "deliveryRatio": 1 },
    { "from": "02a1b2fffec3d4f1", "to": "02a1b2fffec3d502", "cost": 455, "deliveryRatio": 0.75 },
    { "from": "02a1b2fffec3d502", "to": "02a1b2fffec3d4e5", "cost": 1820, "deliveryRatio": 0.375 },
    { "from": "02a1b2fffec3d4f1", "to": "02a1b2fffec3d535", "cost": 270, "deliveryRatio": 0.9375 },
    { "from": "02a1b2fffec3d4e5", "to": "02a1b2fffec3d524", "cost": 303, "deliveryRatio": 0.9375 },
    { "from": "02a1b2fffec3d524", "to": "02a1b2fffec3d513", "cost": 65535, "deliveryRatio": 0 },
    { "from": "02a1b2fffec3d513", "to": "02a1b2fffec3d4f1", "cost": 682, "deliveryRatio": 0.625 }
  ]
}
`;

const sitesJson = `[
  {
    "routerId": "02a1b2fffec3d4e5",
    "name": "Plaza",
    "lat": -13.5163,
    "lon": -71.9785,
    "bridge": "http://[fd42:6d65:7368:1::1]:8080"
  },
  {
    "routerId": "02a1b2fffec3d4f1",
    "name": "Bakery",
    "lat": -13.5141,
    "lon": -71.9752,
    "bridge": "http://[fd42:6d65:7368:2::1]:8080"
  },
  {
    "routerId": "02a1b2fffec3d502",
    "name": "Water tower",
    "lat": -13.5122,
    "lon": -71.9801,
    "bridge": "http://[fd42:6d65:7368:3::1]:8080"
  },
  {
    "routerId": "02a1b2fffec3d513",
    "name": "Cooperative",
    "lat": -13.5178,
    "lon": -71.9733,
    "bridge": "http://[fd42:6d65:7368:4::1]:8080"
  },
  {
    "routerId": "02a1b2fffec3d524",
    "name": "Rooftop 5",
    "lat": -13.5195,
    "lon": -71.9769,
    "bridge": "http://[fd42:6d65:7368:5::1]:8080"
  },
  {
    "routerId": "02a1b2fffec3d535",
    "name": "Gateway",
    "lat": -13.5109,
    "lon": -71.9744,
    "bridge": "http://[fd42:6d65:7368:6::1]:8080"
  }
]
`;

const qualityTest = `import { describe, expect, it } from "vitest";

import { quality } from "../src/lib/quality";

describe("quality", () => {
  it("treats a perfect link as good", () => {
    expect(quality(256)).toBe("good");
  });

  it("puts one lost hello in four at fair", () => {
    // A delivery ratio of 0.75 gives 256 / 0.5625 = 455.
    expect(quality(455)).toBe("fair");
  });

  it("calls anything worse than half the hellos lost poor", () => {
    expect(quality(1025)).toBe("poor");
  });

  it("treats 65535 as dead", () => {
    expect(quality(0xffff)).toBe("dead");
  });
});
`;

const nodePanel = `<script lang="ts">
  import { createEventDispatcher } from "svelte";

  import { colours, quality } from "../lib/quality";
  import type { Link, Site } from "../lib/types";

  export let site: Site;
  export let sites: Site[];
  export let links: Link[];

  const dispatch = createEventDispatcher<{ close: void }>();

  $: names = new Map(sites.map(s => [s.routerId, s.name]));
  $: neighbours = links
    .filter(l => l.from === site.routerId || l.to === site.routerId)
    .map(l => {
      const id = l.from === site.routerId ? l.to : l.from;
      return { id, name: names.get(id) ?? id, cost: l.cost, deliveryRatio: l.deliveryRatio };
    });
</script>

<aside>
  <button class="close" on:click={() => dispatch("close")} aria-label="Close">×</button>
  <h2>{site.name}</h2>
  <p class="id">{site.routerId}</p>
  {#if neighbours.length === 0}
    <p>No neighbours.</p>
  {:else}
    <table>
      <thead>
        <tr><th>Neighbour</th><th>Cost</th><th>Hellos</th></tr>
      </thead>
      <tbody>
        {#each neighbours as n (n.id)}
          <tr>
            <td>
              <span class="dot" style="background: {colours[quality(n.cost)]}"></span>
              {n.name}
            </td>
            <td>{n.cost}</td>
            <td>{Math.round(n.deliveryRatio * 100)}%</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</aside>

<style>
  aside {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    width: 18rem;
    padding: 1rem;
    background: white;
    border-radius: 6px;
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .id {
    margin: 0.2rem 0 0.8rem;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    color: #868e96;
  }
  .close {
    float: right;
    border: none;
    background: none;
    font-size: 1.2rem;
    cursor: pointer;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: #868e96;
  }
  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    margin-right: 0.3rem;
  }
</style>
`;

const bridgeTs = `// Serves this router's meshd state as JSON for meshmap.
//
//   node --experimental-strip-types bridge/bridge.ts [socket] [port]
//
// GET /meshd.json answers with {"version": ..., "neighbours": [...]}.

import { createServer } from "node:http";
import { createConnection } from "node:net";

const socketPath = process.argv[2] ?? "/run/meshd.sock";
const port = Number(process.argv[3] ?? 8080);

function ask(command: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = createConnection(socketPath, () => conn.end(command + "\\n"));
    let data = "";
    conn.setEncoding("utf8");
    conn.on("data", chunk => (data += chunk));
    conn.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    conn.on("error", reject);
  });
}

createServer(async (req, res) => {
  if (req.method !== "GET" || req.url !== "/meshd.json") {
    res.writeHead(404).end();
    return;
  }
  try {
    const [version, neighbours] = await Promise.all([ask("version"), ask("neighbours")]);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ ...version, ...neighbours }));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "text/plain" }).end(\`meshd: \${e}\\n\`);
  }
}).listen(port, "::", () => console.log(\`bridge on :\${port}, meshd at \${socketPath}\`));
`;

const cgiR1 = `#!/bin/sh
# CGI for uhttpd: this router's meshd state as JSON, for meshmap.
# Install as /www/cgi-bin/meshd.json and chmod +x it.

SOCKET=\${MESHD_SOCKET:-/run/meshd.sock}

ask() {
	echo "$1" | socat -t 2 - "UNIX-CONNECT:$SOCKET"
}

echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo ""

{ ask version; ask neighbours; } | jq -cs '.[0] * .[1]'
`;

const cgi = `#!/bin/sh
# CGI for uhttpd on OpenWrt: this router's meshd version and neighbours as
# one JSON object, for meshmap.
#
# Install as /www/cgi-bin/meshd.json and chmod +x it. Needs socat
# (opkg install socat); nothing else.

SOCKET=\${MESHD_SOCKET:-/run/meshd.sock}

ask() {
	echo "$1" | socat -t 2 - "UNIX-CONNECT:$SOCKET"
}

echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo "Cache-Control: no-store"
echo ""

version=$(ask version) || version='{"version":null}'
neighbours=$(ask neighbours) || neighbours='{"neighbours":[]}'

# Both replies are one JSON object on one line. Merge them by dropping the
# closing brace of the first and the opening brace of the second.
printf '%s,%s\\n' "\${version%\\}}" "\${neighbours#\\{}"
`;

const apiTs = `import type { NodeReport, Site } from "./types";

const TIMEOUT_MS = 4000;

export async function fetchReport(site: Site): Promise<NodeReport> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(\`\${site.bridge}/meshd.json\`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(\`\${site.name}: HTTP \${res.status}\`);
    }
    const body = await res.json();
    return { ...body, fetchedAt: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

/** Ask every site at once. A site that doesn't answer maps to its Error. */
export async function fetchAll(sites: Site[]): Promise<Map<string, NodeReport | Error>> {
  const results = await Promise.allSettled(sites.map(fetchReport));
  const out = new Map<string, NodeReport | Error>();
  results.forEach((r, i) => {
    out.set(sites[i].routerId, r.status === "fulfilled" ? r.value : (r.reason as Error));
  });
  return out;
}
`;

const linksTs = `import type { Link, NodeReport } from "./types";

/** Every link a site reports to one of its neighbours. */
export function buildLinks(reports: Map<string, NodeReport | Error>): Link[] {
  const links: Link[] = [];
  for (const [id, report] of reports) {
    if (report instanceof Error) continue;
    for (const n of report.neighbours) {
      links.push({ from: id, to: n.router_id, cost: n.cost, deliveryRatio: n.delivery_ratio });
    }
  }
  return links;
}
`;

const linksTsDedupe = `import type { Link, NodeReport } from "./types";

/**
 * One link per pair of sites. Both ends usually report the link; we keep
 * the worse of the two, since traffic has to cross it in both directions.
 */
export function buildLinks(reports: Map<string, NodeReport | Error>): Link[] {
  const links = new Map<string, Link>();
  for (const [id, report] of reports) {
    if (report instanceof Error) continue;
    for (const n of report.neighbours) {
      const key = [id, n.router_id].sort().join("-");
      const existing = links.get(key);
      if (!existing || n.cost > existing.cost) {
        links.set(key, { from: id, to: n.router_id, cost: n.cost, deliveryRatio: n.delivery_ratio });
      }
    }
  }
  return [...links.values()];
}
`;

const linksTest = `import { describe, expect, it } from "vitest";

import { buildLinks } from "../src/lib/links";
import type { NodeReport } from "../src/lib/types";

function report(neighbours: [string, number][]): NodeReport {
  return {
    version: "0.3.0",
    fetchedAt: 0,
    neighbours: neighbours.map(([id, cost]) => ({
      router_id: id,
      addr: "",
      cost,
      delivery_ratio: 256 / cost,
    })),
  };
}

describe("buildLinks", () => {
  it("returns one link for a pair that both report", () => {
    const links = buildLinks(
      new Map([
        ["a", report([["b", 256]])],
        ["b", report([["a", 300]])],
      ]),
    );
    expect(links).toHaveLength(1);
  });

  it("keeps the worse direction", () => {
    const links = buildLinks(
      new Map([
        ["a", report([["b", 256]])],
        ["b", report([["a", 900]])],
      ]),
    );
    expect(links[0].cost).toBe(900);
  });

  it("skips sites that didn't answer", () => {
    const links = buildLinks(
      new Map<string, NodeReport | Error>([
        ["a", new Error("timeout")],
        ["b", report([["c", 256]])],
      ]),
    );
    expect(links.map(l => l.from)).toEqual(["b"]);
  });
});
`;

const cacheTs = `import type { NodeReport } from "./types";

const KEY = "meshmap:reports:v1";

/** Remember the reports that came back, so the map still shows something offline. */
export function save(reports: Map<string, NodeReport | Error>): void {
  const ok = [...reports].filter(([, r]) => !(r instanceof Error));
  localStorage.setItem(KEY, JSON.stringify(ok));
}

export function load(): Map<string, NodeReport | Error> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return new Map();
  try {
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}
`;

const cacheTsV2 = `import type { NodeReport } from "./types";

const KEY = "meshmap:reports:v2";

export interface Cached {
  savedAt: number;
  reports: Map<string, NodeReport | Error>;
}

/** Remember the reports that came back, so the map still shows something offline. */
export function save(reports: Map<string, NodeReport | Error>): void {
  const ok = [...reports].filter(([, r]) => !(r instanceof Error));
  localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), reports: ok }));
}

export function load(): Cached | undefined {
  const raw = localStorage.getItem(KEY);
  if (!raw) return undefined;
  try {
    const { savedAt, reports } = JSON.parse(raw);
    return { savedAt, reports: new Map(reports) };
  } catch {
    return undefined;
  }
}
`;

const cacheTsQuota = `import type { NodeReport } from "./types";

const KEY = "meshmap:reports:v2";

export interface Cached {
  savedAt: number;
  reports: Map<string, NodeReport | Error>;
}

/**
 * Remember the reports that came back, so the map still shows something
 * offline. Failing to save is never fatal: storage can be full, disabled
 * (private windows on some phones) or missing altogether.
 */
export function save(reports: Map<string, NodeReport | Error>): void {
  const ok = [...reports].filter(([, r]) => !(r instanceof Error));
  const value = JSON.stringify({ savedAt: Date.now(), reports: ok });
  try {
    localStorage.setItem(KEY, value);
  } catch (e) {
    console.warn(\`meshmap: couldn't cache \${value.length} bytes of reports\`, e);
    try {
      localStorage.removeItem("meshmap:reports:v1");
      localStorage.setItem(KEY, value);
    } catch {
      // Still no room. The map works without the cache.
    }
  }
}

export function load(): Cached | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    const { savedAt, reports } = JSON.parse(raw);
    return { savedAt, reports: new Map(reports) };
  } catch {
    return undefined;
  }
}
`;

const legendSvelte = `<script lang="ts">
  import { colours, dashes, labels, type Quality } from "../lib/quality";

  const qualities: Quality[] = ["good", "fair", "poor", "dead"];
</script>

<div class="legend" aria-label="Link quality">
  {#each qualities as q}
    <div class="row">
      <svg width="28" height="8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="28"
          y2="4"
          stroke={colours[q]}
          stroke-width="4"
          stroke-dasharray={dashes[q]}
        />
      </svg>
      {labels[q]}
    </div>
  {/each}
</div>

<style>
  .legend {
    position: absolute;
    bottom: 1.5rem;
    left: 0.6rem;
    z-index: 1000;
    padding: 0.4rem 0.6rem;
    background: rgb(255 255 255 / 0.9);
    border-radius: 4px;
    font-size: 0.8rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
`;

const swR1 = String.raw`// Caches map tiles so the map still works on a phone that has lost its
// connection to the internet.

const TILES = "meshmap-tiles-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (/\/\d+\/\d+\/\d+\.png$/.test(url.pathname)) {
    event.respondWith(tile(event.request));
  }
});

async function tile(request) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}
`;

const sw = String.raw`// Caches map tiles and the app shell so the map still works on a phone that
// has lost its connection to the internet, or to everything.

const SHELL = "meshmap-shell-v1";
const TILES = "meshmap-tiles-v1";
// About 30 MB of tiles: a whole town at zoom 13-18.
const MAX_TILES = 2000;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(["./", "./index.html", "./sites.json"])));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k)))),
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (/\/\d+\/\d+\/\d+\.png$/.test(url.pathname)) {
    event.respondWith(tile(event.request));
  } else if (url.origin === location.origin) {
    // Network first for the app itself, so a new deploy shows up at once.
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request)),
    );
  }
  // Everything else (the bridges) goes straight to the network: stale
  // link data is handled by the app's own cache, with a timestamp.
});

async function tile(request) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) {
    await cache.delete(key);
  }
}
`;

const changelog010 = `# Changelog

## 0.1.0

- Map of every site in \`public/sites.json\`, links coloured by ETX cost
- Live data from a small bridge on each router (needs meshd 0.3's
  \`neighbours\` command)
- Click a site to see its neighbours
- The last good data is kept in localStorage and shown when offline
- Tile server configurable with \`VITE_TILE_URL\`
`;

const routePathDraft = `import type { Link } from "./types";

/**
 * Cheapest path from one site to another over the links we know about,
 * by summed cost. This is what meshd would pick if every router had the
 * same view of the mesh, which is close enough to explain most routes.
 */
export function cheapestPath(links: Link[], from: string, to: string): string[] | undefined {
  const edges = new Map<string, { to: string; cost: number }[]>();
  for (const l of links) {
    if (l.cost >= 0xffff) continue;
    edges.set(l.from, [...(edges.get(l.from) ?? []), { to: l.to, cost: l.cost }]);
    edges.set(l.to, [...(edges.get(l.to) ?? []), { to: l.from, cost: l.cost }]);
  }
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set<string>([from]);
  while (todo.size > 0) {
    let current = [...todo].reduce((a, b) => (dist.get(a)! <= dist.get(b)! ? a : b));
    todo.delete(current);
    if (current === to) break;
    for (const e of edges.get(current) ?? []) {
      const d = dist.get(current)! + e.cost;
      if (d < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, d);
        prev.set(e.to, current);
        todo.add(e.to);
      }
    }
  }
  if (!dist.has(to)) return undefined;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}
`;

const siteSearch = `<script lang="ts">
  import { createEventDispatcher } from "svelte";

  import type { Site } from "../lib/types";

  export let sites: Site[];

  const dispatch = createEventDispatcher<{ select: string }>();

  let query = "";

  $: matches =
    query.trim() === ""
      ? []
      : sites.filter(s => s.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);

  function pick(site: Site) {
    dispatch("select", site.routerId);
    query = "";
  }
</script>

<div class="search">
  <input type="search" placeholder="Find a site" bind:value={query} />
  {#if matches.length > 0}
    <ul>
      {#each matches as site (site.routerId)}
        <li><button on:click={() => pick(site)}>{site.name}</button></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
    margin-left: auto;
  }
  input {
    width: 12rem;
    padding: 0.25rem 0.5rem;
  }
  ul {
    position: absolute;
    z-index: 1100;
    margin: 0;
    padding: 0;
    list-style: none;
    background: white;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
    width: 100%;
  }
  button {
    width: 100%;
    padding: 0.3rem 0.5rem;
    border: none;
    background: none;
    text-align: left;
  }
</style>
`;

export const meshmap: RepoSeed = {
  owner: { org: "meshwork" },
  name: "meshmap",
  description:
    "A web map of community mesh nodes and the quality of the links between them, fed by meshd.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["noor", "diego"],
  threshold: 1,
  seeding: 12,
  files: {
    "README.md": readme,
    LICENSE: license,
    ".gitignore": gitignore,
    "package.json": packageJson,
    "tsconfig.json": tsconfig,
    "vite.config.ts": viteConfig,
    "index.html": indexHtml,
    "src/main.ts": mainTs,
    "src/App.svelte": appSvelte,
    "src/components/MeshMap.svelte": mapSvelte,
    "src/lib/types.ts": typesTs,
    "src/lib/quality.ts": qualityTs,
    "public/fixture.json": fixture,
  },
  root: {
    label: "root",
    message: `Initial commit: a map drawn from a fixture

Leaflet, three sites and three links from a hand-written fixture. No
live data yet; meshd's control socket doesn't have per-link information
for the map to use.`,
    author: "noor",
    daysAgo: 248,
  },
  history: [
    {
      label: "quality-tests",
      message: `Add tests for the link quality thresholds

The thresholds are the one bit of logic where a typo would quietly
paint every link green.`,
      author: "noor",
      daysAgo: 244,
      changes: {
        "tests/quality.test.ts": qualityTest,
        "package.json": [
          [
            '"check": "svelte-check --tsconfig ./tsconfig.json"\n',
            '"check": "svelte-check --tsconfig ./tsconfig.json",\n    "test": "vitest run"\n',
          ],
          ['"vite": "^5.3.4"\n', '"vite": "^5.3.4",\n    "vitest": "^2.0.3"\n'],
        ],
      },
    },
    {
      label: "fixture-cerro-verde",
      message: `fixture: use the real Cerro Verde sites

Six rooftops at their actual positions, with link costs copied from
the routers' debug logs this morning. Makes it much easier to judge
whether the map is readable.`,
      author: "diego",
      daysAgo: 236,
      changes: {
        "public/fixture.json": fixtureCerroVerde,
      },
    },
    {
      label: "node-panel",
      message: `Click a site to see its neighbours

Opens a panel with each neighbour's link cost and the share of hellos
that arrive.`,
      author: "noor",
      daysAgo: 229,
      changes: {
        "src/components/NodePanel.svelte": nodePanel,
        "src/components/MeshMap.svelte": [
          ['import { onMount } from "svelte";', 'import { createEventDispatcher, onMount } from "svelte";'],
          [
            "  let container: HTMLDivElement;\n",
            "  const dispatch = createEventDispatcher<{ select: string }>();\n\n  let container: HTMLDivElement;\n",
          ],
          [
            "        .bindTooltip(site.name)\n",
            '        .bindTooltip(site.name)\n        .on("click", () => dispatch("select", site.routerId))\n',
          ],
        ],
        "src/App.svelte": [
          [
            'import MeshMap from "./components/MeshMap.svelte";\n',
            'import MeshMap from "./components/MeshMap.svelte";\n  import NodePanel from "./components/NodePanel.svelte";\n',
          ],
          [
            "  let error: string | undefined;\n",
            "  let selected: string | undefined;\n  let error: string | undefined;\n\n  $: site = sites.find(s => s.routerId === selected);\n",
          ],
          [
            "    <MeshMap {sites} {links} />\n  {/if}\n",
            "    <MeshMap {sites} {links} on:select={e => (selected = e.detail)} />\n  {/if}\n  {#if site}\n    <NodePanel {site} {sites} {links} on:close={() => (selected = undefined)} />\n  {/if}\n",
          ],
        ],
      },
    },
    {
      label: "tile-url",
      message: `Make the tile server configurable

Set VITE_TILE_URL at build time to use your own tile server, e.g. one
running on the mesh itself so the map works without an uplink.`,
      author: "hana",
      daysAgo: 214,
      changes: {
        "src/components/MeshMap.svelte": [
          [
            'L.tileLayer("https://tiles.example.org/{z}/{x}/{y}.png", {',
            'L.tileLayer(import.meta.env.VITE_TILE_URL ?? "https://tiles.example.org/{z}/{x}/{y}.png", {',
          ],
        ],
        ".env.example": `# Tile server for the map, in Leaflet's {z}/{x}/{y} format.
VITE_TILE_URL=https://tiles.example.org/{z}/{x}/{y}.png
`,
        "README.md": [
          [
            "Until the bridge exists the map draws `public/fixture.json`.\n",
            "Until the bridge exists the map draws `public/fixture.json`.\n\nTo use a different tile server, copy `.env.example` to `.env` and set\n`VITE_TILE_URL`.\n",
          ],
        ],
      },
    },
    {
      label: "fit-bounds",
      message: `Fit the map to all sites on load

Centring on the first site cut off half the mesh on a phone.`,
      author: "noor",
      daysAgo: 197,
      changes: {
        "src/components/MeshMap.svelte": [
          [
            "    const map = L.map(container).setView([sites[0].lat, sites[0].lon], 15);\n",
            "    const map = L.map(container);\n    map.fitBounds(L.latLngBounds(sites.map(s => [s.lat, s.lon])), { padding: [40, 40] });\n",
          ],
        ],
      },
    },
    {
      label: "bridge",
      message: `Add a bridge that serves meshd state over HTTP

Browsers can't talk to a Unix socket, so each router runs a tiny HTTP
server that asks meshd for "version" and "neighbours" and returns both
as one JSON object at /meshd.json. Needs meshd with the neighbours
command.`,
      author: "noor",
      daysAgo: 186,
      changes: {
        "bridge/bridge.ts": bridgeTs,
        "package.json": [
          [
            '"test": "vitest run"\n',
            '"test": "vitest run",\n    "bridge": "node --experimental-strip-types bridge/bridge.ts"\n',
          ],
          [
            '"@types/leaflet": "^1.9.12",\n',
            '"@types/leaflet": "^1.9.12",\n    "@types/node": "^20.14.10",\n',
          ],
        ],
      },
    },
    {
      label: "live",
      message: `Fetch live data from every site's bridge

sites.json lists each site with the address of its bridge. Every 15 s
the map asks all of them at once; a site that doesn't answer within
4 s is drawn grey. Links come from what each site reports about its
neighbours. The fixture is gone.`,
      author: "noor",
      daysAgo: 184,
      changes: {
        "src/lib/api.ts": apiTs,
        "src/lib/links.ts": linksTs,
        "src/lib/types.ts": typesTsLive,
        "src/App.svelte": appSvelteLive,
        "public/sites.json": sitesJson,
        "public/fixture.json": null,
        "src/components/MeshMap.svelte": [
          [
            'import type { Link, Site } from "../lib/types";\n',
            'import type { Link, NodeReport, Site } from "../lib/types";\n',
          ],
          [
            "  export let links: Link[];\n",
            "  export let links: Link[];\n  export let reports: Map<string, NodeReport | Error> = new Map();\n",
          ],
          ["  $: if (layer) draw(layer, sites, links);", "  $: if (layer) draw(layer, sites, links, reports);"],
          [
            "  function draw(layer: L.LayerGroup, sites: Site[], links: Link[]) {",
            "  function draw(\n    layer: L.LayerGroup,\n    sites: Site[],\n    links: Link[],\n    reports: Map<string, NodeReport | Error>,\n  ) {",
          ],
          [
            "    for (const site of sites) {\n",
            "    for (const site of sites) {\n      const report = reports.get(site.routerId);\n      const up = report !== undefined && !(report instanceof Error);\n",
          ],
          ['        fillColor: "#1971c2",', '        fillColor: up ? "#1971c2" : "#868e96",'],
        ],
        "README.md": [
          [
            "Until the bridge exists the map draws `public/fixture.json`.\n",
            "The map needs a bridge running on every router, next to meshd:\n\n    npm run bridge -- /run/meshd.sock 8080\n",
          ],
          [
            "Each site in `public/sites.json` has a router id, a name and coordinates.\n",
            "Each site in `public/sites.json` has a router id, a name, coordinates and\nthe URL of its bridge. Every 15 seconds the map asks each bridge for its\nrouter's neighbours.\n",
          ],
        ],
      },
    },
    {
      label: "cache",
      message: `Keep the last good data for offline use

When no bridge answers (usually: the phone has left the mesh) the map
keeps showing the last reports it got, saved in localStorage, with a
badge saying so.`,
      author: "noor",
      daysAgo: 171,
      changes: {
        "src/lib/cache.ts": cacheTs,
        "src/App.svelte": [
          ['  import { fetchAll } from "./lib/api";\n', '  import { fetchAll } from "./lib/api";\n  import * as cache from "./lib/cache";\n'],
          ["  let error: string | undefined;\n", "  let error: string | undefined;\n  let offline = false;\n"],
          [
            "    reports = await fetchAll(sites);\n  }\n",
            "    const fresh = await fetchAll(sites);\n    if ([...fresh.values()].some(r => !(r instanceof Error))) {\n      reports = fresh;\n      cache.save(fresh);\n      offline = false;\n    } else {\n      offline = true;\n    }\n  }\n",
          ],
          ["    await refresh();\n", "    reports = cache.load();\n    await refresh();\n"],
          [
            "  <h1>meshmap</h1>\n",
            '  <h1>meshmap</h1>\n  {#if offline}\n    <span class="offline">Offline: showing the last data we had</span>\n  {/if}\n',
          ],
          [
            "  .error {\n",
            "  .offline {\n    padding: 0.1rem 0.5rem;\n    border-radius: 999px;\n    background: #fff3bf;\n    font-size: 0.8rem;\n  }\n  .error {\n",
          ],
        ],
      },
    },
    {
      label: "timer-leak",
      message: `Fix the refresh timer leaking

onMount was given an async function, so it got a Promise back instead
of the cleanup function and the interval was never cleared. With Vite's
hot reload every save added another timer, and after an hour of work
the bridges were getting a dozen requests every 15 seconds.`,
      author: "kofi",
      daysAgo: 160,
      changes: {
        "src/App.svelte": [
          [
            "  onMount(async () => {\n    try {",
            "  onMount(() => {\n    let timer: ReturnType<typeof setInterval> | undefined;\n    start().then(ok => {\n      if (ok) timer = setInterval(refresh, REFRESH_MS);\n    });\n    return () => clearInterval(timer);\n  });\n\n  async function start(): Promise<boolean> {\n    try {",
          ],
          [
            "      return;\n    }\n    reports = cache.load();\n    await refresh();\n    const timer = setInterval(refresh, REFRESH_MS);\n    return () => clearInterval(timer);\n  });\n",
            "      return false;\n    }\n    reports = cache.load();\n    await refresh();\n    return true;\n  }\n",
          ],
        ],
      },
    },
    {
      label: "v0.1.0",
      message: `Release 0.1.0`,
      author: "noor",
      daysAgo: 148,
      changes: {
        "package.json": [['"version": "0.0.0"', '"version": "0.1.0"']],
        "CHANGELOG.md": changelog010,
      },
    },
    {
      label: "cgi",
      message: `Replace the Node bridge with a CGI script for uhttpd

Most of our routers have 64 MB of RAM and no room for Node. Every
OpenWrt router already runs uhttpd for LuCI, so the bridge is now a
shell script it runs as CGI. It needs socat and nothing else.

The map now fetches /cgi-bin/meshd.json from each site.`,
      author: "yuki",
      daysAgo: 133,
      changes: {
        "bridge/meshd.cgi": cgi,
        "bridge/bridge.ts": null,
        "src/lib/api.ts": [["${site.bridge}/meshd.json", "${site.bridge}/cgi-bin/meshd.json"]],
        "package.json": [
          [
            '"test": "vitest run",\n    "bridge": "node --experimental-strip-types bridge/bridge.ts"\n',
            '"test": "vitest run"\n',
          ],
          ['    "@types/node": "^20.14.10",\n', ""],
        ],
        "README.md": [
          [
            "The map needs a bridge running on every router, next to meshd:\n\n    npm run bridge -- /run/meshd.sock 8080\n",
            "The map needs a bridge on every router, next to meshd. On OpenWrt:\n\n    opkg install socat\n    cp bridge/meshd.cgi /www/cgi-bin/meshd.json\n    chmod +x /www/cgi-bin/meshd.json\n\nA site's `bridge` in `sites.json` is then just the router's address,\ne.g. `http://[fd42:6d65:7368:1::1]`.\n",
          ],
        ],
        "public/sites.json": [
          ['"http://[fd42:6d65:7368:1::1]:8080"', '"http://[fd42:6d65:7368:1::1]"'],
          ['"http://[fd42:6d65:7368:2::1]:8080"', '"http://[fd42:6d65:7368:2::1]"'],
          ['"http://[fd42:6d65:7368:3::1]:8080"', '"http://[fd42:6d65:7368:3::1]"'],
          ['"http://[fd42:6d65:7368:4::1]:8080"', '"http://[fd42:6d65:7368:4::1]"'],
          ['"http://[fd42:6d65:7368:5::1]:8080"', '"http://[fd42:6d65:7368:5::1]"'],
          ['"http://[fd42:6d65:7368:6::1]:8080"', '"http://[fd42:6d65:7368:6::1]"'],
        ],
      },
    },
    {
      label: "school-clinic",
      message: `sites: add the school and the clinic

Both went up last weekend. The clinic's coordinates are the mast, not
the building; the antenna is on the hill behind it.`,
      author: "diego",
      daysAgo: 120,
      changes: {
        "public/sites.json": [
          [
            '    "bridge": "http://[fd42:6d65:7368:6::1]"\n  }\n]',
            '    "bridge": "http://[fd42:6d65:7368:6::1]"\n  },\n  {\n    "routerId": "02a1b2fffec3d546",\n    "name": "School",\n    "lat": -13.5214,\n    "lon": -71.9718,\n    "bridge": "http://[fd42:6d65:7368:7::1]"\n  },\n  {\n    "routerId": "02a1b2fffec3d557",\n    "name": "Clinic",\n    "lat": -13.5089,\n    "lon": -71.9827,\n    "bridge": "http://[fd42:6d65:7368:8::1]"\n  }\n]',
          ],
        ],
      },
    },
    {
      label: "sort-neighbours",
      message: `NodePanel: list the best links first`,
      author: "noor",
      daysAgo: 110,
      changes: {
        "src/components/NodePanel.svelte": [
          [
            "      return { id, name: names.get(id) ?? id, cost: l.cost, deliveryRatio: l.deliveryRatio };\n    });\n",
            "      return { id, name: names.get(id) ?? id, cost: l.cost, deliveryRatio: l.deliveryRatio };\n    })\n    .sort((a, b) => a.cost - b.cost);\n",
          ],
        ],
      },
    },
    {
      label: "cb-colours",
      message: `Use colour-blind friendly link colours, and dash bad links

Red and green were close to indistinguishable for a good share of the
people who use the map, and hard for everyone in direct sun. Switches
to the Okabe-Ito palette and draws fair, poor and dead links with
increasingly sparse dashes, so the quality is readable without colour.`,
      author: "zeynep",
      daysAgo: 104,
      changes: {
        "src/lib/quality.ts": qualityTsAccessible,
        "src/components/MeshMap.svelte": [
          ['import { colours, quality } from "../lib/quality";', 'import { colours, dashes, quality } from "../lib/quality";'],
          [
            "        { color: colours[quality(link.cost)], weight: 4, opacity: 0.85 },\n",
            "        {\n          color: colours[quality(link.cost)],\n          dashArray: dashes[quality(link.cost)],\n          weight: 4,\n          opacity: 0.85,\n        },\n",
          ],
        ],
        "README.md": [
          [
            "green up to 384 (one lost hello in eight), orange up to 1024, red above,\ngrey for a dead link.\n",
            "blue and solid up to 384 (one lost hello in eight), orange and dashed up\nto 1024, red and dotted above, grey for a dead link.\n",
          ],
        ],
      },
    },
    {
      label: "offline-time",
      message: `Say how old the data is when offline

"Showing the last data we had" isn't much use if you can't tell
whether that was five minutes or five days ago. The cache now stores
when it was saved, and the badge shows it. Bumps the cache key; the
old entry is simply ignored.`,
      author: "noor",
      daysAgo: 92,
      changes: {
        "src/lib/cache.ts": cacheTsV2,
        "src/App.svelte": [
          ["  let offline = false;\n", "  let offline = false;\n  let savedAt: number | undefined;\n"],
          ["      cache.save(fresh);\n", "      cache.save(fresh);\n      savedAt = Date.now();\n"],
          [
            "    reports = cache.load();\n",
            "    const cached = cache.load();\n    if (cached) {\n      reports = cached.reports;\n      savedAt = cached.savedAt;\n    }\n",
          ],
          [
            '    <span class="offline">Offline: showing the last data we had</span>\n',
            '    <span class="offline">\n      Offline: showing data from {savedAt ? new Date(savedAt).toLocaleString() : "earlier"}\n    </span>\n',
          ],
        ],
      },
    },
    {
      label: "quota",
      message: `cache: survive storage errors

On a phone in a private tab localStorage.setItem throws, and on the
Umeå mesh the cache outgrew Safari's quota; either way the exception
escaped refresh() and the map stopped updating. Saving now logs and
carries on, after one attempt to make room by removing the v1 entry
that offline-time left behind.`,
      author: "malik",
      daysAgo: 80,
      changes: {
        "src/lib/cache.ts": cacheTsQuota,
      },
    },
    {
      label: "dedupe",
      message: `Draw each link once, using the worse direction

Both ends of a link report it, so every line was drawn twice, on top
of each other, and the colour you saw depended on which report came
last. Links are now keyed by the pair of sites and keep the higher
cost of the two.`,
      author: "noor",
      daysAgo: 66,
      changes: {
        "src/lib/links.ts": linksTsDedupe,
        "tests/links.test.ts": linksTest,
      },
    },
    {
      label: "v0.2.0",
      message: `Release 0.2.0`,
      author: "noor",
      daysAgo: 55,
      changes: {
        "package.json": [['"version": "0.1.0"', '"version": "0.2.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.2.0

- The bridge is a shell script for uhttpd now; no Node on the routers (yuki)
- Colour-blind friendly link colours, with dashes for worse links (zeynep)
- Each link is drawn once, with the worse of its two directions
- The offline badge says how old the data is
- Storage errors no longer stop the map from updating (malik)
- School and clinic sites added
`,
          ],
        ],
      },
    },
    {
      label: "legend",
      message: `Add a legend for link quality

Shows the four colours and dash patterns in the bottom left corner,
above Leaflet's attribution.`,
      author: "theo",
      daysAgo: 41,
      changes: {
        "src/components/Legend.svelte": legendSvelte,
        "src/App.svelte": [
          [
            '  import { fetchAll } from "./lib/api";\n',
            '  import Legend from "./components/Legend.svelte";\n  import { fetchAll } from "./lib/api";\n',
          ],
          [
            "    <MeshMap {sites} {links} {reports} on:select={e => (selected = e.detail)} />\n",
            "    <MeshMap {sites} {links} {reports} on:select={e => (selected = e.detail)} />\n    <Legend />\n",
          ],
        ],
      },
    },
    {
      label: "sw",
      message: `Cache tiles and the app with a service worker

On a roof with no uplink the map loaded its data from the mesh just
fine but had no background, which makes it hard to tell which dot is
which. A service worker now keeps up to 2000 tiles (about a town's
worth) and the app shell. Bridges are never cached here; the app's own
cache handles stale link data, with a timestamp.`,
      author: "noor",
      daysAgo: 34,
      changes: {
        "public/sw.js": sw,
        "src/main.ts": [
          [
            "export default app;\n",
            'if ("serviceWorker" in navigator && import.meta.env.PROD) {\n  navigator.serviceWorker.register("./sw.js").catch(e => console.warn("meshmap: service worker", e));\n}\n\nexport default app;\n',
          ],
        ],
      },
    },
    {
      label: "readme-deploy",
      message: `README: how to deploy

Covers building with a custom tile URL and serving dist/ from any static
host, including a router's own uhttpd, which is what we do at the
hackerspace.`,
      author: "sol",
      daysAgo: 20,
      changes: {
        "README.md": [
          [
            "## How it works\n",
            "## Deploying\n\n    VITE_TILE_URL=https://tiles.example.org/{z}/{x}/{y}.png npm run build\n\n`dist/` is a static site with relative paths: copy it anywhere, including\n`/www/meshmap/` on a router, and edit `sites.json` there. The service\nworker only runs over HTTPS or on localhost, so offline tiles need one of\nthose.\n\n## How it works\n",
          ],
        ],
      },
    },
    {
      label: "last-seen",
      message: `NodePanel: show when each neighbour was last heard

meshd 0.4 reports last_seen_ms for every neighbour. Show it as "3s ago"
in the panel; with older meshd versions the column is just empty.`,
      author: "noor",
      daysAgo: 5,
      changes: {
        "src/lib/types.ts": [
          [
            "  delivery_ratio: number;\n}",
            "  delivery_ratio: number;\n  /** Added in meshd 0.4. */\n  last_seen_ms?: number;\n  hello_interval_ms?: number;\n}",
          ],
        ],
        "src/components/NodePanel.svelte": [
          ['  import type { Link, Site } from "../lib/types";\n', '  import type { Link, NodeReport, Site } from "../lib/types";\n'],
          [
            "  export let links: Link[];\n",
            "  export let links: Link[];\n  export let report: NodeReport | Error | undefined = undefined;\n",
          ],
          [
            "  $: names = new Map(sites.map(s => [s.routerId, s.name]));\n",
            "  $: names = new Map(sites.map(s => [s.routerId, s.name]));\n  $: lastSeen = new Map(\n    report && !(report instanceof Error)\n      ? report.neighbours.map(n => [n.router_id, n.last_seen_ms])\n      : [],\n  );\n\n  function ago(ms: number | undefined): string {\n    if (ms === undefined) return \"\";\n    const s = Math.round(ms / 1000);\n    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;\n  }\n",
          ],
          [
            "<tr><th>Neighbour</th><th>Cost</th><th>Hellos</th></tr>",
            "<tr><th>Neighbour</th><th>Cost</th><th>Hellos</th><th>Heard</th></tr>",
          ],
          [
            "            <td>{Math.round(n.deliveryRatio * 100)}%</td>\n",
            "            <td>{Math.round(n.deliveryRatio * 100)}%</td>\n            <td>{ago(lastSeen.get(n.id))}</td>\n",
          ],
        ],
        "src/App.svelte": [
          [
            "<NodePanel {site} {sites} {links} on:close",
            "<NodePanel {site} {sites} {links} report={reports.get(site.routerId)} on:close",
          ],
        ],
      },
    },
    {
      label: "deps",
      message: `Update dependencies

vite 5.4 and svelte 4.2.19; no code changes needed.`,
      author: "diego",
      daysAgo: 2,
      changes: {
        "package.json": [
          ['"svelte": "^4.2.18"', '"svelte": "^4.2.19"'],
          ['"vite": "^5.3.4"', '"vite": "^5.4.10"'],
          ['"typescript": "^5.5.3"', '"typescript": "^5.6.3"'],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Which meshd fields can the map rely on?",
      author: "noor",
      daysAgo: 246,
      body: "Writing this down so I don't forget: the fixture has `cost` and `deliveryRatio` per link, but meshd's control socket only has `routes` right now, which don't say anything about individual links. Tracking the meshd side in the meshd repo; this issue is for switching the map over once it lands.",
      labels: ["question"],
      assignees: ["noor"],
      state: "solved",
      closedHoursAfter: 1490,
      comments: [
        {
          author: "felix",
          body: "A `neighbours` command is easy to add on the meshd side. I'd take a patch!",
          hoursAfter: 20,
        },
        {
          author: "noor",
          body: "The neighbours command is merged in meshd, and the map uses it now.",
          hoursAfter: 1490,
          reactions: [{ emoji: "🎉", by: ["diego", "felix"] }],
        },
      ],
    },
    {
      title: "Refresh happens many times every 15 seconds",
      author: "kofi",
      daysAgo: 163,
      body: `While testing a bridge I noticed it gets hit a lot more than every 15 s from my laptop:

\`\`\`
[bridge] GET /meshd.json 200 3ms
[bridge] GET /meshd.json 200 2ms
[bridge] GET /meshd.json 200 2ms
[bridge] GET /meshd.json 200 3ms
\`\`\`

Four in a burst, then quiet for 15 s. Goes back to one after a full page reload.`,
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 75,
      comments: [
        {
          author: "kofi",
          body: "Found it, `onMount(async () => ...)` never gets the cleanup function, so every hot reload leaves a timer behind. Patch incoming.",
          hoursAfter: 6,
          reactions: [{ emoji: "😅", by: ["noor"] }],
        },
        {
          author: "noor",
          body: "Ugh, Svelte even documents that. Thanks for tracking it down.",
          hoursAfter: 9,
          replyTo: 0,
        },
      ],
    },
    {
      title: "The bridge needs Node on the router?",
      author: "oskar",
      daysAgo: 150,
      body: "Tried to install the bridge on our TL-WR902s. Node for mipsel is ~30 MB and the routers have 8 MB of flash, so that's a non-starter. Am I meant to run the bridge somewhere else and point it at the router?",
      labels: ["question", "enhancement"],
      assignees: ["yuki"],
      state: "solved",
      closedHoursAfter: 420,
      comments: [
        {
          author: "noor",
          body: "Honestly I wrote it on my laptop against a meshd in a VM and didn't think about it. The socket is local, so the bridge has to run on the router.",
          hoursAfter: 3,
        },
        {
          author: "yuki",
          body: "uhttpd is already running on every OpenWrt box for LuCI. A CGI shell script that talks to the socket with socat would be a few lines. I can write it.",
          hoursAfter: 10,
          reactions: [{ emoji: "🙌", by: ["noor", "oskar", "diego"] }],
        },
        {
          author: "oskar",
          body: "That would be perfect. socat is ~100 kB, that's fine.",
          hoursAfter: 14,
          replyTo: 1,
        },
      ],
    },
    {
      title: "How do I add my network's sites?",
      author: "ines",
      daysAgo: 140,
      body: "We'd like to run the map for our network in Lyon. Is there a way to point it at a different `sites.json` without forking, and how do I find each router's router id?",
      labels: ["question", "docs"],
      state: "solved",
      closedHoursAfter: 36,
      comments: [
        {
          author: "diego",
          body: "`sites.json` is just a file next to `index.html` in the build, so edit it after `npm run build` and you're done. The router id is the `router_id` in each router's /etc/meshd.toml (as 16 hex digits, no 0x).",
          hoursAfter: 4,
        },
        {
          author: "ines",
          body: "Got it working, thanks. Would be nice to have this in the README.",
          hoursAfter: 30,
          replyTo: 0,
        },
        {
          author: "sol",
          body: "I'll fold it into a deployment section when I get to it.",
          hoursAfter: 36,
        },
      ],
    },
    {
      title: "Red and green links are hard to tell apart",
      author: "zeynep",
      daysAgo: 118,
      body: "I'm deuteranopic, and on the map good and poor links look almost the same to me: a sort of muddy olive. Orange is distinguishable but only just. Could the colours change, or the line style vary with quality?",
      labels: ["accessibility", "enhancement"],
      state: "solved",
      closedHoursAfter: 340,
      comments: [
        {
          author: "noor",
          body: "Thanks for raising it, and sorry. Both, I think: a safer palette and dashes, so it works in monochrome too. Would you want to have a go? You'd be the best judge.",
          hoursAfter: 5,
        },
        {
          author: "zeynep",
          body: "Sure, I'll try Okabe-Ito and send a patch.",
          hoursAfter: 12,
          replyTo: 0,
          reactions: [{ emoji: "❤️", by: ["noor"] }],
        },
        {
          author: "diego",
          body: "Plus one for dashes; in full sun on a roof I can barely see colour on my phone either.",
          hoursAfter: 20,
        },
      ],
    },
    {
      title: "Sites show up in the ocean",
      author: "priya",
      daysAgo: 113,
      body: "I added our four sites to `sites.json` and they render somewhere off the coast of Somalia. The coordinates are right, I copied them from the GPS on my phone.",
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 8,
      comments: [
        {
          author: "noor",
          body: "Could you paste one entry? My guess is lat and lon swapped.",
          hoursAfter: 2,
        },
        {
          author: "priya",
          body: "...yes. They were swapped. Sorry for the noise!",
          hoursAfter: 7,
          replyTo: 0,
          reactions: [{ emoji: "😄", by: ["noor", "diego"] }],
        },
        {
          author: "noor",
          body: "Happens to everyone. I might add a warning when a site is more than 50 km from the others.",
          hoursAfter: 8,
        },
      ],
    },
    {
      title: "Map stops updating on iPhone",
      author: "malik",
      daysAgo: 85,
      body: `On Safari on an iPhone the map loads, shows data once, then never updates. Safari's console:

\`\`\`
Unhandled Promise Rejection: QuotaExceededError: The quota has been exceeded.
\`\`\`

The Umeå mesh has ~60 sites now, so the cached reports are fairly big.`,
      labels: ["bug"],
      assignees: ["malik"],
      state: "solved",
      closedHoursAfter: 130,
      comments: [
        {
          author: "noor",
          body: "Hm, 60 reports should be well under 100 kB. Unless the old v1 cache is still in there too, which it would be.",
          hoursAfter: 10,
        },
        {
          author: "malik",
          body: "Both, I think: it was a private tab, where Safari's quota is tiny. Either way a failed save shouldn't stop refreshing. I'll wrap it.",
          hoursAfter: 16,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Every link is drawn twice",
      author: "lena",
      daysAgo: 72,
      body: "Zooming in on a link, there are clearly two lines on top of each other, and sometimes the colour changes on refresh without anything changing on the routers. I think one comes from each end of the link?",
      labels: ["bug"],
      assignees: ["noor"],
      state: "solved",
      closedHoursAfter: 140,
      comments: [
        {
          author: "noor",
          body: "Yes, that's exactly it. I'll dedupe by pair. Question is which side to show: I'd go with the worse one, since traffic crosses both ways.",
          hoursAfter: 6,
        },
        {
          author: "ada",
          body: "Worse side makes sense. meshd assumes symmetric links when computing ETX anyway, so the two reports differ only by measurement noise and real asymmetry, and asymmetry is exactly what you want to see.",
          hoursAfter: 20,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Map is blank without internet",
      author: "diego",
      daysAgo: 60,
      body: "On the school roof today with the uplink down. Bridges answered fine over the mesh, dots and lines showed up, but no background, so I couldn't tell which dot was which without tapping each one. Could the tiles be cached?",
      labels: ["enhancement", "offline"],
      assignees: ["noor"],
      state: "solved",
      closedHoursAfter: 640,
      comments: [
        {
          author: "noor",
          body: "Service worker for tiles. I've been meaning to do it. Will need HTTPS or localhost for it to work though.",
          hoursAfter: 8,
        },
        {
          author: "hana",
          body: "Alternatively run a tile server on the mesh and set VITE_TILE_URL. That's what we do in Lyon; it's one Raspberry Pi with the region's tiles.",
          hoursAfter: 30,
          replyTo: 0,
        },
        {
          author: "diego",
          body: "Both are good. The service worker is the one that helps people with no setup.",
          hoursAfter: 33,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Show the route between two sites",
      author: "amara",
      daysAgo: 48,
      body: "When someone says 'the internet is slow at the cooperative', the first question is which path their traffic takes to the gateway. It would be great to select two sites and see the path highlighted, with the total cost.",
      labels: ["enhancement"],
      comments: [
        {
          author: "noor",
          body: "We don't have the routers' actual routes in the map, only links. I could compute the cheapest path from the links, which is what meshd would pick if everyone agreed on costs. Close enough?",
          hoursAfter: 9,
        },
        {
          author: "felix",
          body: "Close, but hysteresis means meshd may stick with a slightly worse path. The bridge could also return `routes`, and then you can follow next hops for real.",
          hoursAfter: 15,
          replyTo: 0,
        },
        {
          author: "amara",
          body: "Even the computed one would already help a lot. Following real next hops would be the dream.",
          hoursAfter: 40,
        },
      ],
    },
    {
      title: "Search for a site by name",
      author: "hana",
      daysAgo: 30,
      body: "Lyon has 70 sites. Finding 'Croix-Rousse 3' means zooming around for a while. A search box in the header that pans to the site and opens its panel would help.",
      labels: ["enhancement", "good-first-issue"],
      comments: [
        {
          author: "self",
          body: "I'd like to try this one.",
          hoursAfter: 50,
          reactions: [{ emoji: "👍", by: ["noor", "hana"] }],
        },
      ],
    },
    {
      title: "Node panel covers the whole map on a phone",
      author: "self",
      daysAgo: 24,
      body: "On a 360px-wide phone the panel is 18rem plus margins, so it covers everything except a thin strip on the left, and it can't be scrolled. Maybe it should become a bottom sheet on narrow screens?",
      labels: ["bug", "mobile"],
      comments: [
        {
          author: "noor",
          body: "Yes, a bottom sheet under ~600px sounds right. Max 40% of the height, scrollable table.",
          hoursAfter: 12,
        },
        {
          author: "theo",
          body: "If it becomes a bottom sheet the legend needs to move too, or the two will overlap.",
          hoursAfter: 30,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Link shows 50% hellos but the router says 94%",
      author: "wren",
      daysAgo: 3,
      body: "The link between Bakery and Gateway shows 50% in the tooltip and panel, but `neighbours` on the Bakery router says delivery_ratio 0.94 for the Gateway. Which one is right?",
      labels: ["question"],
      comments: [
        {
          author: "noor",
          body: "Both: the map shows the worse of the two directions. The Gateway is only hearing half of Bakery's hellos. Probably worth showing both numbers in the panel so this isn't confusing.",
          hoursAfter: 4,
        },
        {
          author: "diego",
          body: "Half from Bakery to Gateway is a real problem then. Bakery's antenna got knocked in the storm last week, I'll go up and check.",
          hoursAfter: 7,
          replyTo: 0,
          reactions: [{ emoji: "🙏", by: ["wren"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "Replace the Node bridge with a CGI script",
      author: "yuki",
      daysAgo: 140,
      labels: ["bridge"],
      state: "merged",
      revisions: [
        {
          description:
            "A CGI script for uhttpd instead of a Node server, so the bridge runs on 8 MB routers. Uses socat to talk to meshd and jq to merge the two replies.",
          hoursAfter: 0,
          base: "v0.1.0",
          commits: [
            {
              message: `bridge: add a CGI script for uhttpd`,
              author: "yuki",
              daysAgo: 140,
              changes: {
                "bridge/meshd.cgi": cgiR1,
                "bridge/bridge.ts": null,
              },
            },
          ],
          reviews: [
            {
              author: "noor",
              hoursAfter: 9,
              summary: "Thank you, this is so much better. A couple of questions.",
              comments: [
                {
                  body: "jq isn't in the default OpenWrt image and is ~250 kB with its dependencies. Both replies are single-line JSON objects; could we merge them in shell instead?",
                  path: "bridge/meshd.cgi",
                  line: 15,
                },
                {
                  body: "If meshd isn't running, socat fails and we return an empty body with a 200. The map then fails to parse it. Could we fall back to empty values so the site still shows as up-but-empty?",
                  path: "bridge/meshd.cgi",
                  line: 7,
                  endLine: 9,
                },
              ],
            },
            {
              author: "oskar",
              hoursAfter: 20,
              summary: "Tested on a TL-WR902 with socat installed: works, ~40 ms per request.",
            },
          ],
          comments: [
            {
              author: "diego",
              body: "This also needs the map side changed to fetch /cgi-bin/meshd.json, and the README.",
              hoursAfter: 11,
            },
          ],
        },
        {
          description:
            "No more jq: the replies are merged with shell parameter expansion. Falls back to empty values when meshd doesn't answer, sends Cache-Control: no-store, and updates the map, sites.json and README for the new path.",
          hoursAfter: 150,
          fromHistory: ["cgi"],
          reviews: [
            {
              author: "noor",
              hoursAfter: 4,
              verdict: "accept",
              summary: "Lovely. The brace trick made me laugh. Merging.",
              comments: [
                {
                  body: "Worth a comment saying this relies on meshd replying on one line? It does, and it's in the protocol doc, but someone will pretty-print it one day.",
                  path: "bridge/meshd.cgi",
                  line: 24,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "Use colour-blind friendly link colours",
      author: "zeynep",
      daysAgo: 112,
      labels: ["accessibility"],
      state: "merged",
      revisions: [
        {
          description:
            "Swaps the red/orange/green link colours for the Okabe-Ito blue, orange and vermillion. Checked with a deuteranopia simulator and with my own eyes.",
          hoursAfter: 0,
          base: "school-clinic",
          commits: [
            {
              message: `Use the Okabe-Ito palette for links`,
              author: "zeynep",
              daysAgo: 112,
              changes: {
                "src/lib/quality.ts": [
                  [
                    '  good: "#2f9e44",\n  fair: "#f08c00",\n  poor: "#e03131",\n  dead: "#868e96",\n',
                    '  good: "#0072b2",\n  fair: "#e69f00",\n  poor: "#d55e00",\n  dead: "#999999",\n',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "noor",
              hoursAfter: 14,
              summary: "Much better already. Could we go one step further?",
              comments: [
                {
                  body: "Fair and poor are still close in luminance; in grayscale (or in sunlight) I can't tell them apart. Could we add a dash pattern per quality as well, so colour isn't the only signal?",
                  path: "src/lib/quality.ts",
                  line: 16,
                  endLine: 17,
                },
                {
                  body: "Since the dot in NodePanel uses these too: maybe export human labels next to the colours, for a legend later.",
                  path: "src/lib/quality.ts",
                  line: 14,
                },
              ],
            },
          ],
        },
        {
          description:
            "Adds dash patterns (none, dashed, dotted, sparse dots) and labels per quality, uses the dashes on the map, and updates the README's description of the colours.",
          hoursAfter: 190,
          fromHistory: ["cb-colours"],
          reviews: [
            {
              author: "noor",
              hoursAfter: 5,
              verdict: "accept",
              summary: "Perfect. Readable in grayscale now. Thank you!",
            },
            {
              author: "diego",
              hoursAfter: 9,
              verdict: "accept",
              summary: "Took it up a roof at noon. I can see the difference now.",
            },
          ],
        },
      ],
    },
    {
      title: "Rewrite the map in MapLibre GL",
      author: "jonas",
      daysAgo: 95,
      labels: ["refactor"],
      state: "archived",
      revisions: [
        {
          description:
            "MapLibre GL renders vector tiles, which are much smaller to cache offline and look sharper on high-DPI phones. This swaps Leaflet for maplibre-gl; the drawing code becomes a GeoJSON source and two layers. Work in progress, only the dependency and imports so far.",
          hoursAfter: 0,
          base: "cb-colours",
          commits: [
            {
              message: `WIP: switch from Leaflet to MapLibre GL`,
              author: "jonas",
              daysAgo: 95,
              changes: {
                "package.json": [
                  ['"leaflet": "^1.9.4"', '"maplibre-gl": "^4.5.0"'],
                  ['    "@types/leaflet": "^1.9.12",\n', ""],
                ],
                "src/components/MeshMap.svelte": [
                  [
                    '  import L from "leaflet";\n  import "leaflet/dist/leaflet.css";\n',
                    '  import maplibregl from "maplibre-gl";\n  import "maplibre-gl/dist/maplibre-gl.css";\n',
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "noor",
              body: "I like vector tiles a lot, but MapLibre needs WebGL, and a good number of the phones people use on the roofs are old Androids where WebGL is either missing or crawls. Leaflet works on all of them. I don't think I can take this, sorry.",
              hoursAfter: 16,
            },
            {
              author: "jonas",
              body: "That's fair, I only tested on my own phone. Would a fallback to Leaflet be worth it, or is that two maps to maintain?",
              hoursAfter: 20,
              replyTo: 0,
            },
            {
              author: "noor",
              body: "Two maps to maintain, unfortunately. Let's revisit in a year or two when those phones are gone.",
              hoursAfter: 23,
              replyTo: 1,
              reactions: [{ emoji: "👍", by: ["jonas", "diego"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Cache tiles with a service worker",
      author: "noor",
      daysAgo: 40,
      labels: ["offline"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds a service worker that caches map tiles as they're fetched, so a phone that has seen an area keeps its background offline.",
          hoursAfter: 0,
          base: "legend",
          commits: [
            {
              message: `Cache map tiles with a service worker`,
              author: "noor",
              daysAgo: 40,
              changes: {
                "public/sw.js": swR1,
                "src/main.ts": [
                  [
                    "export default app;\n",
                    'if ("serviceWorker" in navigator) {\n  navigator.serviceWorker.register("/sw.js");\n}\n\nexport default app;\n',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "diego",
              hoursAfter: 18,
              verdict: "reject",
              summary: "Great idea, a few problems before it goes on phones.",
              comments: [
                {
                  body: "This cache grows without limit. Some of the phones have 16 GB and are always full; can we cap it?",
                  path: "public/sw.js",
                  line: 20,
                },
                {
                  body: "We build with base './' and some people serve the map from a subdirectory (/meshmap/ on the hackerspace router). '/sw.js' will 404 there.",
                  path: "src/main.ts",
                  line: 6,
                },
                {
                  body: "The tiles are cached but the app itself isn't, so offline you get a browser error page before you ever see a tile.",
                  path: "public/sw.js",
                  line: 4,
                },
              ],
            },
          ],
          comments: [
            {
              author: "noor",
              body: "All fair. Also registering in dev makes Vite's HMR very confusing, I'll only register in production builds.",
              hoursAfter: 22,
            },
          ],
        },
        {
          description:
            "Caps the tile cache at 2000 tiles, caches the app shell (network first so deploys show up), registers relative to the page and only in production builds.",
          hoursAfter: 140,
          fromHistory: ["sw"],
          reviews: [
            {
              author: "diego",
              hoursAfter: 10,
              verdict: "accept",
              summary: "Tested offline on the school roof: background and app both load. Thanks!",
              comments: [
                {
                  body: "Deleting oldest-first by key order is close enough to LRU for this. Fine by me.",
                  path: "public/sw.js",
                  line: 57,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "Highlight the cheapest path between two sites",
      author: "noor",
      daysAgo: 15,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "First step towards showing routes: computes the cheapest path over known links (Dijkstra on link costs). No UI yet; I want to agree on how selecting two sites should work first.",
          hoursAfter: 0,
          commits: [
            {
              message: `links: compute the cheapest path between two sites`,
              author: "noor",
              daysAgo: 15,
              changes: {
                "src/lib/path.ts": routePathDraft,
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 26,
              summary: "Looks correct. Some notes from the meshd side.",
              comments: [
                {
                  body: "meshd adds the link cost at the receiver, and links can be asymmetric. Since buildLinks already keeps the worse direction this is a pessimistic estimate, which is probably what you want for a 'why is it slow' view.",
                  path: "src/lib/path.ts",
                  line: 12,
                  endLine: 13,
                },
                {
                  body: "O(n²) with the reduce, but with 70 sites who cares.",
                  path: "src/lib/path.ts",
                  line: 19,
                },
              ],
            },
          ],
          comments: [
            {
              author: "amara",
              body: "For the UI: tap a site, then long-press a second? Or a 'route to…' button in the panel, which is easier to discover.",
              hoursAfter: 30,
            },
            {
              author: "noor",
              body: "A button in the panel, I think. Long-press on a Leaflet marker is unreliable on Android.",
              hoursAfter: 34,
              replyTo: 0,
            },
          ],
        },
      ],
    },
    {
      title: "Search sites by name",
      author: "self",
      daysAgo: 4,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "Adds a search box to the header. Typing filters sites by name (case-insensitive, up to 8 results); picking one opens its panel. Closes the search issue.",
          hoursAfter: 0,
          commits: [
            {
              message: `Add a site search box to the header`,
              author: "self",
              daysAgo: 4,
              changes: {
                "src/components/SiteSearch.svelte": siteSearch,
                "src/App.svelte": [
                  [
                    '  import Legend from "./components/Legend.svelte";\n',
                    '  import Legend from "./components/Legend.svelte";\n  import SiteSearch from "./components/SiteSearch.svelte";\n',
                  ],
                  [
                    "  <h1>meshmap</h1>\n",
                    "  <h1>meshmap</h1>\n  <SiteSearch {sites} on:select={e => (selected = e.detail)} />\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "noor",
              hoursAfter: 16,
              summary: "Thanks, this works nicely! Some small things.",
              comments: [
                {
                  body: "Picking a site opens the panel but doesn't move the map, so with 70 sites the selected one is often off screen. Could MeshMap pan to `selected` when it changes?",
                  path: "src/components/SiteSearch.svelte",
                  line: 17,
                },
                {
                  body: "Could Enter pick the first match? On a phone keyboard that's the natural thing to press.",
                  path: "src/components/SiteSearch.svelte",
                  line: 24,
                },
                {
                  body: "On narrow screens this pushes the offline badge onto a second line. Maybe hide the h1 below 500px?",
                  path: "src/components/SiteSearch.svelte",
                  line: 39,
                  endLine: 42,
                },
              ],
            },
          ],
          comments: [
            {
              author: "hana",
              body: "Tried it with the Lyon sites.json, works well. Matching anywhere in the name is exactly right for us ('rousse' finds all of them).",
              hoursAfter: 20,
              reactions: [{ emoji: "🎉", by: ["self"] }],
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v0.1.0",
      at: "v0.1.0",
      title: "meshmap 0.1.0",
      notes: `First release with live data.

- Map of every site in \`sites.json\`, links coloured by ETX cost
- Live data from a bridge on each router (needs meshd 0.3's \`neighbours\` command)
- Click a site to see its neighbours
- The last good data is shown when offline
- Tile server configurable with \`VITE_TILE_URL\``,
      author: "noor",
      daysAgo: 148,
      artifacts: [{ name: "meshmap-0.1.0-dist.tar.gz", sizeBytes: 148_206 }],
    },
    {
      tag: "v0.2.0",
      at: "v0.2.0",
      title: "meshmap 0.2.0",
      notes: `The bridge no longer needs Node: it's a shell script for uhttpd, so it fits
on 8 MB routers. Replace the Node bridge with \`bridge/meshd.cgi\` and drop
the port from each \`bridge\` URL in \`sites.json\`.

- Colour-blind friendly colours, with dashes for worse links (thanks zeynep)
- Each link drawn once, using its worse direction
- Offline badge shows how old the data is
- Storage errors no longer stop updates (thanks malik)`,
      author: "noor",
      daysAgo: 55,
      artifacts: [
        { name: "meshmap-0.2.0-dist.tar.gz", sizeBytes: 152_930 },
        { name: "meshd.cgi", sizeBytes: 812 },
      ],
    },
  ],
};
