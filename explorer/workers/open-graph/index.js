import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import bootonRegular from "./Booton-Regular.ttf";
import bootonSemiBold from "./Booton-SemiBold.ttf";
import forestJpg from "./forest.jpg";

const WIDTH = 1200;
const HEIGHT = 630;

const C = {
  bg: "#ffffff", // --color-surface-canvas
  text: "#0b0d12", // --color-text-primary
  textSub: "#3a3f49", // --color-text-secondary
  textMid: "#5a5f6b", // --color-text-tertiary
  textMuted: "#7a8190", // --color-text-quaternary
};

let initPromise = null;
let font = null;
let forestDataUri = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = initWasm(resvgWasm).then(() => {
      font = [
        { name: "Booton", data: bootonRegular, weight: 400, style: "normal" },
        { name: "Booton", data: bootonSemiBold, weight: 600, style: "normal" },
      ];
      const bytes = new Uint8Array(forestJpg);
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      forestDataUri = `data:image/jpeg;base64,${btoa(binary)}`;
    });
  }
  return initPromise;
}

function parseRoute(pathname) {
  const segments = pathname
    .replace(/^\//, "")
    .split("/")
    .map(s => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  const first = segments[0];

  if (first === "" || first === undefined) return { type: "home" };
  if (first !== "nodes" && first !== "seeds") return null;

  const host = segments[1];
  if (!host) return { type: "home" };

  const rid = segments[2];
  if (!rid) return { type: "node", host };

  if (rid === "users") {
    const did = segments[3];
    return did ? { type: "user", host, did } : { type: "node", host };
  }

  if (segments[3] === "issues" && segments[4])
    return { type: "issue", host, rid, id: segments[4] };
  if (segments[3] === "issues") return { type: "issues", host, rid };
  if (segments[3] === "patches" && segments[4])
    return { type: "patch", host, rid, id: segments[4] };
  if (segments[3] === "patches") return { type: "patches", host, rid };
  if (segments[3] === "commits" && segments[4])
    return { type: "commit", host, rid, sha: segments[4] };

  // /nodes/:host/:rid/history/:branch
  if (segments[3] === "history")
    return { type: "history", host, rid, branch: segments[4] };

  // /nodes/:host/:rid/remotes/:peer/history/:branch
  if (segments[3] === "remotes" && segments[4] && segments[5] === "history") {
    return {
      type: "history",
      host,
      rid,
      peer: segments[4],
      branch: segments[6],
    };
  }

  return { type: "repo", host, rid };
}

function apiBase(host) {
  const local = host.startsWith("localhost") || host.startsWith("127.");
  return `${local ? "http" : "https"}://${host}/api/v1`;
}

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

const fetchRepo = (host, rid) => apiFetch(`${apiBase(host)}/repos/${rid}`);
const fetchIssue = (host, rid, id) =>
  apiFetch(`${apiBase(host)}/repos/${rid}/issues/${id}`);
const fetchPatch = (host, rid, id) =>
  apiFetch(`${apiBase(host)}/repos/${rid}/patches/${id}`);
const fetchCommit = (host, rid, sha) =>
  apiFetch(`${apiBase(host)}/repos/${rid}/commits/${sha}`);
const fetchTreeStats = (host, rid, sha) =>
  apiFetch(`${apiBase(host)}/repos/${rid}/stats/tree/${sha}`);
const fetchRemote = (host, rid, peer) =>
  apiFetch(`${apiBase(host)}/repos/${rid}/remotes/${peer}`);
const fetchNode = host => apiFetch(`${apiBase(host)}/node`);
const fetchNodeStats = host => apiFetch(`${apiBase(host)}/stats`);
const fetchNodeIdentity = (host, nid) =>
  apiFetch(`${apiBase(host)}/nodes/${nid}`);

function md5(str) {
  function rotl(v, n) {
    return (v << n) | (v >>> (32 - n));
  }
  const K = [],
    S = [];
  for (let i = 0; i < 64; i++)
    K[i] = Math.floor(4294967296 * Math.abs(Math.sin(i + 1)));
  S.push(7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22);
  S.push(5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20);
  S.push(4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23);
  S.push(6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21);

  const bytes = new Uint8Array(new TextEncoder().encode(str));
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length % 64 < 56 ? 56 : 120) - (bytes.length % 64);
  const padded = new Uint8Array(bytes.length + padLen + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen & 0xffffffff, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296), true);

  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    const M = [];
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
    let A = a0,
      B = b0,
      H = c0,
      D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) {
        F = (B & H) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & H);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ H ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = H ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const tmp = D;
      D = H;
      H = B;
      B = (B + rotl((A + F + K[i] + M[g]) | 0, S[i])) | 0;
      A = tmp;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + H) | 0;
    d0 = (d0 + D) | 0;
  }
  const hex = v =>
    Array.from(new Uint8Array(new Int32Array([v]).buffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

function gravatarUrl(email) {
  return `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?s=64`;
}

async function fetchGravatarDataUri(email) {
  if (!email) return null;
  try {
    const res = await fetch(gravatarUrl(email));
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++)
      binary += String.fromCharCode(bytes[i]);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function gravatarImg(dataUri, size = 28) {
  if (!dataUri) {
    // Gray placeholder box when gravatar fetch fails.
    return el("div", {
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: "#e1e4e8",
      flexShrink: "0",
    });
  }
  return {
    type: "img",
    props: {
      src: dataUri,
      width: size,
      height: size,
      style: { display: "flex", flexShrink: "0" },
    },
  };
}

function repoPayload(repo) {
  return repo?.payloads?.["xyz.radicle.project"];
}

function authorLabel(author) {
  if (!author) return null;
  return author.alias || author.id.slice(0, 7);
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function shortId(id) {
  return id.slice(0, 7);
}

function shortDid(did) {
  const prefix = "did:key:";
  if (!did.startsWith(prefix)) return did;
  const key = did.slice(prefix.length);
  return `${prefix}${key.slice(0, 6)}\u2026${key.slice(-6)}`;
}

function nidFromDid(did) {
  return did.startsWith("did:key:") ? did.slice(8) : did;
}

const AVATAR_PALETTE = [
  "#00D4DA",
  "#886BF2",
  "#FFA5FF",
  "#009F67",
  "#CCFF38",
  "#585600",
];

function _hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function _mulberry32(a) {
  return function () {
    // eslint-disable-next-line no-param-reassign
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _makeRNG(key) {
  return _mulberry32(_xmur3(key)());
}
function _chooseK(arr, k, rnd) {
  const pool = arr.slice(),
    out = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rnd() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
function _pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function _makeSvgCtx() {
  const elements = [];
  return {
    fillRect(x, y, w, h, fill) {
      elements.push({
        type: "rect",
        props: { x, y, width: w, height: h, fill },
      });
    },
    fillCircle(cx, cy, diameter, fill) {
      elements.push({
        type: "circle",
        props: { cx, cy, r: diameter / 2, fill },
      });
    },
    fillEllipse(cx, cy, w, h, fill) {
      elements.push({
        type: "ellipse",
        props: { cx, cy, rx: w / 2, ry: h / 2, fill },
      });
    },
    elements,
  };
}

function _makeAtomRenderer(cellSize, circleB, circleC, useEllipse) {
  function drawCircleOrEllipse(ctx, x, y, w, h, fill) {
    if (useEllipse) ctx.fillEllipse(x, y, w, h, fill);
    else ctx.fillCircle(x, y, w, fill);
  }
  return {
    drawAtomA(ctx, gx, gy, c1) {
      ctx.fillRect(gx * cellSize, gy * cellSize, cellSize, cellSize, c1);
    },
    drawAtomB(ctx, gx, gy, c1, c2) {
      const x = gx * cellSize,
        y = gy * cellSize;
      ctx.fillRect(x, y, cellSize, cellSize, c1);
      drawCircleOrEllipse(
        ctx,
        x + cellSize / 2,
        y + cellSize / 2,
        circleB,
        circleB,
        c2,
      );
    },
    drawAtomC(ctx, gx, gy, c2, c3) {
      const x = gx * cellSize,
        y = gy * cellSize;
      ctx.fillRect(x, y, cellSize, cellSize, c2);
      drawCircleOrEllipse(
        ctx,
        x + cellSize / 2,
        y + cellSize / 2,
        circleC,
        circleC,
        c3,
      );
    },
    drawAtomD(ctx, gx, gy, c3) {
      ctx.fillRect(gx * cellSize, gy * cellSize, cellSize, cellSize, c3);
    },
    drawAtom(ctx, atom, gx, gy, c1, c2, c3) {
      if (atom === "A") this.drawAtomA(ctx, gx, gy, c1);
      else if (atom === "B") this.drawAtomB(ctx, gx, gy, c1, c2);
      else if (atom === "C") this.drawAtomC(ctx, gx, gy, c2, c3);
      else this.drawAtomD(ctx, gx, gy, c3);
    },
  };
}

const LETTER_5X7 = (() => {
  const L = {};
  const r = s => s.map(row => row.split("").map(ch => (ch === "1" ? 1 : 0)));
  L["A"] = r(["01110", "10001", "10001", "11111", "10001", "10001", "10001"]);
  L["B"] = r(["11110", "10001", "10001", "11110", "10001", "10001", "11110"]);
  L["C"] = r(["01111", "10000", "10000", "10000", "10000", "10000", "01111"]);
  L["D"] = r(["11110", "10001", "10001", "10001", "10001", "10001", "11110"]);
  L["E"] = r(["11111", "10000", "10000", "11110", "10000", "10000", "11111"]);
  L["F"] = r(["11111", "10000", "10000", "11110", "10000", "10000", "10000"]);
  L["G"] = r(["01111", "10000", "10000", "10111", "10001", "10001", "01111"]);
  L["H"] = r(["10001", "10001", "10001", "11111", "10001", "10001", "10001"]);
  L["I"] = r(["11111", "00100", "00100", "00100", "00100", "00100", "11111"]);
  L["J"] = r(["11111", "00001", "00001", "00001", "10001", "10001", "01110"]);
  L["K"] = r(["10001", "10010", "10100", "11000", "10100", "10010", "10001"]);
  L["L"] = r(["10000", "10000", "10000", "10000", "10000", "10000", "11111"]);
  L["M"] = r(["10001", "11011", "10101", "10001", "10001", "10001", "10001"]);
  L["N"] = r(["10001", "11001", "10101", "10011", "10001", "10001", "10001"]);
  L["O"] = r(["01110", "10001", "10001", "10001", "10001", "10001", "01110"]);
  L["P"] = r(["11110", "10001", "10001", "11110", "10000", "10000", "10000"]);
  L["Q"] = r(["01110", "10001", "10001", "10001", "10101", "10010", "01101"]);
  L["R"] = r(["11110", "10001", "10001", "11110", "10100", "10010", "10001"]);
  L["S"] = r(["01111", "10000", "11110", "00001", "00001", "10001", "11110"]);
  L["T"] = r(["11111", "00100", "00100", "00100", "00100", "00100", "00100"]);
  L["U"] = r(["10001", "10001", "10001", "10001", "10001", "10001", "01110"]);
  L["V"] = r(["10001", "10001", "10001", "01010", "01010", "00100", "00100"]);
  L["W"] = r(["10001", "10001", "10001", "10101", "10101", "11011", "10001"]);
  L["X"] = r(["10001", "01010", "00100", "00100", "00100", "01010", "10001"]);
  L["Y"] = r(["10001", "01010", "00100", "00100", "00100", "00100", "00100"]);
  L["Z"] = r(["11111", "00001", "00010", "00100", "01000", "10000", "11111"]);
  L["0"] = r(["01110", "10001", "10011", "10101", "11001", "10001", "01110"]);
  L["1"] = r(["00100", "01100", "00100", "00100", "00100", "00100", "01110"]);
  L["2"] = r(["01110", "10001", "00001", "00110", "01000", "10000", "11111"]);
  L["3"] = r(["11110", "00001", "01110", "00001", "00001", "00001", "11110"]);
  L["4"] = r(["10010", "10010", "10010", "11111", "00010", "00010", "00010"]);
  L["5"] = r(["11111", "10000", "11110", "00001", "00001", "00001", "11110"]);
  L["6"] = r(["01110", "10000", "11110", "10001", "10001", "10001", "01110"]);
  L["7"] = r(["11111", "00001", "00010", "00100", "01000", "01000", "01000"]);
  L["8"] = r(["01110", "10001", "01110", "10001", "10001", "10001", "01110"]);
  L["9"] = r(["01110", "10001", "10001", "01111", "00001", "00001", "11110"]);
  L["?"] = r(["11111", "00001", "01110", "00000", "00100", "00000", "00100"]);
  return L;
})();

function _getInitials(name) {
  if (!name || typeof name !== "string") return ["?"];
  const parts = name
    .trim()
    .replace(/\s+/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const first = parts[0] ? parts[0][0].toUpperCase() : "?";
  const second = parts[1] ? parts[1][0].toUpperCase() : null;
  return second ? [first, second] : [first];
}

function _polarFromCell(gx, gy, cx, cy) {
  const x = gx - cx + 0.5,
    y = gy - cy + 0.5;
  let a = Math.atan2(y, x);
  if (a < 0) a += 2 * Math.PI;
  return { r: Math.hypot(x, y), a };
}

function _shapeRose(theta, petals, tol) {
  const sector = Math.PI / petals;
  const diff = Math.abs(theta - Math.round(theta / sector) * sector);
  return Math.min(diff, 2 * Math.PI - diff) <= tol;
}
function _shapeStarburst(theta, petals, softness) {
  const period = (2 * Math.PI) / petals;
  const local = theta % period;
  return (
    Math.pow(
      Math.cos(
        ((Math.min(local, period - local) / (period / 2)) * Math.PI) / 2,
      ),
      softness,
    ) > 0.5
  );
}
function _shapeRinged(theta, petals, ringPhase, tol) {
  const sector = (2 * Math.PI) / petals;
  const diff = Math.abs(
    theta - (Math.floor(theta / sector) * sector + sector * ringPhase),
  );
  return Math.min(diff, 2 * Math.PI - diff) <= tol;
}
function _shapeTip(theta, petals, tol, t) {
  return _shapeRose(theta, petals, tol * (0.5 + t)) && t > 0.45;
}
function _shapeNotched(theta, petals, tol) {
  const sector = (2 * Math.PI) / petals;
  return (
    _shapeRose(theta, petals, tol) &&
    Math.abs((theta % sector) / sector - 0.5) > 0.25
  );
}
function _shapeHollow(theta, petals, tol, t) {
  return _shapeRose(theta, petals, tol) && t > 0.28 && t < 0.92;
}
function _sectorGate(theta, petals, mask) {
  return mask[Math.floor(theta / ((2 * Math.PI) / petals)) % mask.length];
}
function _makeAssigner(mode, activeAtoms) {
  if (mode === "bands-ABC") return rCell => activeAtoms[rCell % 3];
  if (mode === "angle-stripes")
    return (_r, _t, sIdx) => activeAtoms[(sIdx || 0) % activeAtoms.length];
  if (mode === "parity-ACB") return rCell => activeAtoms[rCell % 2 ? 1 : 0];
  return (rCell, theta, sIdx) => {
    const v =
      (Math.sin((theta || 0) * 13.37 + rCell * 2.17 + (sIdx || 0) * 0.73) + 1) /
      2;
    return v < 0.33
      ? activeAtoms[0]
      : v < 0.66
        ? activeAtoms[1]
        : activeAtoms[2];
  };
}

function _avatarSvgNode(elements, logicalSize, renderSize) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        width: renderSize,
        height: renderSize,
        flexShrink: 0,
      },
      children: {
        type: "svg",
        props: {
          width: renderSize,
          height: renderSize,
          viewBox: `0 0 ${logicalSize} ${logicalSize}`,
          style: { display: "flex" },
          children: elements,
        },
      },
    },
  };
}

function repoAvatarSvg(key, size = 64) {
  const GRID = 16,
    CELL = 32,
    W = GRID * CELL;
  const ctx = _makeSvgCtx();
  const atoms = _makeAtomRenderer(CELL, CELL * 0.55, CELL * 0.67, false);

  const initials = _getInitials(key);
  const seed = _hash32(key.toLowerCase());
  const rnd = _mulberry32(seed);
  const [c1, c2, c3] = _chooseK(AVATAR_PALETTE, 3, rnd);
  const letterSolidAtom = ((seed >>> 7) & 1) === 0 ? "A" : "D";
  const bgAtoms = ["A", "B", "C", "D"].filter(a => a !== letterSolidAtom);

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const k = (gy * 131 + gx * 197 + seed) >>> 0;
      atoms.drawAtom(ctx, bgAtoms[k % bgAtoms.length], gx, gy, c1, c2, c3);
    }
  }

  const GW = 5,
    GH = 7,
    SPACING = 2;
  function placeLetter(glyph, startX, startY, scale2x) {
    for (let r = 0; r < GH; r++) {
      for (let c = 0; c < GW; c++) {
        if (!glyph[r][c]) continue;
        if (scale2x) {
          const gx = startX + c * 2,
            gy = startY + r * 2;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
              if (letterSolidAtom === "A")
                atoms.drawAtomA(ctx, gx + dx, gy + dy, c1);
              else atoms.drawAtomD(ctx, gx + dx, gy + dy, c3);
            }
        } else {
          const gx = startX + c,
            gy = startY + r;
          if (letterSolidAtom === "A") atoms.drawAtomA(ctx, gx, gy, c1);
          else atoms.drawAtomD(ctx, gx, gy, c3);
        }
      }
    }
  }

  if (initials.length === 1) {
    placeLetter(
      LETTER_5X7[initials[0]] || LETTER_5X7["?"],
      Math.floor((GRID - 10) / 2),
      Math.floor((GRID - 14) / 2),
      true,
    );
  } else {
    const startX = Math.floor((GRID - (GW * 2 + SPACING)) / 2);
    const startY = Math.floor((GRID - GH) / 2);
    placeLetter(
      LETTER_5X7[initials[0]] || LETTER_5X7["?"],
      startX,
      startY,
      false,
    );
    placeLetter(
      LETTER_5X7[initials[1]] || LETTER_5X7["?"],
      startX + GW + SPACING,
      startY,
      false,
    );
  }

  return _avatarSvgNode(ctx.elements, W, size);
}

function userAvatarSvg(key, size = 64) {
  const TILE = 32,
    GRID = 10,
    W = GRID * TILE;
  const ctx = _makeSvgCtx();
  const atoms = _makeAtomRenderer(TILE, 17, 21, true);

  const rng = _makeRNG(key);
  const [c1, c2, c3] = AVATAR_PALETTE.slice()
    .sort(() => rng() - 0.5)
    .slice(0, 3);
  const allAtoms = ["A", "B", "C", "D"];
  const bgAtom = _pick(rng, allAtoms);
  const petalAtoms = allAtoms.filter(a => a !== bgAtom).sort(() => rng() - 0.5);

  const cx = Math.floor(GRID / 2),
    cy = Math.floor(GRID / 2);
  const maxR = Math.min(cx, cy);
  const petals = _pick(rng, [5, 6, 7, 8, 9, 10]);
  const petalDepth = Math.max(5, Math.floor(maxR * (0.6 + 0.35 * rng())));
  const radialThickness = _pick(rng, [1, 2, 2, 3, 3]);
  const shapeModel = _pick(rng, [
    "rose",
    "starburst",
    "ringed",
    "tip",
    "notched",
    "hollow",
  ]);
  const atomMode = _pick(rng, [
    "bands-ABC",
    "angle-stripes",
    "parity-ACB",
    "balanced-rand",
  ]);
  const assignAtom = _makeAssigner(atomMode, petalAtoms);
  const angleTolNear = (Math.PI / 28) * (0.7 + rng() * 0.5);
  const angleTolFar = (Math.PI / 7) * (0.7 + rng() * 0.5);
  const softness = 1.2 + rng() * 3.0;
  const ringPhase = 0.2 + rng() * 0.6;
  const sectorMask = Array.from({ length: petals }, () => rng() > 0.3);
  if (sectorMask.every(v => !v)) sectorMask[Math.floor(petals / 2)] = true;

  function drawAt(type, gx, gy) {
    if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID)
      atoms.drawAtom(ctx, type, gx, gy, c1, c2, c3);
  }
  function drawQuad(type, gx, gy) {
    const N = GRID - 1;
    drawAt(type, gx, gy);
    drawAt(type, N - gx, gy);
    drawAt(type, gx, N - gy);
    drawAt(type, N - gx, N - gy);
  }

  for (let gy = 0; gy < GRID; gy++)
    for (let gx = 0; gx < GRID; gx++) drawAt(bgAtom, gx, gy);

  const edgeThickness = _pick(rng, [1, 1, 2]);
  for (let t = 0; t < edgeThickness; t++)
    for (let i = 0; i < GRID; i++) {
      drawAt(bgAtom, i, t);
      drawAt(bgAtom, i, GRID - 1 - t);
      drawAt(bgAtom, t, i);
      drawAt(bgAtom, GRID - 1 - t, i);
    }

  if (rng() < 0.7) {
    const midR = Math.floor(petalDepth * (0.5 + 0.2 * rng()));
    for (let i = 0; i < GRID; i++)
      for (const [gx, gy] of [
        [cx - midR, i],
        [cx + midR, i],
        [i, cy - midR],
        [i, cy + midR],
      ])
        drawQuad(bgAtom, gx, gy);
  }
  if (rng() < 0.6) {
    const gateEvery = _pick(rng, [2, 3, 4]);
    for (let s = 0; s < petals; s++) {
      if (s % gateEvery !== 0) continue;
      const theta = s * ((2 * Math.PI) / petals);
      for (let r = 1; r <= petalDepth; r++) {
        const gx = Math.round(cx + r * Math.cos(theta));
        const gy = Math.round(cy + r * Math.sin(theta));
        drawQuad(bgAtom, gx, gy);
      }
    }
  }

  for (const [dx, dy, t] of [
    [0, 0, "D"],
    [0, -1, petalAtoms[0]],
    [1, 0, petalAtoms[1]],
    [0, 1, petalAtoms[2]],
    [-1, 0, petalAtoms[0]],
  ])
    drawQuad(t, cx + dx, cy + dy);

  const half = Math.ceil(GRID / 2);
  for (let gy = 0; gy < half; gy++) {
    for (let gx = 0; gx < half; gx++) {
      const { r, a } = _polarFromCell(gx, gy, cx, cy);
      const rCell = Math.floor(r);
      if (rCell === 0 || rCell > petalDepth) continue;
      const t = rCell / petalDepth;
      const tol = angleTolNear * (1 - t) + angleTolFar * t;
      const sectorIdx = Math.floor(a / ((2 * Math.PI) / petals));
      if (!_sectorGate(a, petals, sectorMask)) continue;
      let inside;
      if (shapeModel === "rose") inside = _shapeRose(a, petals, tol);
      else if (shapeModel === "starburst")
        inside = _shapeStarburst(a, petals, softness);
      else if (shapeModel === "ringed")
        inside = _shapeRinged(a, petals, ringPhase, tol * 0.7);
      else if (shapeModel === "tip") inside = _shapeTip(a, petals, tol, t);
      else if (shapeModel === "notched") inside = _shapeNotched(a, petals, tol);
      else inside = _shapeHollow(a, petals, tol, t);
      if (!inside) continue;
      const type = assignAtom(rCell, a, sectorIdx);
      for (let dr = 0; dr < radialThickness; dr++) {
        const x1 = gx + dr,
          y1 = gy + dr;
        const N = GRID - 1;
        for (const [ix, iy] of [
          [x1, y1],
          [N - x1, y1],
          [x1, N - y1],
          [N - x1, N - y1],
        ])
          drawAt(type, ix, iy);
      }
    }
  }

  for (const [gx, gy, t] of [
    [cx, cy - 2, petalAtoms[0]],
    [cx + 1, cy, petalAtoms[1]],
    [cx, cy + 2, petalAtoms[2]],
  ])
    drawQuad(t, gx, gy);

  for (const [dx, dy, t] of [
    [0, 0, "D"],
    [1, 0, petalAtoms[1]],
    [0, 1, petalAtoms[2]],
    [1, 1, petalAtoms[0]],
  ])
    drawQuad(t, cx + dx, cy + dy);

  return _avatarSvgNode(ctx.elements, W, size);
}

function el(tag, style, ...children) {
  const flat = children
    .flat()
    .filter(c => c !== null && c !== undefined && c !== false);
  return {
    type: tag,
    props: {
      style: { display: "flex", fontFamily: "Booton", ...style },
      children:
        flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  };
}

const ICON_PATHS = {
  seed: [
    "M12.3535 6.35352L7.5 11.207V14H6.5V11.207L4.64648 9.35352L5.35352 8.64648L7 10.293L11.6465 5.64648L12.3535 6.35352Z",
    "M14 6.5V4H11.5C10.1193 4 9 5.11929 9 6.5C9 7.88071 10.1193 9 11.5 9V10C9.567 10 8 8.433 8 6.5C8 4.567 9.567 3 11.5 3H15V6.5C15 8.433 13.433 10 11.5 10V9C12.8807 9 14 7.88071 14 6.5Z",
    "M5 7.5C5 6.67157 4.32843 6 3.5 6C2.67157 6 2 6.67157 2 7.5C2 8.32843 2.67157 9 3.5 9V10C2.11929 10 1 8.88071 1 7.5C1 6.11929 2.11929 5 3.5 5C4.88071 5 6 6.11929 6 7.5C6 8.88071 4.88071 10 3.5 10V9C4.32843 9 5 8.32843 5 7.5Z",
  ],
  issue: [
    "M9.5 8C9.5 7.17157 8.82843 6.5 8 6.5C7.17157 6.5 6.5 7.17157 6.5 8C6.5 8.82843 7.17157 9.5 8 9.5C8.82843 9.5 9.5 8.82843 9.5 8ZM10.5 8C10.5 9.38071 9.38071 10.5 8 10.5C6.61929 10.5 5.5 9.38071 5.5 8C5.5 6.61929 6.61929 5.5 8 5.5C9.38071 5.5 10.5 6.61929 10.5 8Z",
    "M13.5 8C13.5 4.96243 11.0376 2.5 8 2.5C4.96243 2.5 2.5 4.96243 2.5 8C2.5 11.0376 4.96243 13.5 8 13.5C11.0376 13.5 13.5 11.0376 13.5 8ZM14.5 8C14.5 11.5899 11.5899 14.5 8 14.5C4.41015 14.5 1.5 11.5899 1.5 8C1.5 4.41015 4.41015 1.5 8 1.5C11.5899 1.5 14.5 4.41015 14.5 8Z",
  ],
  "issue-closed": [
    "M13.5 8C13.5 4.96243 11.0376 2.5 8 2.5C4.96243 2.5 2.5 4.96243 2.5 8C2.5 11.0376 4.96243 13.5 8 13.5C11.0376 13.5 13.5 11.0376 13.5 8ZM14.5 8C14.5 11.5899 11.5899 14.5 8 14.5C4.41015 14.5 1.5 11.5899 1.5 8C1.5 4.41015 4.41015 1.5 8 1.5C11.5899 1.5 14.5 4.41015 14.5 8Z",
    "M10.707 6L8.70605 8.00098L10.7051 10L9.99805 10.707L7.99902 8.70801L6 10.707L5.29297 10L7.29199 8.00098L5.29297 6.00195L6 5.29492L7.99902 7.29395L10 5.29297L10.707 6Z",
  ],
  patch: [
    "M5.5 12C5.5 11.1716 4.82843 10.5 4 10.5C3.17157 10.5 2.5 11.1716 2.5 12C2.5 12.8284 3.17157 13.5 4 13.5C4.82843 13.5 5.5 12.8284 5.5 12ZM13.5 12C13.5 11.1716 12.8284 10.5 12 10.5C11.1716 10.5 10.5 11.1716 10.5 12C10.5 12.8284 11.1716 13.5 12 13.5C12.8284 13.5 13.5 12.8284 13.5 12ZM7.5 2.5H11.5V3.5H9.20703L12.5 6.79297V9.5498C13.6411 9.78142 14.5 10.7905 14.5 12C14.5 13.3807 13.3807 14.5 12 14.5C10.6193 14.5 9.5 13.3807 9.5 12C9.5 10.7905 10.3589 9.78142 11.5 9.5498V7.20703L8.5 4.20703V6.5H7.5V2.5ZM5.5 4C5.5 3.17157 4.82843 2.5 4 2.5C3.17157 2.5 2.5 3.17157 2.5 4C2.5 4.82843 3.17157 5.5 4 5.5C4.82843 5.5 5.5 4.82843 5.5 4ZM6.5 4C6.5 5.20943 5.64105 6.21753 4.5 6.44922V9.5498C5.64114 9.78142 6.5 10.7905 6.5 12C6.5 13.3807 5.38071 14.5 4 14.5C2.61929 14.5 1.5 13.3807 1.5 12C1.5 10.7905 2.35886 9.78142 3.5 9.5498V6.44922C2.35895 6.21753 1.5 5.20943 1.5 4C1.5 2.61929 2.61929 1.5 4 1.5C5.38071 1.5 6.5 2.61929 6.5 4Z",
  ],
  "patch-draft": [
    "M5 4C5 3.44772 4.55228 3 4 3C3.44772 3 3 3.44772 3 4C3 4.55228 3.44772 5 4 5V6C2.89543 6 2 5.10457 2 4C2 2.89543 2.89543 2 4 2C5.10457 2 6 2.89543 6 4C6 5.10457 5.10457 6 4 6V5C4.55228 5 5 4.55228 5 4Z",
    "M4.5 12V13H3.5V12H4.5ZM4.5 10V11H3.5V10H4.5ZM4.5 8V9H3.5V8H4.5ZM4.5 5V7H3.5V5H4.5Z",
    "M13 4C13 3.44772 12.5523 3 12 3C11.4477 3 11 3.44772 11 4C11 4.55228 11.4477 5 12 5V6C10.8954 6 10 5.10457 10 4C10 2.89543 10.8954 2 12 2C13.1046 2 14 2.89543 14 4C14 5.10457 13.1046 6 12 6V5C12.5523 5 13 4.55228 13 4Z",
    "M13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13V14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14V13C12.5523 13 13 12.5523 13 12Z",
    "M12.5 5.5L12.5 10.5H11.5L11.5 5.5H12.5Z",
  ],
  "patch-merged": [
    "M5 4C5 3.44772 4.55228 3 4 3C3.44772 3 3 3.44772 3 4C3 4.55228 3.44772 5 4 5V6C2.89543 6 2 5.10457 2 4C2 2.89543 2.89543 2 4 2C5.10457 2 6 2.89543 6 4C6 5.10457 5.10457 6 4 6V5C4.55228 5 5 4.55228 5 4Z",
    "M13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13V14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14V13C12.5523 13 13 12.5523 13 12Z",
    "M5 12C5 11.4477 4.55228 11 4 11C3.44772 11 3 11.4477 3 12C3 12.5523 3.44772 13 4 13V14C2.89543 14 2 13.1046 2 12C2 10.8954 2.89543 10 4 10C5.10457 10 6 10.8954 6 12C6 13.1046 5.10457 14 4 14V13C4.55228 13 5 12.5523 5 12Z",
    "M4.5 5.5V10.5H3.5V5.5H4.5Z",
    "M9.20703 3.5L12.5 6.79297V10.5H11.5V7.20703L8.79297 4.5H5.5V3.5H9.20703Z",
  ],
  "patch-archived": [
    "M13.5 2.5V13.5H2.5V2.5H13.5ZM3.5 12.5H12.5V8.5H10.4502C10.2186 9.64114 9.20949 10.5 8 10.5C6.79051 10.5 5.78142 9.64114 5.5498 8.5H3.5V12.5ZM8 6.5C7.17157 6.5 6.5 7.17157 6.5 8C6.5 8.82843 7.17157 9.5 8 9.5C8.82843 9.5 9.5 8.82843 9.5 8C9.5 7.17157 8.82843 6.5 8 6.5ZM3.5 7.5H5.5498C5.78142 6.35886 6.79051 5.5 8 5.5C9.20949 5.5 10.2186 6.35886 10.4502 7.5H12.5V3.5H3.5V7.5Z",
  ],
  commit: [
    "M8 4.5C9.7632 4.5 11.2212 5.8039 11.4639 7.5H15V8.5H11.4639C11.2212 10.1961 9.7632 11.5 8 11.5C6.2368 11.5 4.77879 10.1961 4.53613 8.5H1V7.5H4.53613C4.77879 5.8039 6.2368 4.5 8 4.5ZM8 5.5C6.61929 5.5 5.5 6.61929 5.5 8C5.5 9.38071 6.61929 10.5 8 10.5C9.38071 10.5 10.5 9.38071 10.5 8C10.5 6.61929 9.38071 5.5 8 5.5Z",
  ],
  repository: [
    "M8.22363 9.44727L8 9.55859L7.77637 9.44727L2.5 6.80859V9.69043L8 12.4404L13.5 9.69043V6.80859L8.22363 9.44727ZM3.11816 6L8 8.44043L12.8818 6L8 3.55859L3.11816 6ZM14.5 10.3086L14.2236 10.4473L8.22363 13.4473L8 13.5586L7.77637 13.4473L1.77637 10.4473L1.5 10.3086V5.69141L1.77637 5.55273L7.77637 2.55273L8 2.44141L8.22363 2.55273L14.2236 5.55273L14.5 5.69141V10.3086Z",
  ],
  pin: [
    "M10.3906 1.5L11.4287 5.65527L13.2236 6.55273L13.5 6.69141V10.5H8.5V15H7.5V10.5H2.5V6.69141L2.77637 6.55273L4.57031 5.65527L5.60938 1.5H10.3906ZM5.48535 6.12109L5.42969 6.34473L5.22363 6.44727L3.5 7.30859V9.5H12.5V7.30859L10.7764 6.44727L10.5703 6.34473L10.5146 6.12109L9.60938 2.5H6.39062L5.48535 6.12109Z",
  ],
  key: [
    "M7.5 10C7.5 8.61929 6.38071 7.5 5 7.5C3.61929 7.5 2.5 8.61929 2.5 10C2.5 11.3807 3.61929 12.5 5 12.5C6.38071 12.5 7.5 11.3807 7.5 10ZM8.5 10C8.5 11.933 6.933 13.5 5 13.5C3.067 13.5 1.5 11.933 1.5 10C1.5 8.067 3.067 6.5 5 6.5C6.933 6.5 8.5 8.067 8.5 10Z",
    "M5 10.5C5 10.7761 4.77614 11 4.5 11C4.22386 11 4 10.7761 4 10.5C4 10.2239 4.22386 10 4.5 10C4.77614 10 5 10.2239 5 10.5Z",
    "M4.75 10.5C4.75 10.3619 4.63807 10.25 4.5 10.25C4.36193 10.25 4.25 10.3619 4.25 10.5C4.25 10.6381 4.36193 10.75 4.5 10.75C4.63807 10.75 4.75 10.6381 4.75 10.5ZM5.25 10.5C5.25 10.9142 4.91421 11.25 4.5 11.25C4.08579 11.25 3.75 10.9142 3.75 10.5C3.75 10.0858 4.08579 9.75 4.5 9.75C4.91421 9.75 5.25 10.0858 5.25 10.5Z",
    "M14.3535 4.64648L13.6465 5.35352L12 3.70703L10.707 5L12.3535 6.64648L11.6465 7.35352L10 5.70703L7.35352 8.35352L6.64648 7.64648L12 2.29297L14.3535 4.64648Z",
  ],
};

function icon(name, size = 20, fill = C.textMid) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return {
    type: "svg",
    props: {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      style: { display: "flex", flexShrink: "0" },
      children:
        paths.length === 1
          ? { type: "path", props: { d: paths[0], fill } }
          : paths.map(d => ({ type: "path", props: { d, fill } })),
    },
  };
}

function issueIconName(status) {
  return status === "closed" ? "issue-closed" : "issue";
}

function patchIconName(status) {
  if (status === "draft") return "patch-draft";
  if (status === "merged") return "patch-merged";
  if (status === "archived") return "patch-archived";
  return "patch";
}

const WORDMARK_PATHS = [
  "M1.84555 13.7149H0V15.7954H6.28119V13.7149H4.466V7.01257H8.02772V4.61917H1.84555V13.7149Z",
  "M9.20923 12.8172C9.20923 10.7169 10.627 9.62514 13.2475 9.23834L15.1855 8.96243C15.8785 8.86078 16.2152 8.63636 16.2152 8.06474C16.2152 6.98355 15.4706 6.37233 14.1861 6.37233C12.8198 6.37233 12.0964 7.10633 11.8812 8.14659L9.3518 7.76903C9.73992 5.91293 11.2792 4.41458 14.1848 4.41458C17.0904 4.41458 18.8449 6.0159 18.8449 8.56507V15.7941H16.2653V13.7241H16.1637C15.8072 14.9479 14.594 15.9974 12.7485 15.9974C10.5967 15.9974 9.21055 14.7327 9.21055 12.8159L9.20923 12.8172ZM16.2138 10.9109V10.544L13.7874 10.9928C12.5333 11.2278 11.9828 11.7572 11.9828 12.5624C11.9828 13.4601 12.6455 13.9895 13.6554 13.9895C15.369 13.9895 16.2152 12.7459 16.2152 10.9096L16.2138 10.9109Z",
  "M20.5122 10.1861C20.5122 6.65872 22.3274 4.41449 25.0191 4.41449C26.5492 4.41449 27.7518 5.28182 28.3234 6.61647H28.4158V0.826372H31.0469V15.7953H28.4158V13.7465H28.3142C27.6211 15.1841 26.5505 16 25.031 16C22.3287 16 20.5135 13.7267 20.5135 10.1874L20.5122 10.1861ZM25.8455 13.7953C27.4152 13.7953 28.4053 12.3775 28.4053 10.1861C28.4053 7.99469 27.4165 6.58611 25.8455 6.58611C24.2746 6.58611 23.2858 7.99337 23.2858 10.1861C23.2858 12.3788 24.2851 13.7953 25.8455 13.7953Z",
  "M37.3981 13.7149H39.2436V15.7954H32.9624V13.7149H34.7776V6.69967H33.0957V4.61914H37.3981V13.7149ZM34.441 1.54983C34.441 0.693069 35.1551 0 36.0212 0C36.8872 0 37.5816 0.693069 37.5816 1.54983C37.5816 2.4066 36.899 3.08911 36.0212 3.08911C35.1433 3.08911 34.441 2.4066 34.441 1.54983Z",
  "M50.0937 7.98415L47.5644 8.52409C47.299 7.28052 46.5756 6.54653 45.3413 6.54653C43.7505 6.54653 42.7406 7.8825 42.7406 10.2073C42.7406 12.532 43.7598 13.868 45.3505 13.868C46.4924 13.868 47.3083 13.2462 47.5433 12.0026H50.1532C49.8574 14.5109 48.1954 16 45.3505 16C42.0871 16 39.9868 13.7267 39.9868 10.2086C39.9868 6.69042 42.0871 4.41716 45.34 4.41716C48.0317 4.41716 49.765 5.86534 50.0911 7.98547L50.0937 7.98415Z",
  "M55.5287 13.7148H57.3742V15.7953H51.093V13.7148H52.9082V2.90558H51.2264V0.826372H55.5287V13.7148Z",
  "M57.9749 10.2271C57.9749 6.74989 60.1267 4.41458 63.3174 4.41458C66.2442 4.41458 68.5386 6.34197 68.2323 10.808H60.7273C60.8805 12.7855 61.9207 13.938 63.328 13.938C64.5412 13.938 65.3055 13.336 65.6013 12.2958H68.2626C67.9775 14.1822 66.1729 15.9974 63.328 15.9974C60.0963 15.9974 57.9749 13.744 57.9749 10.2258V10.2271ZM65.6013 9.01392C65.5405 7.37167 64.7036 6.38289 63.328 6.38289C62.0739 6.38289 61.0851 7.10633 60.7894 9.01392H65.6026H65.6013Z",
];

function wordmark(width = 139) {
  const height = width * (16 / 69);
  return {
    type: "svg",
    props: {
      width,
      height,
      viewBox: "0 0 69 16",
      style: { display: "flex", flexShrink: "0" },
      children: WORDMARK_PATHS.map(d => ({
        type: "path",
        props: { d, fill: C.text },
      })),
    },
  };
}

function homeCard(host) {
  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    {
      type: "img",
      props: {
        src: forestDataUri,
        width: 630,
        height: 630,
        style: { display: "flex", objectFit: "cover", flexShrink: "0" },
      },
    },
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el("div", {}, wordmark(139)),
      el(
        "div",
        { flexDirection: "column", gap: "48px", width: "100%" },
        el(
          "div",
          {
            color: C.text,
            fontSize: 80,
            fontWeight: 600,
            letterSpacing: "-1.6px",
            lineHeight: "57px",
          },
          "Explorer",
        ),
        el(
          "div",
          {
            color: C.textSub,
            fontSize: 40,
            lineHeight: "48px",
          },
          "Explore code on the Radicle network",
        ),
      ),
      el("div", { color: C.textMid, fontSize: 28, lineHeight: "40px" }, host),
    ),
  );
}

function nodeCard(host, node, stats) {
  const repoCount = stats?.repos?.total;
  const pinnedCount = stats?.repos?.pinned;
  const nid = node?.id ?? host;

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "630px",
        height: "630px",
        overflow: "hidden",
        flexShrink: "0",
      },
      userAvatarSvg(nid, 630),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        {
          flex: "1",
          flexDirection: "column",
          justifyContent: "space-between",
        },
        el(
          "div",
          { flexShrink: "0" },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                color: "#1C77FF",
                backgroundColor: "rgba(28, 119, 255, 0.10)",
                fontFamily: "Booton",
                fontSize: 32,
                fontWeight: 600,
                height: 84,
                paddingLeft: 30,
                paddingRight: 30,
                paddingTop: 18,
                paddingBottom: 18,
                borderRadius: 6,
                lineHeight: "36px",
                justifyContent: "center",
                alignItems: "center",
              },
              children: "Node",
            },
          },
        ),
        el(
          "div",
          { flexDirection: "column", gap: "24px", width: "100%" },
          el(
            "div",
            {
              color: C.text,
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: "-0.96px",
              lineHeight: "52px",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            },
            host,
          ),
          node?.description
            ? el(
                "div",
                {
                  color: C.textSub,
                  fontSize: 24,
                  lineHeight: "32px",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                },
                node.description,
              )
            : null,
        ),
        el(
          "div",
          { alignItems: "center", gap: "16px", width: "100%" },
          repoCount !== undefined
            ? el(
                "div",
                { alignItems: "center", gap: "8px" },
                icon("repository", 32, C.textMid),
                el(
                  "div",
                  { color: C.textMid, fontSize: 28, lineHeight: "40px" },
                  formatCount(repoCount),
                ),
              )
            : null,
          pinnedCount !== undefined
            ? el(
                "div",
                { alignItems: "center", gap: "8px" },
                icon("pin", 32, C.textMid),
                el(
                  "div",
                  { color: C.textMid, fontSize: 28, lineHeight: "40px" },
                  String(pinnedCount),
                ),
              )
            : null,
        ),
      ),
    ),
  );
}

function userCard(host, did, identity) {
  const nid = nidFromDid(did);
  const displayName = identity?.alias ?? shortDid(did);

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "630px",
        height: "630px",
        overflow: "hidden",
        flexShrink: "0",
      },
      userAvatarSvg(nid, 630),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        {
          flex: "1",
          flexDirection: "column",
          justifyContent: "space-between",
        },
        el(
          "div",
          { flexShrink: "0" },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                color: "#1C77FF",
                backgroundColor: "rgba(28, 119, 255, 0.10)",
                fontFamily: "Booton",
                fontSize: 32,
                fontWeight: 600,
                height: 84,
                paddingLeft: 30,
                paddingRight: 30,
                paddingTop: 18,
                paddingBottom: 18,
                borderRadius: 6,
                lineHeight: "36px",
                justifyContent: "center",
                alignItems: "center",
              },
              children: "User",
            },
          },
        ),
        el(
          "div",
          { flexDirection: "column", gap: "24px", width: "100%" },
          el(
            "div",
            {
              color: C.text,
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: "-0.96px",
              lineHeight: "52px",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            },
            displayName,
          ),
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("key", 32, C.textMid),
            el(
              "div",
              { color: C.textMid, fontSize: 28, lineHeight: "40px" },
              shortDid(did),
            ),
          ),
        ),
      ),
    ),
  );
}

function repoCard(repo, host) {
  if (!repo) return nodeCard(host, null, null);
  const p = repoPayload(repo);
  const issueCount = p?.meta?.issues?.open ?? 0;
  const patchCount = p?.meta?.patches?.open ?? 0;
  const delegates = repo.delegates ?? [];
  const repoName = p?.data?.name ?? "";
  const avatarKey = `${repoName}${repo.rid.replace("rad:z", "")}${repoName}`;

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "630px",
        height: "630px",
        overflow: "hidden",
        flexShrink: "0",
      },
      repoAvatarSvg(avatarKey, 630),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          {
            color: C.text,
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: "-0.96px",
            lineHeight: "52px",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          },
          repoName || repo.rid,
        ),
        el(
          "div",
          { color: C.textMuted, fontSize: 20, lineHeight: "20px" },
          repo.rid,
        ),
        p?.data?.description
          ? el(
              "div",
              {
                color: C.textSub,
                fontSize: 24,
                lineHeight: "32px",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              },
              p.data.description,
            )
          : null,
      ),
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          { alignItems: "center", gap: "16px" },
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("seed", 32, C.textMid),
            el(
              "div",
              { color: C.textMid, fontSize: 28, lineHeight: "40px" },
              formatCount(repo.seeding),
            ),
          ),
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("issue", 32, C.textMid),
            el(
              "div",
              { color: C.textMid, fontSize: 28, lineHeight: "40px" },
              String(issueCount),
            ),
          ),
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("patch", 32, C.textMid),
            el(
              "div",
              { color: C.textMid, fontSize: 28, lineHeight: "40px" },
              String(patchCount),
            ),
          ),
        ),
        delegates.length > 0
          ? el(
              "div",
              { alignItems: "center", flexWrap: "wrap", gap: "16px" },
              ...delegates.slice(0, 3).map(d => {
                const nid = nidFromDid(d.id);
                return el(
                  "div",
                  { alignItems: "center", gap: "8px" },
                  userAvatarSvg(nid, 32),
                  el(
                    "div",
                    { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                    d.alias ?? `${nid.slice(0, 4)}\u2026${nid.slice(-4)}`,
                  ),
                );
              }),
              delegates.length > 3
                ? el(
                    "div",
                    { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                    `+${delegates.length - 3} more`,
                  )
                : null,
            )
          : null,
      ),
    ),
  );
}

function historyCard(repo, host, stats, branch, peer, peerAlias) {
  if (!repo) return repoCard(repo, host);
  const p = repoPayload(repo);
  const repoName = p?.data?.name ?? "";
  const avatarKey = `${repoName}${repo.rid.replace("rad:z", "")}${repoName}`;
  const commitCount = stats?.commits;
  const branchLabel = branch || p?.data?.defaultBranch;

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "630px",
        height: "630px",
        overflow: "hidden",
        flexShrink: "0",
      },
      repoAvatarSvg(avatarKey, 630),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          {
            color: C.text,
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: "-0.96px",
            lineHeight: "52px",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          },
          repoName || repo.rid,
        ),
        el(
          "div",
          { color: C.textMuted, fontSize: 20, lineHeight: "20px" },
          repo.rid,
        ),
        p?.data?.description
          ? el(
              "div",
              {
                color: C.textSub,
                fontSize: 24,
                lineHeight: "32px",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              },
              p.data.description,
            )
          : null,
      ),
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          { alignItems: "center", gap: "8px", flexWrap: "wrap" },
          el(
            "div",
            { color: C.textMid, fontSize: 28, lineHeight: "40px" },
            "Commits on",
          ),
          ...(peer
            ? [
                userAvatarSvg(peer, 28),
                el(
                  "div",
                  { color: C.textMid, fontSize: 28, lineHeight: "40px" },
                  peerAlias ? `${peerAlias} /` : `${peer.slice(0, 6)}\u2026 /`,
                ),
              ]
            : []),
          branchLabel
            ? el(
                "div",
                { color: C.textMid, fontSize: 28, lineHeight: "40px" },
                branchLabel,
              )
            : null,
          ...(!peer
            ? [
                el(
                  "div",
                  {
                    color: "#ffffff",
                    backgroundColor: "#165fcc",
                    fontSize: 20,
                    lineHeight: "28px",
                    borderRadius: "4px",
                    padding: "4px 10px",
                  },
                  "Canonical",
                ),
              ]
            : []),
        ),
        commitCount !== undefined
          ? el(
              "div",
              { alignItems: "center", gap: "8px" },
              icon("commit", 64, C.textMuted),
              el(
                "div",
                { color: C.textSub, fontSize: 56, lineHeight: "80px" },
                commitCount.toLocaleString("en-US"),
              ),
            )
          : null,
      ),
    ),
  );
}

function issuesCard(repo, host) {
  if (!repo) return repoCard(repo, host);
  const p = repoPayload(repo);
  const repoName = p?.data?.name ?? "";
  const avatarKey = `${repoName}${repo.rid.replace("rad:z", "")}${repoName}`;
  const issues = p?.meta?.issues ?? {};

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "630px",
        height: "630px",
        overflow: "hidden",
        flexShrink: "0",
      },
      repoAvatarSvg(avatarKey, 630),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          {
            color: C.text,
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: "-0.96px",
            lineHeight: "52px",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          },
          repoName || repo.rid,
        ),
        el(
          "div",
          { color: C.textMuted, fontSize: 20, lineHeight: "20px" },
          repo.rid,
        ),
        p?.data?.description
          ? el(
              "div",
              {
                color: C.textSub,
                fontSize: 24,
                lineHeight: "32px",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              },
              p.data.description,
            )
          : null,
      ),
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          { color: C.textMid, fontSize: 28, lineHeight: "40px" },
          "Issues",
        ),
        el(
          "div",
          { alignItems: "center", gap: "32px" },
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("issue", 64, C.textMuted),
            el(
              "div",
              { color: C.textSub, fontSize: 56, lineHeight: "80px" },
              String(issues.open ?? 0),
            ),
          ),
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("issue-closed", 64, C.textMuted),
            el(
              "div",
              { color: C.textSub, fontSize: 56, lineHeight: "80px" },
              String(issues.closed ?? 0),
            ),
          ),
        ),
      ),
    ),
  );
}

function patchesCard(repo, host) {
  if (!repo) return repoCard(repo, host);
  const p = repoPayload(repo);
  const repoName = p?.data?.name ?? "";
  const avatarKey = `${repoName}${repo.rid.replace("rad:z", "")}${repoName}`;
  const patches = p?.meta?.patches ?? {};

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "630px",
        height: "630px",
        overflow: "hidden",
        flexShrink: "0",
      },
      repoAvatarSvg(avatarKey, 630),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          {
            color: C.text,
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: "-0.96px",
            lineHeight: "52px",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          },
          repoName || repo.rid,
        ),
        el(
          "div",
          { color: C.textMuted, fontSize: 20, lineHeight: "20px" },
          repo.rid,
        ),
        p?.data?.description
          ? el(
              "div",
              {
                color: C.textSub,
                fontSize: 24,
                lineHeight: "32px",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              },
              p.data.description,
            )
          : null,
      ),
      el(
        "div",
        { flexDirection: "column", gap: "24px", width: "100%" },
        el(
          "div",
          { color: C.textMid, fontSize: 28, lineHeight: "40px" },
          "Patches",
        ),
        el(
          "div",
          { alignItems: "center", flexWrap: "wrap", gap: "32px" },
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("patch", 64, C.textMuted),
            el(
              "div",
              { color: C.textSub, fontSize: 56, lineHeight: "80px" },
              String(patches.open ?? 0),
            ),
          ),
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("patch-draft", 64, C.textMuted),
            el(
              "div",
              { color: C.textSub, fontSize: 56, lineHeight: "80px" },
              String(patches.draft ?? 0),
            ),
          ),
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("patch-archived", 64, C.textMuted),
            el(
              "div",
              { color: C.textSub, fontSize: 56, lineHeight: "80px" },
              String(patches.archived ?? 0),
            ),
          ),
          el(
            "div",
            { alignItems: "center", gap: "8px" },
            icon("patch-merged", 64, C.textMuted),
            el(
              "div",
              { color: C.textSub, fontSize: 56, lineHeight: "80px" },
              String(patches.merged ?? 0),
            ),
          ),
        ),
      ),
    ),
  );
}

const STATE_PILL = {
  open: { bg: "#bef98a", text: "#256400" },
  closed: { bg: "#afcfff", text: "#0b3266" },
  merged: { bg: "#afcfff", text: "#0b3266" },
  draft: { bg: "#e9ebef", text: "#5a5f6b" },
  archived: { bg: "#ffdbff", text: "#664266" },
};

function statePill(label, status, iconName) {
  const colors = STATE_PILL[status] ?? STATE_PILL.open;
  return el(
    "div",
    { flexShrink: "0" },
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          backgroundColor: colors.bg,
          color: colors.text,
          fontFamily: "Booton",
          fontSize: 32,
          fontWeight: 600,
          paddingLeft: 18,
          paddingRight: 30,
          paddingTop: 18,
          paddingBottom: 18,
          borderRadius: 6,
          lineHeight: "36px",
          gap: 12,
          justifyContent: "center",
          alignItems: "center",
        },
        children: [icon(iconName, 48, colors.text), label],
      },
    },
  );
}

function issueCard(repo, host, issue) {
  if (!issue) return repoCard(repo, host);
  const p = repoPayload(repo);
  const repoName = p?.data?.name ?? "";
  const avatarKey = `${repoName}${repo.rid.replace("rad:z", "")}${repoName}`;
  const status = issue.state?.status ?? "open";
  const statusLabel = status === "closed" ? "Closed Issue" : "Open Issue";

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "315px",
        height: "630px",
        flexShrink: "0",
        flexDirection: "column",
        backgroundColor: "#f8f9fa",
      },
      el(
        "div",
        {
          width: "315px",
          height: "315px",
          overflow: "hidden",
          flexShrink: "0",
        },
        repoAvatarSvg(avatarKey, 315),
      ),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        {
          flex: "1",
          flexDirection: "column",
          justifyContent: "space-between",
        },
        statePill(statusLabel, status, issueIconName(status)),
        el(
          "div",
          { flexDirection: "column", gap: "24px" },
          el(
            "div",
            { alignItems: "center", gap: "16px" },
            icon("repository", 32, C.textMid),
            el(
              "div",
              {
                color: C.textMid,
                fontSize: 28,
                lineHeight: "40px",
              },
              repoName || repo.rid,
            ),
          ),
          el(
            "div",
            {
              color: C.text,
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: "-0.96px",
              lineHeight: "52px",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            },
            issue.title,
          ),
        ),
        el(
          "div",
          { alignItems: "center", gap: "24px" },
          issue.author
            ? el(
                "div",
                { alignItems: "center", gap: "8px" },
                userAvatarSvg(nidFromDid(issue.author.id), 28),
                el(
                  "div",
                  { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                  authorLabel(issue.author),
                ),
              )
            : null,
          issue.author
            ? el(
                "div",
                { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                "\u00B7",
              )
            : null,
          el(
            "div",
            { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
            shortId(issue.id),
          ),
        ),
      ),
    ),
  );
}

function patchCard(repo, host, patch) {
  if (!patch) return repoCard(repo, host);
  const p = repoPayload(repo);
  const repoName = p?.data?.name ?? "";
  const avatarKey = `${repoName}${repo.rid.replace("rad:z", "")}${repoName}`;
  const status = patch.state?.status ?? "open";
  const statusLabels = {
    open: "Open Patch",
    closed: "Closed Patch",
    merged: "Merged Patch",
    draft: "Draft Patch",
    archived: "Archived Patch",
  };

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "315px",
        height: "630px",
        flexShrink: "0",
        flexDirection: "column",
        backgroundColor: "#f8f9fa",
      },
      el(
        "div",
        {
          width: "315px",
          height: "315px",
          overflow: "hidden",
          flexShrink: "0",
        },
        repoAvatarSvg(avatarKey, 315),
      ),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        {
          flex: "1",
          flexDirection: "column",
          justifyContent: "space-between",
        },
        statePill(
          statusLabels[status] ?? "Patch",
          status,
          patchIconName(status),
        ),
        el(
          "div",
          { flexDirection: "column", gap: "24px" },
          el(
            "div",
            { alignItems: "center", gap: "16px" },
            icon("repository", 32, C.textMid),
            el(
              "div",
              {
                color: C.textMid,
                fontSize: 28,
                lineHeight: "40px",
              },
              repoName || repo.rid,
            ),
          ),
          el(
            "div",
            {
              color: C.text,
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: "-0.96px",
              lineHeight: "52px",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            },
            patch.title,
          ),
        ),
        el(
          "div",
          { alignItems: "center", gap: "24px" },
          patch.author
            ? el(
                "div",
                { alignItems: "center", gap: "8px" },
                userAvatarSvg(nidFromDid(patch.author.id), 28),
                el(
                  "div",
                  { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                  authorLabel(patch.author),
                ),
              )
            : null,
          patch.author
            ? el(
                "div",
                { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                "\u00B7",
              )
            : null,
          el(
            "div",
            { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
            shortId(patch.id),
          ),
        ),
      ),
    ),
  );
}

function commitCard(repo, host, commit, authorAvatar, committerAvatar) {
  if (!commit) return repoCard(repo, host);
  const p = repoPayload(repo);
  const repoName = p?.data?.name ?? "";
  const avatarKey = `${repoName}${repo.rid.replace("rad:z", "")}${repoName}`;
  const c = commit.commit ?? {};
  const author = c.author;
  const committer = c.committer;
  const sameAuthorCommitter = author?.name === committer?.name;

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      backgroundColor: C.bg,
    },
    el(
      "div",
      {
        width: "315px",
        height: "630px",
        flexShrink: "0",
        flexDirection: "column",
        backgroundColor: "#f8f9fa",
      },
      el(
        "div",
        {
          width: "315px",
          height: "315px",
          overflow: "hidden",
          flexShrink: "0",
        },
        repoAvatarSvg(avatarKey, 315),
      ),
    ),
    el(
      "div",
      {
        flex: "1",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        height: "100%",
      },
      el(
        "div",
        {
          flex: "1",
          flexDirection: "column",
          justifyContent: "space-between",
        },
        statePill("Commit", "draft", "commit"),
        el(
          "div",
          { flexDirection: "column", gap: "24px" },
          el(
            "div",
            { alignItems: "center", gap: "16px" },
            icon("repository", 32, C.textMid),
            el(
              "div",
              {
                color: C.textMid,
                fontSize: 28,
                lineHeight: "40px",
              },
              repoName || repo.rid,
            ),
          ),
          el(
            "div",
            {
              color: C.text,
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: "-0.96px",
              lineHeight: "52px",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            },
            c.summary ?? "Commit",
          ),
        ),
        el(
          "div",
          {
            flexDirection: "column",
            gap: "16px",
            flexWrap: "wrap",
            width: "100%",
          },
          author?.name
            ? el(
                "div",
                { alignItems: "center", gap: "8px", lineHeight: "40px" },
                gravatarImg(authorAvatar, 28),
                el(
                  "div",
                  { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                  author.name,
                ),
                !sameAuthorCommitter
                  ? el(
                      "div",
                      { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                      "authored",
                    )
                  : null,
              )
            : null,
          !sameAuthorCommitter && committer?.name
            ? el(
                "div",
                { alignItems: "center", gap: "8px", lineHeight: "40px" },
                gravatarImg(committerAvatar, 28),
                el(
                  "div",
                  { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                  committer.name,
                ),
                el(
                  "div",
                  { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
                  "committed",
                ),
              )
            : null,
          el(
            "div",
            { alignItems: "center", gap: "24px" },
            el(
              "div",
              { color: C.textMuted, fontSize: 28, lineHeight: "40px" },
              shortId(c.id ?? commit.id ?? ""),
            ),
          ),
        ),
      ),
    ),
  );
}

async function renderPng(template) {
  const svg = await satori(template, {
    width: WIDTH,
    height: HEIGHT,
    fonts: font,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  return resvg.render().asPng();
}

function titleForRoute(route) {
  switch (route.type) {
    case "home":
      return "Radicle Explorer \u00b7 Decentralized Code Collaboration";
    case "node":
      return `Radicle Seed Node \u00b7 ${route.host}`;
    case "user":
      return `Radicle User \u00b7 ${shortDid(route.did)} \u00b7 ${route.host}`;
    case "repo":
      return `Radicle Repo \u00b7 ${route.rid} \u00b7 ${route.host}`;
    case "issues":
      return `Issues \u00b7 ${route.rid} \u00b7 ${route.host}`;
    case "patches":
      return `Patches \u00b7 ${route.rid} \u00b7 ${route.host}`;
    case "issue":
      return `Issue ${route.id.slice(0, 7)} \u00b7 ${route.rid} \u00b7 ${route.host}`;
    case "patch":
      return `Patch ${route.id.slice(0, 7)} \u00b7 ${route.rid} \u00b7 ${route.host}`;
    case "commit":
      return `Commit ${route.sha.slice(0, 7)} \u00b7 ${route.rid} \u00b7 ${route.host}`;
    case "history":
      return `Commit History \u00b7 ${route.rid} \u00b7 ${route.host}`;
    default:
      return "Radicle Explorer \u00b7 Decentralized Code Collaboration";
  }
}

function descriptionForRoute(route) {
  const h = route.host;
  switch (route.type) {
    case "home":
      return "Explore open-source repositories, issues, and patches on the Radicle peer-to-peer code collaboration network. Sovereign hosting without central servers.";
    case "node":
      return `Browse repositories hosted on the ${h} Radicle seed node. Explore source code, issues, patches, and contributor activity.`;
    case "user":
      return `Radicle user profile on ${h}. Browse repositories, patches, and contributions across the peer-to-peer network.`;
    case "repo":
      return `Radicle repository hosted on ${h}. Browse source code, issues, patches, commit history, and contributor activity.`;
    case "issues":
      return `Browse issues for this repository on ${h}. View bug reports, feature requests, and ongoing discussions on the Radicle network.`;
    case "patches":
      return `Browse patches for this repository on ${h}. View proposed changes, code reviews, and merge status on the Radicle network.`;
    case "issue":
      return `View this issue and its discussion in a Radicle repository on ${h}. Track progress, comments, and resolution.`;
    case "patch":
      return `View this patch and its review in a Radicle repository on ${h}. Browse revisions, review comments, and merge status.`;
    case "commit":
      return `View this commit and its diff in a Radicle repository on ${h}. Inspect changed files, author details, and additions.`;
    case "history":
      return `Browse the commit history of this Radicle repository on ${h}. View commits, contributors, and development activity.`;
    default:
      return "Explore open-source repositories, issues, and patches on the Radicle peer-to-peer code collaboration network.";
  }
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function handleOgHtml(request, url, env) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const route = parseRoute(url.pathname);
  if (!route) {
    return new Response("Not found", { status: 404 });
  }

  const appBase = env.APP_BASE || "https://radicle.network";
  const appHost = new URL(appBase).hostname;
  const hostParam = route.type === "home" ? `?host=${appHost}` : "";
  const ogImageUrl = escapeHtml(
    `https://${url.hostname}/cards${url.pathname}${hostParam}`,
  );
  const canonicalUrl = escapeHtml(`${appBase}${url.pathname}`);
  const title = escapeHtml(titleForRoute(route));
  const description = escapeHtml(descriptionForRoute(route));

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta property="og:site_name" content="Radicle Explorer" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@radicle" />
  <meta name="theme-color" content="#1c77ff" />
</head>
<body></body>
</html>`;

  const response = new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "cache-control": "public, max-age=7200",
    },
  });

  await cache.put(request, response.clone());
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/cards" && !url.pathname.startsWith("/cards/")) {
      return handleOgHtml(request, url, env);
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=7200",
        },
      });
    }

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const pathname = url.pathname.replace(/^\/cards/, "") || "/";
    const route = parseRoute(pathname);

    if (!route) {
      return new Response("Not found", { status: 404 });
    }

    try {
      await ensureInit();

      let template;

      switch (route.type) {
        case "home": {
          const appHost = url.searchParams.get("host") || url.hostname;
          template = homeCard(appHost);
          break;
        }

        case "node": {
          const [node, stats] = await Promise.all([
            fetchNode(route.host),
            fetchNodeStats(route.host),
          ]);
          template = nodeCard(route.host, node, stats);
          break;
        }

        case "user": {
          const nid = route.did.startsWith("did:key:")
            ? route.did.slice(8)
            : route.did;
          const identity = await fetchNodeIdentity(route.host, nid);
          template = userCard(route.host, route.did, identity);
          break;
        }

        case "repo": {
          const repo = await fetchRepo(route.host, route.rid);
          template = repoCard(repo, route.host);
          break;
        }

        case "issues": {
          const repo = await fetchRepo(route.host, route.rid);
          template = issuesCard(repo, route.host);
          break;
        }

        case "patches": {
          const repo = await fetchRepo(route.host, route.rid);
          template = patchesCard(repo, route.host);
          break;
        }

        case "issue": {
          const [repo, issue] = await Promise.all([
            fetchRepo(route.host, route.rid),
            fetchIssue(route.host, route.rid, route.id),
          ]);
          template = issueCard(repo, route.host, issue);
          break;
        }

        case "patch": {
          const [repo, patch] = await Promise.all([
            fetchRepo(route.host, route.rid),
            fetchPatch(route.host, route.rid, route.id),
          ]);
          template = patchCard(repo, route.host, patch);
          break;
        }

        case "history": {
          const [repo, remote] = await Promise.all([
            fetchRepo(route.host, route.rid),
            route.peer ? fetchRemote(route.host, route.rid, route.peer) : null,
          ]);
          const p = repoPayload(repo);
          let sha = p?.meta?.head;
          let peerAlias = null;
          let branch = route.branch;

          if (route.peer && remote) {
            const peerDid = `did:key:${route.peer}`;
            const delegate = (repo?.delegates ?? []).find(
              d => d.id === peerDid,
            );
            peerAlias = delegate?.alias ?? null;
            if (remote.heads) {
              const targetBranch = branch || p?.data?.defaultBranch;
              sha =
                remote.heads[targetBranch] ??
                Object.values(remote.heads)[0] ??
                sha;
              if (!branch) branch = targetBranch;
            }
          }

          const stats = sha
            ? await fetchTreeStats(route.host, route.rid, sha)
            : null;
          template = historyCard(
            repo,
            route.host,
            stats,
            branch,
            route.peer,
            peerAlias,
          );
          break;
        }

        case "commit": {
          const [repo, commit] = await Promise.all([
            fetchRepo(route.host, route.rid),
            fetchCommit(route.host, route.rid, route.sha),
          ]);
          const c = commit?.commit ?? {};
          const [authorAvatar, committerAvatar] = await Promise.all([
            fetchGravatarDataUri(c.author?.email),
            c.author?.email !== c.committer?.email
              ? fetchGravatarDataUri(c.committer?.email)
              : null,
          ]);
          template = commitCard(
            repo,
            route.host,
            commit,
            authorAvatar,
            committerAvatar ?? authorAvatar,
          );
          break;
        }

        default:
          template = homeCard();
      }

      const png = await renderPng(template);
      const response = new Response(png, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=7200",
        },
      });

      await cache.put(request, response.clone());
      return response;
    } catch (err) {
      console.error("OG image generation failed:", err);
      return new Response("Image generation failed", { status: 500 });
    }
  },
};
