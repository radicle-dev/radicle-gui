import type { Author } from "@bindings/cob/Author";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Patch } from "@bindings/cob/patch/Patch";
import type { Review } from "@bindings/cob/patch/Review";
import type { Config } from "@bindings/config/Config";
import type { Commit } from "@bindings/repo/Commit";
import type { RepoInfo } from "@bindings/repo/RepoInfo";
import type { ComponentProps } from "svelte";

import escape from "lodash/escape.js";
import md5 from "md5";
import twemojiModule from "twemoji";

import type { RadReference } from "@app/lib/radUri";
import { explorerUrl, isNodeId, isRepoId } from "@app/lib/radUri";

import NodeId from "@app/components/NodeId.svelte";

export const unreachable = (value: never): never => {
  throw new Error(`Unreachable code: ${value}`);
};

export const REFS_HEADS = "refs/heads/";

// The single place to change once the API stops carrying the default branch
// in the project payload, which Heartwood no longer requires.
export function defaultBranch(repo: RepoInfo): string | undefined {
  return repo.payloads["xyz.radicle.project"]?.data.defaultBranch;
}

export function unqualifyBranch(refname: string): string {
  return refname.startsWith(REFS_HEADS)
    ? refname.slice(REFS_HEADS.length)
    : refname;
}

export function formatRepositoryId(id: string): string {
  const parsedId = parseRepositoryId(id);

  if (parsedId) {
    return `${parsedId.prefix}${truncateId(parsedId.pubkey)}`;
  }

  return id;
}

export function parseRepositoryId(
  rid: string,
): { prefix: string; pubkey: string } | undefined {
  const pubkey = rid.replace(/^rad:/, "");
  if (!isRepoId(pubkey)) return undefined;

  return { prefix: "rad:", pubkey };
}

export function truncateId(pubkey: string): string {
  return `${pubkey.substring(0, 6)}…${pubkey.slice(-6)}`;
}

export function truncateDid(did: string): string {
  return `did:key:${truncateId(publicKeyFromDid(did))}`;
}

export function didFromPublicKey(publicKey: string) {
  return `did:key:${publicKey}`;
}

export function publicKeyFromDid(did: string) {
  return did.replace("did:key:", "");
}

export function formatOid(id: string): string {
  return id.substring(0, 7);
}

export const formatTimestamp = (
  timestamp: number,
  current = new Date().getTime(),
): string => {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const MONTH = (365 * DAY) / 12;
  const YEAR = 365 * DAY;

  const elapsed = current - timestamp;
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < MONTH) return `${Math.floor(elapsed / DAY)}d`;
  if (elapsed < YEAR) return `${Math.floor(elapsed / MONTH)}mo`;
  return `${Math.floor(elapsed / YEAR)}y`;
};

// Svelte action that swallows mousedown so the activating element does not
// steal focus from whatever is currently focused. Useful for click targets
// that should not collapse a focused input.
//
// Usage: <div use:preserveFocus>...</div>
export function preserveFocus(node: HTMLElement) {
  const handler = (e: MouseEvent) => e.preventDefault();
  node.addEventListener("mousedown", handler);
  return {
    destroy() {
      node.removeEventListener("mousedown", handler);
    },
  };
}

// Svelte action for replacing emojis within an element with Twemoji SVGs.
// This action is non-reactive; it only runs when the element is mounted.
//
// Usage: <span use:twemoji>👍</span>
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
    className: `txt-emoji`,
  });
}

// Converts a single emoji character to an <img> tag using Twemoji SVG assets.
// This function is useful in reactive contexts where Svelte actions won't
// re-run automatically.
//
// Usage: <span>{@html emojiToTwemoji("👍")}</span>
export function emojiToTwemoji(emoji: string, exclude?: string[]) {
  const filename = emoji.codePointAt(0)?.toString(16);
  if (!filename || exclude?.includes(filename)) {
    return "";
  }
  return `<img alt="${escape(emoji)}" src="/twemoji/${filename}.svg" class="txt-emoji">`;
}

export function scrollIntoView(id: string, options?: ScrollIntoViewOptions) {
  const lineElement = document.getElementById(id);
  if (lineElement) {
    lineElement.scrollIntoView(options);
  }
}

export const issueStatusColor: Record<Issue["state"]["status"], string> = {
  open: "var(--color-text-open)",
  closed: "var(--color-text-closed)",
};

export const issueStatusBackgroundColor: Record<
  Issue["state"]["status"],
  string
> = {
  open: "var(--color-surface-open)",
  closed: "var(--color-surface-closed)",
};

export const issueStatusIcon = {
  open: "issue",
  closed: "issue-closed",
} as const satisfies Record<Issue["state"]["status"], string>;

export const issueStatusLabel: Record<Issue["state"]["status"], string> = {
  open: "Open Issues",
  closed: "Closed Issues",
};

export const patchStatusColor: Record<Patch["state"]["status"], string> = {
  draft: "var(--color-text-draft)",
  open: "var(--color-text-open)",
  archived: "var(--color-text-archived)",
  merged: "var(--color-text-merged)",
};

export const patchStatusBackgroundColor: Record<
  Patch["state"]["status"],
  string
> = {
  draft: "var(--color-surface-draft)",
  open: "var(--color-surface-open)",
  archived: "var(--color-surface-archived)",
  merged: "var(--color-surface-merged)",
};

export const patchStatusLabel: Record<Patch["state"]["status"], string> = {
  draft: "Draft Patches",
  open: "Open Patches",
  archived: "Archived Patches",
  merged: "Merged Patches",
};

export function authorForNodeId(author: Author): ComponentProps<typeof NodeId> {
  return { publicKey: publicKeyFromDid(author.did), alias: author.alias };
}

export function absoluteTimestamp(timestamp: number) {
  return new Date(Number(timestamp)).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatEditedCaption(author: Author, timestamp: number) {
  return `${author.alias ? author.alias : truncateDid(author.did)} edited ${absoluteTimestamp(timestamp)}`;
}

export function formatResolvedCaption(author: Author, timestamp: number) {
  return `${author.alias ? author.alias : truncateDid(author.did)} resolved this ${absoluteTimestamp(timestamp)}`;
}

export function pluralize(singular: string, count: number): string {
  if (count === 1) return singular;
  if (/(?:ch|sh|s|x|z)$/i.test(singular)) {
    return `${singular}es`;
  }
  return `${singular}s`;
}

export function isMac() {
  if (
    (navigator.platform && navigator.platform.includes("Mac")) ||
    navigator.userAgent.includes("OS X")
  ) {
    return true;
  } else {
    return false;
  }
}

export function modifierKey() {
  return isMac() ? "⌘" : "ctrl";
}

export function parseNodeId(
  nid: string,
): { prefix: string; pubkey: string } | undefined {
  const pubkey = nid.replace(/^did:key:/, "");
  if (!isNodeId(pubkey)) return undefined;

  return { prefix: "did:key:", pubkey };
}

// Get the gravatar URL of an email.
export function gravatarURL(email: string): string {
  const address = email.trim().toLowerCase();
  const hash = md5(address);

  return `https://www.gravatar.com/avatar/${hash}`;
}

export function verdictIcon(verdict: Review["verdict"]) {
  if (verdict === "accept") {
    return "thumbs-up";
  } else if (verdict === "reject") {
    return "stop";
  } else {
    return "comment";
  }
}

// `revisions_by_patch` returns revisions in the patch's timeline order — the
// causal order the COB recorded them in — and that order is what "revision N of
// M" means throughout the UI. Do not re-sort by `timestamp` to recover it: a
// revision's timestamp is supplied by whoever authored it, so a peer with a
// skewed clock would silently renumber everyone's revisions.
export function revisionPosition(
  revisions: { id: string }[],
  revisionId: string,
): number | undefined {
  const index = revisions.findIndex(r => r.id === revisionId);
  return index === -1 ? undefined : index + 1;
}

// A review without a verdict is a comment-only review — what `rad patch review`
// produces with neither -a nor -r. The protocol has no "needs changes" or
// "request changes" state, so neither label may imply one: doing so would put
// words into the mouth of every reviewer who ever left a plain comment.
export function verdictAction(verdict: Review["verdict"]): string {
  if (verdict === "accept") {
    return "Accept";
  } else if (verdict === "reject") {
    return "Reject";
  } else {
    return "Comment";
  }
}

// The protocol rejects a verdict-less review with no summary (EmptyReview),
// so a comment-only review requires summary text; accept/reject don't.
export function isPublishableReview(
  verdict: Review["verdict"],
  summary: string,
): boolean {
  return verdict !== undefined || summary.trim() !== "";
}

export function verdictBadge(verdict: Review["verdict"]): {
  label: string;
  variant: "accept" | "reject" | "comment";
} {
  if (verdict === "accept") {
    return { label: "Accepted", variant: "accept" };
  } else if (verdict === "reject") {
    return { label: "Rejected", variant: "reject" };
  } else {
    return { label: "Reviewed", variant: "comment" };
  }
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

// Seed to fall back to when `config.preferredSeeds` is empty.
const DEFAULT_SEED = "rosa.radicle.network";

// The host of the first entry in `config.preferredSeeds`, if any, parsed from
// its "<NID>@<host>:<port>" address form. Used to pick a seed that's actually
// known to replicate the user's repos, instead of a hardcoded default.
function preferredSeedHost(config: Config): string | undefined {
  const address = config.preferredSeeds[0];
  if (!address) {
    return undefined;
  }
  return address.split("@")[1]?.split(":")[0] ?? address;
}

// The hostname of the configured public explorer, e.g. "radicle.network".
// Used to label links with the site they actually open.
export function explorerHost(config: Config): string {
  try {
    return new URL(config.publicExplorer).host;
  } catch {
    return config.publicExplorer;
  }
}

export function explorerLink(
  reference: RadReference,
  config: Config,
): string | undefined {
  return explorerUrl(reference, explorerBase(config), explorerSeed(config));
}

function explorerBase(config: Config): string {
  const nodes = config.publicExplorer.indexOf("/nodes/$host");
  if (nodes !== -1) return config.publicExplorer.slice(0, nodes);
  try {
    return new URL(config.publicExplorer).origin;
  } catch {
    return config.publicExplorer;
  }
}

function explorerSeed(config: Config): string {
  return preferredSeedHost(config) ?? DEFAULT_SEED;
}

export interface GitIdentity {
  name: string;
  email: string;
}

// Two git identities are the same person when they share an address, compared
// case-insensitively the way `gravatarURL` normalises it. An identity may carry
// no address at all, so those fall back to the name rather than collapsing into
// each other.
export function identityKey(who: GitIdentity): string {
  const email = who.email.trim().toLowerCase();
  return email ? `email:${email}` : `name:${who.name.trim().toLowerCase()}`;
}

// A commit carries an author date and a commit date, which come apart on a
// rebase or an amend. Views show the commit date, so the tooltip only names the
// two apart when there is something to tell apart.
export function commitTimes(commit: Commit): string {
  const committed = absoluteTimestamp(commit.committer.time * 1000);
  if (commit.author.time === commit.committer.time) {
    return committed;
  }

  return [
    `Authored — ${absoluteTimestamp(commit.author.time * 1000)}`,
    `Committed — ${committed}`,
  ].join("\n");
}

// Extract `Co-authored-by:` trailers from a commit message.
//
// Git only treats the final paragraph of a message as trailers, so a line
// appearing anywhere earlier — quoted in prose, or in a nested patch — is not
// one and is ignored here too. Matching is case-insensitive because git's own
// trailer handling is. The name may be empty, since a git identity only
// requires an address.
export function coAuthors(message: string): GitIdentity[] {
  const paragraphs = message.trimEnd().split(/(?:\r?\n){2,}/);
  const trailers = paragraphs[paragraphs.length - 1] ?? "";
  const authors: GitIdentity[] = [];

  for (const line of trailers.split("\n")) {
    const match = /^co-authored-by:\s*(.*?)\s*<([^<>\s]+)>$/i.exec(line.trim());
    if (match) {
      authors.push({ name: match[1], email: match[2] });
    }
  }

  return authors;
}

// The identity as it appears in a commit trailer, so that a copied result can
// be pasted straight into `Co-authored-by:` and the like.
export function formatGitIdentity(who: GitIdentity): string {
  return who.name ? `${who.name} <${who.email}>` : who.email;
}

// Co-authors are not part of the commit's git identity fields; they are a
// convention carried in the message trailers. The same person can be
// trailered more than once, and squashing gathers several messages' trailers
// into one, so only the first mention of each is kept.
export function creditedCoAuthors(commit: {
  author: GitIdentity;
  committer: GitIdentity;
  message: string;
}): GitIdentity[] {
  const credited = new Set([
    identityKey(commit.author),
    identityKey(commit.committer),
  ]);
  return coAuthors(commit.message).filter(who => {
    const key = identityKey(who);
    if (credited.has(key)) return false;
    credited.add(key);
    return true;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  return `${Math.floor(seconds / 86400)}d`;
}

// CIDs in a release share a long prefix, so the head grows until each label is
// distinct.
export function shortenCids(
  cids: string[],
  minHead = 7,
  tailLength = 6,
  maxHead = 16,
): Map<string, string> {
  const display = new Map<string, string>();
  const unique = [...new Set(cids)];
  if (unique.length === 0) {
    return display;
  }

  let head = minHead;
  while (
    head < maxHead &&
    new Set(unique.map(cid => cid.slice(0, head))).size < unique.length
  ) {
    head += 1;
  }

  for (const cid of unique) {
    display.set(
      cid,
      head + tailLength >= cid.length
        ? cid
        : `${cid.slice(0, head)}…${cid.slice(-tailLength)}`,
    );
  }

  return display;
}
