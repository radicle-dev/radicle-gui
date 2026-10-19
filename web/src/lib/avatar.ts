/* eslint-disable @typescript-eslint/naming-convention */
import { cached } from "@app/lib/cached";

type AtomType = "A" | "B" | "C" | "D";
type ShapeModel =
  "rose" | "starburst" | "ringed" | "tip" | "notched" | "hollow";
type AtomMode = "bands-ABC" | "angle-stripes" | "parity-ACB" | "balanced-rand";

const PALETTE = [
  "#00D4DA", // teal
  "#886BF2", // purple
  "#FFA5FF", // pink
  "#009F67", // green
  "#CCFF38", // lime
  "#585600", // olive
];

const REPO_CONFIG = {
  GRID_SIZE: 16,
  CELL_SIZE: 32,
  PIXEL_DENSITY: 2,
  GLYPH: {
    WIDTH: 5,
    HEIGHT: 7,
    SPACING: 2,
    SCALE_2X_WIDTH: 10,
    SCALE_2X_HEIGHT: 14,
  },
  ATOMS: {
    CIRCLE_B_RATIO: 0.55,
    CIRCLE_C_RATIO: 0.67,
  },
} as const;

const USER_CONFIG = {
  TILE_SIZE: 32,
  DEFAULT_GRID: 10,
  PIXEL_DENSITY: 2,
  ATOMS: {
    ELLIPSE_B_SIZE: 17,
    ELLIPSE_C_SIZE: 21,
  },
  TOLERANCE: {
    ANGLE_NEAR_BASE: Math.PI / 28,
    ANGLE_FAR_BASE: Math.PI / 7,
    NEAR_RANGE: { MIN: 0.7, MAX: 1.2 },
    FAR_RANGE: { MIN: 0.7, MAX: 1.2 },
  },
  SOFTNESS: {
    MIN: 1.2,
    MAX: 4.2,
  },
  RING_PHASE: {
    MIN: 0.2,
    MAX: 0.8,
  },
} as const;

function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function xmur3(str: string): () => number {
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

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRNG(key: string): () => number {
  return mulberry32(xmur3(key)());
}

function chooseK<T>(arr: T[], k: number, rnd: () => number): T[] {
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rnd() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function createOffscreenCanvas(
  w: number,
  h: number,
  density: number = 2,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w * density;
  canvas.height = h * density;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(density, density);
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function fillCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  diameter: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, diameter / 2, 0, Math.PI * 2);
  ctx.fill();
}

function fillEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

interface AtomDrawConfig {
  cellSize: number;
  circleB: number;
  circleC: number;
  useEllipse?: boolean;
}

function createAtomRenderer(config: AtomDrawConfig) {
  const drawCircleOrEllipse = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
  ) => {
    if (config.useEllipse) {
      fillEllipse(ctx, x, y, w, h, color);
    } else {
      fillCircle(ctx, x, y, w, color); // w is diameter for circles
    }
  };

  return {
    drawAtomA(
      ctx: CanvasRenderingContext2D,
      gx: number,
      gy: number,
      c1: string,
    ): void {
      const x = gx * config.cellSize;
      const y = gy * config.cellSize;
      ctx.fillStyle = c1;
      ctx.fillRect(x, y, config.cellSize, config.cellSize);
    },

    drawAtomB(
      ctx: CanvasRenderingContext2D,
      gx: number,
      gy: number,
      c1: string,
      c2: string,
    ): void {
      const x = gx * config.cellSize;
      const y = gy * config.cellSize;
      ctx.fillStyle = c1;
      ctx.fillRect(x, y, config.cellSize, config.cellSize);
      drawCircleOrEllipse(
        ctx,
        x + config.cellSize / 2,
        y + config.cellSize / 2,
        config.circleB,
        config.circleB,
        c2,
      );
    },

    drawAtomC(
      ctx: CanvasRenderingContext2D,
      gx: number,
      gy: number,
      c2: string,
      c3: string,
    ): void {
      const x = gx * config.cellSize;
      const y = gy * config.cellSize;
      ctx.fillStyle = c2;
      ctx.fillRect(x, y, config.cellSize, config.cellSize);
      drawCircleOrEllipse(
        ctx,
        x + config.cellSize / 2,
        y + config.cellSize / 2,
        config.circleC,
        config.circleC,
        c3,
      );
    },

    drawAtomD(
      ctx: CanvasRenderingContext2D,
      gx: number,
      gy: number,
      c3: string,
    ): void {
      const x = gx * config.cellSize;
      const y = gy * config.cellSize;
      ctx.fillStyle = c3;
      ctx.fillRect(x, y, config.cellSize, config.cellSize);
    },

    drawAtom(
      ctx: CanvasRenderingContext2D,
      atom: AtomType,
      gx: number,
      gy: number,
      c1: string,
      c2: string,
      c3: string,
    ): void {
      switch (atom) {
        case "A":
          this.drawAtomA(ctx, gx, gy, c1);
          break;
        case "B":
          this.drawAtomB(ctx, gx, gy, c1, c2);
          break;
        case "C":
          this.drawAtomC(ctx, gx, gy, c2, c3);
          break;
        case "D":
          this.drawAtomD(ctx, gx, gy, c3);
          break;
      }
    },
  };
}

// 5x7 pixel font glyphs (cached at module level for performance)
function createGlyphs5x7(): Record<string, number[][]> {
  const L: Record<string, number[][]> = {};
  const r = (s: string[]) =>
    s.map(row => row.split("").map(ch => (ch === "1" ? 1 : 0)));
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
}

const LETTER_5X7 = createGlyphs5x7();

function getInitials(name: string): string[] {
  if (!name || typeof name !== "string") return ["?"];
  const cleaned = name.trim().replace(/\s+/g, " ");
  const parts = cleaned.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const first = parts[0] ? parts[0][0].toUpperCase() : "?";
  const second = parts[1] ? parts[1][0].toUpperCase() : null;
  return second ? [first, second] : [first];
}

function polarFromCell(
  gx: number,
  gy: number,
  cx: number,
  cy: number,
): { r: number; a: number } {
  const x = gx - cx + 0.5;
  const y = gy - cy + 0.5;
  const r = Math.hypot(x, y);
  let a = Math.atan2(y, x);
  if (a < 0) a += 2 * Math.PI;
  return { r, a };
}

function shapeRose(theta: number, petals: number, tol: number): boolean {
  const sector = Math.PI / petals;
  const nearest = Math.round(theta / sector) * sector;
  let diff = Math.abs(theta - nearest);
  diff = Math.min(diff, 2 * Math.PI - diff);
  return diff <= tol;
}

function shapeStarburst(
  theta: number,
  petals: number,
  softness: number,
): boolean {
  const period = (2 * Math.PI) / petals;
  const local = theta % period;
  const d = Math.min(local, period - local) / (period / 2);
  const response = Math.pow(Math.cos((d * Math.PI) / 2), softness);
  return response > 0.5;
}

function shapeRinged(
  theta: number,
  petals: number,
  ringPhase: number,
  tol: number,
): boolean {
  const sector = (2 * Math.PI) / petals;
  const k = Math.floor(theta / sector);
  const center = k * sector + sector * ringPhase;
  let diff = Math.abs(theta - center);
  diff = Math.min(diff, 2 * Math.PI - diff);
  return diff <= tol;
}

function shapeTip(
  theta: number,
  petals: number,
  tol: number,
  t: number,
): boolean {
  return shapeRose(theta, petals, tol * (0.5 + 1.0 * t)) && t > 0.45;
}

function shapeNotched(
  theta: number,
  petals: number,
  tol: number,
  notchDepth: number = 0.25,
): boolean {
  const sector = (2 * Math.PI) / petals;
  const local = (theta % sector) / sector;
  const notch = Math.abs(local - 0.5);
  return shapeRose(theta, petals, tol) && notch > notchDepth;
}

function shapeHollow(
  theta: number,
  petals: number,
  tol: number,
  t: number,
  inner: number = 0.28,
  outer: number = 0.9,
): boolean {
  return shapeRose(theta, petals, tol) && t > inner && t < outer;
}

function sectorGate(theta: number, petals: number, mask: boolean[]): boolean {
  const sector = (2 * Math.PI) / petals;
  const k = Math.floor(theta / sector);
  return mask[k % mask.length];
}

export const cachedRepoAvatar = cached(
  async (key: string) => renderRepoAvatar(key),
  (key: string) => key,
  { max: 2000 },
);

export const cachedUserAvatar = cached(
  async (key: string) => renderUserAvatar(key),
  (key: string) => key,
  { max: 2000 },
);

function renderRepoAvatar(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  {
    // Color logic:
    //   A: square = Color1
    //   B: square = Color1, circle = Color2
    //   C: square = Color2, circle = Color3
    //   D: square = Color3
    // Letters: solid-only (A or D). Background: other three atoms.
    // Single initial: 2x2 expansion (10x14). Two initials: 5x7 each.

    const GRID = REPO_CONFIG.GRID_SIZE;
    const CELL = REPO_CONFIG.CELL_SIZE;
    const W = GRID * CELL;
    const H = GRID * CELL;

    const { canvas, ctx } = createOffscreenCanvas(
      W,
      H,
      REPO_CONFIG.PIXEL_DENSITY,
    );

    const atoms = createAtomRenderer({
      cellSize: CELL,
      circleB: CELL * REPO_CONFIG.ATOMS.CIRCLE_B_RATIO,
      circleC: CELL * REPO_CONFIG.ATOMS.CIRCLE_C_RATIO,
      useEllipse: false,
    });

    function renderInitialsAvatar(nameKey: string = "color bright") {
      const initials = getInitials(nameKey);
      const seed = hash32(nameKey.toLowerCase());
      const rnd = mulberry32(seed);

      // Select three distinct colors deterministically (Color1, Color2, Color3)
      const [c1, c2, c3] = chooseK(PALETTE, 3, rnd);

      // Choose letter solid atom: 'A' or 'D' (deterministic)
      const letterSolidAtom: AtomType = ((seed >>> 7) & 1) === 0 ? "A" : "D";

      const bgAtoms: AtomType[] = (["A", "B", "C", "D"] as AtomType[]).filter(
        a => a !== letterSolidAtom,
      );

      function pickBgAtom(gx: number, gy: number): AtomType {
        const k = (gy * 131 + gx * 197 + seed) >>> 0;
        return bgAtoms[k % bgAtoms.length];
      }

      // 1) Background: fill with bgAtoms using strict color mapping
      for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
          const atom = pickBgAtom(gx, gy);
          atoms.drawAtom(ctx, atom, gx, gy, c1, c2, c3);
        }
      }

      // 2) Letters: solid-only atom across glyph pixels, strict mapping (A uses c1, D uses c3)
      const glyphW = REPO_CONFIG.GLYPH.WIDTH;
      const glyphH = REPO_CONFIG.GLYPH.HEIGHT;

      function placeSolidLetter(
        glyph: number[][],
        startX: number,
        startY: number,
        scale2x: boolean,
      ) {
        if (scale2x) {
          // 2x2 expansion → 10x14
          for (let r = 0; r < glyphH; r++) {
            for (let c = 0; c < glyphW; c++) {
              if (!glyph[r][c]) continue;
              const gx = startX + c * 2;
              const gy = startY + r * 2;
              if (letterSolidAtom === "A") {
                atoms.drawAtomA(ctx, gx, gy, c1);
                atoms.drawAtomA(ctx, gx + 1, gy, c1);
                atoms.drawAtomA(ctx, gx, gy + 1, c1);
                atoms.drawAtomA(ctx, gx + 1, gy + 1, c1);
              } else {
                atoms.drawAtomD(ctx, gx, gy, c3);
                atoms.drawAtomD(ctx, gx + 1, gy, c3);
                atoms.drawAtomD(ctx, gx, gy + 1, c3);
                atoms.drawAtomD(ctx, gx + 1, gy + 1, c3);
              }
            }
          }
        } else {
          // 1x scale
          for (let r = 0; r < glyphH; r++) {
            for (let c = 0; c < glyphW; c++) {
              if (!glyph[r][c]) continue;
              const gx = startX + c;
              const gy = startY + r;
              if (letterSolidAtom === "A") {
                atoms.drawAtomA(ctx, gx, gy, c1);
              } else {
                atoms.drawAtomD(ctx, gx, gy, c3);
              }
            }
          }
        }
      }

      if (initials.length === 1) {
        // Single initial: 2x2 expansion (10x14), centered
        const glyph = LETTER_5X7[initials[0]] || LETTER_5X7["?"];
        const startX = Math.floor(
          (GRID - REPO_CONFIG.GLYPH.SCALE_2X_WIDTH) / 2,
        );
        const startY = Math.floor(
          (GRID - REPO_CONFIG.GLYPH.SCALE_2X_HEIGHT) / 2,
        );
        placeSolidLetter(glyph, startX, startY, true);
      } else {
        // Two initials: 5x7 each, side-by-side
        const leftGlyph = LETTER_5X7[initials[0]] || LETTER_5X7["?"];
        const rightGlyph = LETTER_5X7[initials[1]] || LETTER_5X7["?"];
        const spacing = REPO_CONFIG.GLYPH.SPACING;
        const totalW = REPO_CONFIG.GLYPH.WIDTH * 2 + spacing;
        const totalH = REPO_CONFIG.GLYPH.HEIGHT;
        const startX = Math.floor((GRID - totalW) / 2);
        const startY = Math.floor((GRID - totalH) / 2);
        placeSolidLetter(leftGlyph, startX, startY, false);
        placeSolidLetter(
          rightGlyph,
          startX + REPO_CONFIG.GLYPH.WIDTH + spacing,
          startY,
          false,
        );
      }

      return canvas.toDataURL();
    }

    return renderInitialsAvatar(key);
  }
}

function renderUserAvatar(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  {
    const TILE = USER_CONFIG.TILE_SIZE;
    const DEFAULT_GRID = USER_CONFIG.DEFAULT_GRID;

    const atoms = createAtomRenderer({
      cellSize: TILE,
      circleB: USER_CONFIG.ATOMS.ELLIPSE_B_SIZE,
      circleC: USER_CONFIG.ATOMS.ELLIPSE_C_SIZE,
      useEllipse: true,
    });

    // Edge-to-edge integer placement
    function drawAt(
      fn: (x: number, y: number) => void,
      gx: number,
      gy: number,
    ): void {
      fn(gx * TILE, gy * TILE);
    }

    // Strict 4-way symmetry (quadrant mirroring)
    function drawQuad(
      fn: (x: number, y: number) => void,
      gx: number,
      gy: number,
      grid: number,
    ): void {
      const N = grid - 1;
      drawAt(fn, gx, gy);
      drawAt(fn, N - gx, gy);
      drawAt(fn, gx, N - gy);
      drawAt(fn, N - gx, N - gy);
    }

    // Draw by atom type (converts pixel coordinates to grid coordinates)
    function drawAtomByType(
      ctx: CanvasRenderingContext2D,
      type: AtomType,
      x: number,
      y: number,
      c1: string,
      c2: string,
      c3: string,
    ): void {
      const gx = x / TILE;
      const gy = y / TILE;
      atoms.drawAtom(ctx, type, gx, gy, c1, c2, c3);
    }

    // Make assigner among active petal atoms (exclude background atom)
    function makeAssigner(
      mode: AtomMode,
      activeAtoms: AtomType[],
    ): (rCell: number, theta?: number, sectorIdx?: number) => AtomType {
      if (mode === "bands-ABC")
        return (rCell: number) => activeAtoms[rCell % 3];
      if (mode === "angle-stripes")
        return (_rCell: number, _theta?: number, sectorIdx?: number) =>
          activeAtoms[(sectorIdx || 0) % activeAtoms.length];
      if (mode === "parity-ACB")
        return (rCell: number) => activeAtoms[rCell % 2 ? 1 : 0];
      if (mode === "balanced-rand")
        return (rCell: number, theta?: number, sectorIdx?: number) => {
          const v =
            (Math.sin(
              (theta || 0) * 13.37 + rCell * 2.17 + (sectorIdx || 0) * 0.73,
            ) +
              1) /
            2;
          if (v < 0.33) return activeAtoms[0];
          if (v < 0.66) return activeAtoms[1];
          return activeAtoms[2];
        };
      return (rCell: number) => activeAtoms[rCell % 3];
    }

    function generateFlower(
      ctx: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      key: string,
      grid: number = DEFAULT_GRID,
    ): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const rng = makeRNG(key);

      const picked = PALETTE.slice().sort(() => rng() - 0.5);
      const [c1, c2, c3] = picked.slice(0, 3);

      const allAtoms: AtomType[] = ["A", "B", "C", "D"];
      const bgAtom: AtomType = pick(rng, allAtoms);
      const petalAtoms: AtomType[] = allAtoms
        .filter(a => a !== bgAtom)
        .sort(() => rng() - 0.5);

      const cx = Math.floor(grid / 2),
        cy = Math.floor(grid / 2);
      const maxR = Math.min(cx, cy);
      const petals = pick(rng, [5, 6, 7, 8, 9, 10]);
      const petalDepth = Math.max(5, Math.floor(maxR * (0.6 + 0.35 * rng())));
      const radialThickness = pick(rng, [1, 2, 2, 3, 3]);
      const shapeModel: ShapeModel = pick(rng, [
        "rose",
        "starburst",
        "ringed",
        "tip",
        "notched",
        "hollow",
      ]);
      const atomMode: AtomMode = pick(rng, [
        "bands-ABC",
        "angle-stripes",
        "parity-ACB",
        "balanced-rand",
      ]);
      const assignAtom = makeAssigner(atomMode, petalAtoms);

      // Angle tolerances
      const angleTolNear =
        USER_CONFIG.TOLERANCE.ANGLE_NEAR_BASE *
        (USER_CONFIG.TOLERANCE.NEAR_RANGE.MIN +
          rng() *
            (USER_CONFIG.TOLERANCE.NEAR_RANGE.MAX -
              USER_CONFIG.TOLERANCE.NEAR_RANGE.MIN));
      const angleTolFar =
        USER_CONFIG.TOLERANCE.ANGLE_FAR_BASE *
        (USER_CONFIG.TOLERANCE.FAR_RANGE.MIN +
          rng() *
            (USER_CONFIG.TOLERANCE.FAR_RANGE.MAX -
              USER_CONFIG.TOLERANCE.FAR_RANGE.MIN));
      const softness =
        USER_CONFIG.SOFTNESS.MIN +
        rng() * (USER_CONFIG.SOFTNESS.MAX - USER_CONFIG.SOFTNESS.MIN);
      const ringPhase =
        USER_CONFIG.RING_PHASE.MIN +
        rng() * (USER_CONFIG.RING_PHASE.MAX - USER_CONFIG.RING_PHASE.MIN);

      // Sector gating mask (~70% sectors on), ensures bold shapes
      const sectorMask = Array.from({ length: petals }, () => rng() > 0.3);
      if (sectorMask.every(v => !v)) sectorMask[Math.floor(petals / 2)] = true;

      const drawBgAtom = (gx: number, gy: number) => {
        drawAt(
          (x: number, y: number) =>
            drawAtomByType(ctx, bgAtom, x, y, c1, c2, c3),
          gx,
          gy,
        );
      };

      // 0) Base pass: paint every tile once with background atom to avoid gaps
      function renderBasePass() {
        for (let gy = 0; gy < grid; gy++) {
          for (let gx = 0; gx < grid; gx++) {
            drawBgAtom(gx, gy);
          }
        }
      }

      // 1) Outer edge circumference (1–2 tiles thick) reinforced in background atom
      function renderEdgeReinforcement() {
        const edgeThickness = pick(rng, [1, 1, 2]);
        for (let t = 0; t < edgeThickness; t++) {
          for (let i = 0; i < grid; i++) {
            drawBgAtom(i, t);
            drawBgAtom(i, grid - 1 - t);
            drawBgAtom(t, i);
            drawBgAtom(grid - 1 - t, i);
          }
        }
      }

      // 2) Background atom structural accents inside (deterministic)
      //    - mid ring (optional) and a few gated spokes to help define silhouette
      function renderStructuralAccents() {
        // Mid ring
        if (rng() < 0.7) {
          const midR = Math.floor(petalDepth * (0.5 + 0.2 * rng()));
          for (let i = 0; i < grid; i++) {
            const coords: [number, number][] = [
              [cx - midR, i],
              [cx + midR, i],
              [i, cy - midR],
              [i, cy + midR],
            ];
            coords.forEach(([gx, gy]) => {
              if (gx >= 0 && gy >= 0 && gx < grid && gy < grid) {
                drawQuad(
                  (x: number, y: number) =>
                    drawAtomByType(ctx, bgAtom, x, y, c1, c2, c3),
                  gx,
                  gy,
                  grid,
                );
              }
            });
          }
        }

        // Gated spokes
        if (rng() < 0.6) {
          const gateEvery = pick(rng, [2, 3, 4]);
          for (let s = 0; s < petals; s++) {
            if (s % gateEvery !== 0) continue;
            const theta = s * ((2 * Math.PI) / petals);
            for (let r = 1; r <= petalDepth; r++) {
              const gx = Math.round(cx + r * Math.cos(theta));
              const gy = Math.round(cy + r * Math.sin(theta));
              if (gx >= 0 && gy >= 0 && gx < grid && gy < grid) {
                drawQuad(
                  (x: number, y: number) =>
                    drawAtomByType(ctx, bgAtom, x, y, c1, c2, c3),
                  gx,
                  gy,
                  grid,
                );
              }
            }
          }
        }
      }

      // 3) Strong center cluster (guarantee coverage; seed form)
      function renderCenterCluster() {
        const centerCluster: [number, number, AtomType][] = [
          [0, 0, "D"],
          [0, -1, petalAtoms[0]],
          [1, 0, petalAtoms[1]],
          [0, 1, petalAtoms[2]],
          [-1, 0, petalAtoms[0]],
        ];
        centerCluster.forEach(([dx, dy, t]: [number, number, AtomType]) => {
          const gx = cx + dx,
            gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) return;
          drawQuad(
            (x: number, y: number) => drawAtomByType(ctx, t, x, y, c1, c2, c3),
            gx,
            gy,
            grid,
          );
        });
      }

      // 4) Petals (TL quadrant → mirror)
      function renderPetals() {
        const half = Math.ceil(grid / 2);
        for (let gy = 0; gy < half; gy++) {
          for (let gx = 0; gx < half; gx++) {
            const { r, a } = polarFromCell(gx, gy, cx, cy);
            const rCell = Math.floor(r);
            if (rCell === 0 || rCell > petalDepth) continue;

            const t = rCell / petalDepth;
            const tol = angleTolNear * (1 - t) + angleTolFar * t;

            const sectorIdx = Math.floor(a / ((2 * Math.PI) / petals));
            if (!sectorGate(a, petals, sectorMask)) continue;

            let inside: boolean;
            if (shapeModel === "rose") inside = shapeRose(a, petals, tol);
            else if (shapeModel === "starburst")
              inside = shapeStarburst(a, petals, softness);
            else if (shapeModel === "ringed")
              inside = shapeRinged(a, petals, ringPhase, tol * 0.7);
            else if (shapeModel === "tip") inside = shapeTip(a, petals, tol, t);
            else if (shapeModel === "notched")
              inside = shapeNotched(a, petals, tol, 0.24);
            else inside = shapeHollow(a, petals, tol, t, 0.28, 0.92);

            if (!inside) continue;

            const type = assignAtom(rCell, a, sectorIdx);

            // Draw with radial thickness and 4-way mirroring
            for (let dr = 0; dr < radialThickness; dr++) {
              const x1 = gx + dr,
                y1 = gy + dr;
              const coords: [number, number][] = [
                [x1, y1],
                [grid - 1 - x1, y1],
                [x1, grid - 1 - y1],
                [grid - 1 - x1, grid - 1 - y1],
              ];
              coords.forEach(([ix, iy]: [number, number]) => {
                if (ix < 0 || iy < 0 || ix >= grid || iy >= grid) return;
                drawAt(
                  (x: number, y: number) =>
                    drawAtomByType(ctx, type, x, y, c1, c2, c3),
                  ix,
                  iy,
                );
              });
            }
          }
        }
      }

      // 5) Ensure all three petal atoms appear at least once
      function renderAccents() {
        const accents: [number, number, AtomType][] = [
          [cx, cy - 2, petalAtoms[0]],
          [cx + 1, cy, petalAtoms[1]],
          [cx, cy + 2, petalAtoms[2]],
        ];
        accents.forEach(([gx, gy, t]: [number, number, AtomType]) => {
          if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) return;
          drawQuad(
            (x: number, y: number) => drawAtomByType(ctx, t, x, y, c1, c2, c3),
            gx,
            gy,
            grid,
          );
        });
      }

      // 6) Final safety: ensure center 6×6 px is covered via 2×2 cluster
      function renderFinalCluster() {
        const cluster: [number, number, AtomType][] = [
          [0, 0, "D"],
          [1, 0, petalAtoms[1]],
          [0, 1, petalAtoms[2]],
          [1, 1, petalAtoms[0]],
        ];
        cluster.forEach(([dx, dy, t]: [number, number, AtomType]) => {
          const gx = cx + dx,
            gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) return;
          drawQuad(
            (x: number, y: number) => drawAtomByType(ctx, t, x, y, c1, c2, c3),
            gx,
            gy,
            grid,
          );
        });
      }

      renderBasePass();
      renderEdgeReinforcement();
      renderStructuralAccents();
      renderCenterCluster();
      renderPetals();
      renderAccents();
      renderFinalCluster();
    }

    function drawFlowerForKey(
      key: string,
      grid: number = DEFAULT_GRID,
    ): string {
      const canvasPx = grid * TILE;

      const { canvas, ctx } = createOffscreenCanvas(
        canvasPx,
        canvasPx,
        USER_CONFIG.PIXEL_DENSITY,
      );

      generateFlower(ctx, canvas, key, grid);

      return canvas.toDataURL();
    }

    return drawFlowerForKey(key, DEFAULT_GRID);
  }
}
