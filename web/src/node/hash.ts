// Deterministic ids for the simulated node. Seeds always produce the same
// object ids, so URLs to seeded commits, issues and patches stay stable
// across reloads.

function cyrb(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

// A 40-character hex id, shaped like a git object id.
export function oid(...parts: (string | number | undefined)[]): string {
  const input = parts.map(p => String(p ?? "")).join("\u0000");
  let out = "";
  for (let i = 0; out.length < 40; i++) {
    out += cyrb(input, i).toString(16).padStart(14, "0");
  }
  return out.slice(0, 40);
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// A base58 string of the given length, derived from the input.
export function base58(input: string, length: number): string {
  let out = "";
  for (let i = 0; out.length < length; i++) {
    let n = cyrb(input, 1000 + i);
    for (let j = 0; j < 8 && out.length < length; j++) {
      out += BASE58[n % 58];
      n = Math.floor(n / 58);
    }
  }
  return out;
}

// A fake but well-formed node id (the `z6Mk…` part of a did:key).
export function nidFor(seed: string): string {
  return `z6Mk${base58(`nid:${seed}`, 44)}`;
}

export function ridFor(seed: string): string {
  return `rad:z${base58(`rid:${seed}`, 28)}`;
}

// A pseudo-random generator for anything that should look random but be
// reproducible, like simulated network traffic.
export function rng(seed: string): () => number {
  let state = cyrb(seed, 7) % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
