import bs58 from "bs58";

import { nidFor } from "./hash";

export interface LocalIdentity {
  alias: string;
  name: string;
  nid: string;
  did: string;
  createdAt: number;
  // The device this key lives on, as the user would recognise it.
  device: string;
  recoverySaved: boolean;
}

const MULTICODEC_ED25519_PUB = [0xed, 0x01];

// Creates a real Ed25519 keypair in the browser and derives the node id the
// way Radicle does: multicodec-prefixed public key, base58btc, `z` prefix.
// The private key stays non-extractable in this tab; the prototype only needs
// the public half to show a real DID.
export async function generateNid(): Promise<string> {
  try {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    );
    const bytes = new Uint8Array([...MULTICODEC_ED25519_PUB, ...raw]);
    return `z${bs58.encode(bytes)}`;
  } catch {
    // Browsers without Ed25519 in WebCrypto get a random stand-in.
    return nidFor(crypto.randomUUID());
  }
}

export function describeDevice(): string {
  const ua = navigator.userAgent;
  const browser = /Firefox\//.test(ua)
    ? "Firefox"
    : /Edg\//.test(ua)
      ? "Edge"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

const WORDS = [
  "amber", "anchor", "aspen", "basin", "birch", "bloom", "brook", "cedar",
  "cinder", "clover", "comet", "coral", "crane", "delta", "dune", "ember",
  "fable", "fern", "fjord", "flint", "glade", "grove", "harbor", "hazel",
  "heron", "island", "juniper", "kelp", "lagoon", "lantern", "linen", "lumen",
  "maple", "marsh", "meadow", "mesa", "moss", "nectar", "nimbus", "oak",
  "orbit", "otter", "pebble", "pine", "plume", "prairie", "quartz", "quill",
  "raven", "reef", "ridge", "river", "saffron", "sage", "shore", "slate",
  "sparrow", "spruce", "summit", "tide", "timber", "tundra", "willow", "zephyr",
];

export function recoveryPhrase(): string[] {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map(b => WORDS[b % WORDS.length]);
}
