import type { Author, BaseUrl, Repo } from "@http-client";

import md5 from "md5";
import bs58 from "bs58";
import twemojiModule from "twemoji";

export const REFS_HEADS = "refs/heads/";

// Reads the repository's default branch. Heartwood no longer requires the
// project payload, so this is the single place to change once the API stops
// carrying the default branch there.
export function defaultBranch(repo: Repo): string {
  return repo.payloads["xyz.radicle.project"].data.defaultBranch;
}

// Counts the releases a user can browse: the two unredacted buckets, or the
// single count older nodes report in place of the buckets. Undefined means the
// node doesn't report releases at all, which is how the release API is
// detected.
export function visibleReleaseCount(repo: Repo): number | undefined {
  const releases = repo.payloads["xyz.radicle.project"].meta.releases;
  if (releases === undefined) {
    return undefined;
  }
  return typeof releases === "number"
    ? releases
    : releases.delegate + releases.other;
}

export function unqualifyBranch(refname: string): string {
  return refname.startsWith(REFS_HEADS)
    ? refname.slice(REFS_HEADS.length)
    : refname;
}

export async function toClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function formatInlineTitle(input: string): string {
  return input.replaceAll(/`([^`]+)`/g, "<code>$1</code>");
}

export function parseNodeId(
  nid: string,
): { prefix: string; pubkey: string } | undefined {
  const match = /^(did:key:)?(z[a-zA-Z0-9]+)$/.exec(nid);
  if (match) {
    let hex: Uint8Array;
    try {
      hex = bs58.decode(match[2].substring(1));
    } catch (error) {
      console.error("utils.parseNodId: Not able to decode received NID", error);
      return undefined;
    }
    // This checks also that the first 2 bytes are equal
    // to the ed25519 public key type used.
    if (hex && !(hex.byteLength === 34 && hex[0] === 0xed && hex[1] === 1)) {
      return undefined;
    }

    return { prefix: match[1] || "did:key:", pubkey: match[2] };
  }

  return undefined;
}

export function parseRepositoryId(
  rid: string,
): { prefix: string; pubkey: string } | undefined {
  const match = /^(rad:)?(z[a-zA-Z0-9]+)$/.exec(rid);
  if (match) {
    const hex = bs58.decode(match[2].substring(1));
    if (hex.byteLength !== 20) {
      return undefined;
    }

    return { prefix: match[1] || "rad:", pubkey: match[2] };
  }

  return undefined;
}

export function formatNodeId(id: string): string {
  const parsedId = parseNodeId(id);

  if (parsedId) {
    return `${parsedId.prefix}${truncateId(parsedId.pubkey)}`;
  }

  return id;
}

export function formatRepositoryId(id: string): string {
  const parsedId = parseRepositoryId(id);

  if (parsedId) {
    return `${parsedId.prefix}${truncateId(parsedId.pubkey)}`;
  }

  return id;
}

export function truncateId(pubkey: string): string {
  return `${pubkey.substring(0, 6)}…${pubkey.slice(-6)}`;
}

// The URL path segment to use for a repo: its configured alias when the node
// advertises one, otherwise the canonical RID. Keeps alias-based URLs sticky
// across in-app navigation, since the backend resolves either form.
export function repoSegment(repo: {
  rid: string;
  alias?: string | undefined;
}): string {
  return repo.alias ?? repo.rid;
}

export function formatCommit(oid: string): string {
  return oid.substring(0, 7);
}

export function formatEditedCaption(author: Author, timestamp: number) {
  return `${
    author.alias ? author.alias : formatNodeId(author.id)
  } edited ${absoluteTimestamp(timestamp)}`;
}

export function formatDid({
  prefix,
  pubkey,
}: {
  prefix: string;
  pubkey: string;
}): string {
  return `${prefix}${pubkey}`;
}

export function baseUrlToString(baseUrl: BaseUrl): string {
  return `${baseUrl.scheme}://${baseUrl.hostname}:${baseUrl.port}`;
}

// Takes a path, eg. "../images/image.png", and a base from where to start
// resolving, e.g. "static/images/index.html". Returns the resolved path.
export function canonicalize(
  path: string,
  base: string,
  origin = document.location.origin,
): string {
  let finalPath: string | undefined;
  if (path.startsWith("/")) {
    finalPath = new URL(path, origin).pathname;
  } else {
    finalPath = base
      .split("/")
      .slice(0, -1) // Remove file name.
      .concat([path]) // Add image file path.
      .join("/");
  }

  // URL is used to resolve relative paths, eg. `../../assets/image.png`.
  const url = new URL(finalPath, origin);
  const pathname = url.pathname.replace(/^\//, "");

  return pathname;
}

export function absoluteTimestamp(time: number | undefined) {
  return time ? new Date(time * 1000).toString() : undefined;
}

export const formatTimestamp = (
  timestamp: number,
  current = new Date().getTime(),
): string => {
  const units: Record<string, number> = {
    year: 24 * 60 * 60 * 1000 * 365,
    month: (24 * 60 * 60 * 1000 * 365) / 12,
    day: 24 * 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    minute: 60 * 1000,
    second: 1000,
  };

  // Multiplying timestamp with 1000 to convert from seconds to milliseconds
  timestamp = timestamp * 1000;
  const rtf = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
    style: "long",
  });
  const elapsed = current - timestamp;

  if (elapsed > units["year"]) {
    return "more than a year ago";
  } else if (elapsed < 0) {
    return "now"; // If elapsed is a negative number we are dealing with an item from the future, and we return "now"
  }

  for (const u in units) {
    if (elapsed > units[u] || u === "second") {
      // We convert the division result to a negative number to get "XX [unit] ago"
      return rtf.format(
        Math.round(elapsed / units[u]) * -1,
        u as Intl.RelativeTimeFormatUnit,
      );
    }
  }

  return new Date(timestamp).toUTCString();
};

// Check whether the input is a URL.
export function isUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}

// Rewrite GitHub "blob" image URLs so they resolve to the raw image content.
// A URL like https://github.com/<owner>/<repo>/blob/<ref>/<path> serves an
// HTML page rather than the image bytes, so appending `?raw=true` makes GitHub
// redirect to the raw content. URLs already pointing at the raw content (either
// via `?raw=true` or raw.githubusercontent.com) are returned unchanged.
export function canonicalizeGithubImageUrl(input: string): string {
  let url;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  if (
    (url.hostname === "github.com" || url.hostname === "www.github.com") &&
    /^\/[^/]+\/[^/]+\/blob\//.test(url.pathname) &&
    url.searchParams.get("raw") !== "true"
  ) {
    url.searchParams.set("raw", "true");
    return url.toString();
  }
  return input;
}

export function isCommit(input: string): boolean {
  return /^[a-f0-9]{40}$/.test(input);
}

// Check whether the given path has a valid image file extension.
export function isImagePath(input: string): boolean {
  return /\.(jpg|jpeg|png|gif|bmp)$/i.test(input);
}

// Check whether the given path has a valid svg file extension.
export function isSvgPath(input: string): boolean {
  return /\.svg$/i.test(input);
}

// Get amount of days passed between two dates without including the end date
export function getDaysPassed(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function scrollIntoView(id: string, options?: ScrollIntoViewOptions) {
  const lineElement = document.getElementById(id);
  if (lineElement) lineElement.scrollIntoView(options);
}

// Check whether the given path has a markdown file extension.
export function isMarkdownPath(path: string): boolean {
  return /\.(md|mkd|markdown)$/i.test(path);
}

export function isLocal(addr: string): boolean {
  try {
    const url = new URL(`scheme://${addr}`);
    const hostname = url.hostname;

    return (
      hostname === "[::1]" ||
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

// Check whether the given domain name is an onion domain name.
export function isOnion(addr: string): boolean {
  return addr.endsWith(".onion");
}

export function safeHttpUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return undefined;
}

// Get the gravatar URL of an email.
export function gravatarURL(email: string): string {
  const address = email.trim().toLowerCase();
  const hash = md5(address);

  return `https://www.gravatar.com/avatar/${hash}`;
}

export const unreachable = (value: never): never => {
  throw new Error(`Unreachable code: ${value}`);
};

export function twemoji(
  node: HTMLElement,
  { exclude }: { exclude: string[] } = { exclude: [] },
) {
  twemojiModule.parse(node, {
    callback: (icon, options) => {
      const { base, size, ext } = options as Record<string, string>;
      if (!exclude.includes(icon)) {
        return `${base}${size}/${icon}${ext}`;
      }
      return false;
    },
    base: "/",
    folder: "twemoji",
    ext: ".svg",
    className: "txt-emoji",
  });
}

// Formats COBs Object Ids
export function formatObjectId(id: string): string {
  return id.substring(0, 7);
}

// Percent-decoding throws on a stray `%`, which branch names, tags and repo
// aliases are all free to contain, so a segment that is not a well-formed
// encoding is returned untouched rather than taking down whatever renders it.
export function safeDecodeURIComponent(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function formatQualifiedRefname(
  refname: string,
  peer: string | undefined,
): string {
  return peer ? `refs/namespaces/${peer}/refs/heads/${refname}` : refname;
}

export function getBranchesFromRefs(
  refs: Record<string, string>,
): Record<string, string> {
  const branches: Record<string, string> = {};
  for (const [name, oid] of Object.entries(refs)) {
    if (name.startsWith(REFS_HEADS)) {
      branches[name.slice(REFS_HEADS.length)] = oid;
    }
  }
  return branches;
}

export function getTagsFromRefs(
  refs: Record<string, string>,
): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [name, oid] of Object.entries(refs)) {
    if (name.startsWith("refs/tags/")) {
      tags[name.slice("refs/tags/".length)] = oid;
    }
  }
  return tags;
}
