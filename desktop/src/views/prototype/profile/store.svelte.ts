import { SvelteMap } from "svelte/reactivity";

import { formatTimestamp } from "@app/lib/utils";

// Dummy state for the Profiles prototype, modelled on RIP "Actor
// Repositories". Nothing here talks to the backend: every mutation is local
// and thrown away on reload, so the flows can be clicked through before any of
// it exists.

// Where the spec puts the profile, shown in the UI so the storage model is
// visible rather than implied.
export const PROFILE_PATH = ".radicle/profile.json";

// The profile schema version, written into every profile. Versioned
// separately from the identity payload, because a profile change is one
// controller's branch commit rather than an identity revision.
export const PROFILE_VERSION = 1;
export const README_PATH = ".radicle/profile/README.md";

// profile.json field limits, verbatim from the schema.
export const LIMITS = {
  displayName: 255,
  fullName: 255,
  pronouns: 255,
  bio: 255,
  location: 255,
  timezone: 255,
  avatar: 255,
  banner: 255,
  linkUrl: 255,
  linkLabel: 64,
  links: 16,
  keys: 255,
} as const;

export interface ProfileLink {
  id: string;
  url: string;
  label: string;
}

// `.radicle/profile.json`. Only `version` and `displayName` are required;
// everything else is optional, and all of it is public and permanent once
// published. Whether the actor is a person, an agent or an org is read from
// the identity payload's `type`, never from here.
export interface Profile {
  version: number;
  displayName: string;
  fullName: string;
  pronouns: string;
  bio: string;
  location: string;
  timezone: string;
  avatar: string;
  banner: string;
  links: ProfileLink[];
  // `.radicle/profile/README.md`, the long-form description.
  readme: string;
}

// A key is a controller, a bound key, or both. The two roles are independent:
// controllers govern the identity, bound keys act as the actor.
export interface ActorKey {
  id: string;
  // Local to the machine that holds the key, and not part of the profile.
  alias: string;
  // A delegate of the actor repository: votes on identity changes.
  controller: boolean;
  // Present in the `keys` map with a valid consent statement: attributed to
  // the actor.
  bound: boolean;
  addedAt: number;
  // Absent for an offline recovery key, which never runs on a node.
  lastSeen: number | undefined;
  thisKey: boolean;
}

// Both roles are the default, so a key that has them needs no label at all.
// Only the two exceptions are worth calling out.
export function keyRole(key: ActorKey): string | undefined {
  if (key.bound && key.controller) return undefined;
  if (key.controller) return "Recovery key";
  return "Cannot approve changes";
}

export type ApprovalKind = "enroll-key" | "revoke-key" | "profile-edit";

export interface ApprovalSignature {
  keyId: string;
  keyAlias: string;
  signedAt: number | undefined;
}

export interface Approval {
  id: string;
  kind: ApprovalKind;
  title: string;
  createdAt: number;
  createdBy: string;
  // Identity changes need a majority of controllers; a profile edit needs the
  // document's `threshold`. The two quorums are unrelated.
  quorum: "identity" | "profile";
  required: number;
  signatures: ApprovalSignature[];
  status: "pending" | "applied" | "rejected";
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const OTHER_KEY_ID = "z6MkkPvBfjP4bQmco5Dm7UGsX2ruDBieEHi8n9DVJWX5sTEz";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Every enrollment needs its own id: reusing one constant meant a second key
// collided with the first, which is a duplicate key in the list and a crash.
export function mintKeyId(): string {
  let out = "z6Mk";
  for (let i = 0; i < 44; i++) {
    out += BASE58[Math.floor(Math.random() * BASE58.length)];
  }
  return out;
}

// The actor's stable identifier: the repository's RID, which never changes as
// keys come and go.
export const ACTOR_RID = "rad:z42hL2jL4XNk6K8oHQaSWfMgCL7ji";

// `rad-enroll:` followed by the base58btc encoding of 137 raw bytes, which
// lands at roughly 190 characters.
export const ENROLLMENT_CODE =
  "rad-enroll:zSmWTHNaU74w9VXGdu2Rj4wE5gVG5kBjJ4MeUYm31A8oHDd3PrquuizKs2pi5UL3bMfeuqUdCwbbL36B68yaeeZ6JuQjVYHx1yUHfoPKg8bav4SLPL6HLYNAXGcSWEfFDNQACyWiBkoXerYwSoF5rDJXKRr4CKYxeEX6QoGMNq8gEBxUE9MxnQCJDhj";

function emptyProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    displayName: "",
    fullName: "",
    pronouns: "",
    bio: "",
    location: "",
    timezone: "",
    avatar: "",
    banner: "",
    links: [],
    readme: "",
  };
}

function seededProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    displayName: "brandonhaslegs",
    fullName: "Brandon Oxendine",
    pronouns: "",
    bio: "Product and brand designer. Focused on making things that are both beautiful and functional.",
    location: "",
    timezone: "",
    avatar: "",
    banner: "",
    links: [
      { id: "l1", url: "https://brandonoxendine.com", label: "Website" },
      { id: "l2", url: "https://github.com/brandonhaslegs", label: "GitHub" },
      { id: "l3", url: "mailto:brandon.oxendine@gmail.com", label: "" },
    ],
    readme: "",
  };
}

function defaultKeys(thisKeyId: string, thisAlias: string): ActorKey[] {
  const now = Date.now();
  return [
    {
      id: thisKeyId,
      alias: thisAlias,
      controller: true,
      bound: true,
      addedAt: now - 240 * DAY,
      lastSeen: now,
      thisKey: true,
    },
    {
      id: OTHER_KEY_ID,
      alias: `${thisAlias}-workstation`,
      controller: true,
      bound: true,
      addedAt: now - 120 * DAY,
      lastSeen: now - 3 * HOUR,
      thisKey: false,
    },
  ];
}

interface PrototypeState {
  ready: boolean;
  thisKeyId: string;
  alias: string;
  profile: Profile;
  keys: ActorKey[];
  approvals: Approval[];
  // Governs the default branch, and so the profile. Nothing else: identity
  // changes use the controller majority, which is not configurable.
  threshold: number;
  hasProfile: boolean;
}

const FALLBACK_KEY = "z6MkpwnLQxFBQXyMK3Es91s8A7Ew7G11BFFyng1dqZR8QhG3";

export const prototype = $state<PrototypeState>({
  ready: false,
  thisKeyId: FALLBACK_KEY,
  alias: "you",
  profile: seededProfile(),
  keys: defaultKeys(FALLBACK_KEY, "you"),
  approvals: [],
  threshold: 1,
  hasProfile: true,
});

export function seed(publicKey: string, alias: string) {
  if (prototype.ready) return;
  prototype.ready = true;
  prototype.thisKeyId = publicKey;
  prototype.alias = alias;
  prototype.keys = defaultKeys(publicKey, alias);
  prototype.profile = { ...seededProfile(), displayName: alias };
  seedHistory();
}

export function reset() {
  repoImages.length = 0;
  prototype.profile = { ...seededProfile(), displayName: prototype.alias };
  seedHistory();
  prototype.keys = defaultKeys(prototype.thisKeyId, prototype.alias);
  prototype.approvals = [];
  prototype.threshold = 1;
  prototype.hasProfile = true;
}

// A node that has published nothing. Every field is genuinely empty.
export function clearProfile() {
  repoImages.length = 0;
  profileHistory.length = 0;
  prototype.hasProfile = false;
  // The display name starts as the node alias, because that is already the
  // name people see for this key. Everything else is genuinely empty.
  prototype.profile = { ...emptyProfile(), displayName: prototype.alias };
}

export function controllers(): ActorKey[] {
  return prototype.keys.filter(k => k.controller);
}

export function boundKeys(): ActorKey[] {
  return prototype.keys.filter(k => k.bound);
}

// Fixed by the identity machinery, not configurable: floor(n/2) + 1.
export function identityMajority(): number {
  return Math.floor(controllers().length / 2) + 1;
}

// The spec asks clients to warn below three controllers, because two is the
// case where losing either one freezes the identity forever.
export function controllerWarning(): "frozen-risk" | "thin" | undefined {
  const count = controllers().length;
  if (count === 2) return "frozen-risk";
  if (count < 3) return "thin";
  return undefined;
}

// A profile edit is canonical straight away only when one controller's view is
// enough. Above that it has to be ratified by the others.
export function profileEditsApplyDirectly(): boolean {
  return prototype.threshold <= 1;
}

export function signedCount(approval: Approval): number {
  return approval.signatures.filter(s => s.signedAt !== undefined).length;
}

export function pendingApprovals(): Approval[] {
  return prototype.approvals.filter(a => a.status === "pending");
}

let nextId = 0;
function id(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function thisKeyAlias(): string {
  return prototype.keys.find(k => k.thisKey)?.alias ?? "this key";
}

// Only controllers vote, on either quorum.
function freshSignatures(): ApprovalSignature[] {
  return controllers().map(k => ({
    keyId: k.id,
    keyAlias: k.alias,
    signedAt: k.thisKey ? Date.now() : undefined,
  }));
}

function open(
  kind: ApprovalKind,
  quorum: "identity" | "profile",
  title: string,
): Approval {
  const approval: Approval = {
    id: id("approval"),
    kind,
    quorum,
    title,
    createdAt: Date.now(),
    createdBy: thisKeyAlias(),
    required: quorum === "identity" ? identityMajority() : prototype.threshold,
    signatures: freshSignatures(),
    status: "pending",
  };
  prototype.approvals = [approval, ...prototype.approvals];
  return approval;
}

const pendingEnrollments = new SvelteMap<string, ActorKey>();
const pendingRevocations = new SvelteMap<string, string>();
const pendingProfiles = new SvelteMap<string, Profile>();

export function addKey(key: ActorKey) {
  // Belt and braces: a duplicate id would break the keyed list that renders
  // these.
  if (prototype.keys.some(existing => existing.id === key.id)) return;
  prototype.keys = [...prototype.keys, key];
}

export function removeKey(keyId: string) {
  prototype.keys = prototype.keys.filter(k => k.id !== keyId);
  prototype.threshold = Math.min(
    prototype.threshold,
    Math.max(1, controllers().length),
  );
}

// Enrolling a key is an identity change, so it needs a controller majority --
// never the profile threshold.
export function enrollKey(key: ActorKey): Approval | undefined {
  if (identityMajority() <= 1) {
    addKey(key);
    return undefined;
  }
  const approval = open("enroll-key", "identity", `Enroll "${key.alias}"`);
  pendingEnrollments.set(approval.id, key);
  return approval;
}

export function revoke(key: ActorKey): Approval | undefined {
  if (identityMajority() <= 1) {
    removeKey(key.id);
    return undefined;
  }
  const approval = open("revoke-key", "identity", `Revoke "${key.alias}"`);
  pendingRevocations.set(approval.id, key.id);
  return approval;
}

// A profile edit above threshold 1 stays in this key's own namespace until
// enough controllers advance their views to it.
export function saveProfile(next: Profile): Approval | undefined {
  if (profileEditsApplyDirectly()) {
    recordEdit(prototype.profile, next);
    prototype.profile = next;
    prototype.hasProfile = true;
    return undefined;
  }
  const approval = open("profile-edit", "profile", "Update profile");
  pendingProfiles.set(approval.id, next);
  return approval;
}

// Stands in for another controller signing. In the real thing this arrives
// over the network.
export function ratify(approvalId: string) {
  const approval = prototype.approvals.find(a => a.id === approvalId);
  if (!approval) return;
  const next = approval.signatures.find(s => s.signedAt === undefined);
  if (next) next.signedAt = Date.now();
  if (signedCount(approval) >= approval.required) apply(approval);
}

function apply(approval: Approval) {
  approval.status = "applied";

  const enrollment = pendingEnrollments.get(approval.id);
  if (enrollment) {
    addKey(enrollment);
    pendingEnrollments.delete(approval.id);
  }

  const revocation = pendingRevocations.get(approval.id);
  if (revocation) {
    removeKey(revocation);
    pendingRevocations.delete(approval.id);
  }

  const profile = pendingProfiles.get(approval.id);
  if (profile) {
    recordEdit(prototype.profile, profile);
    prototype.profile = profile;
    prototype.hasProfile = true;
    pendingProfiles.delete(approval.id);
  }
}

export function reject(approvalId: string) {
  const approval = prototype.approvals.find(a => a.id === approvalId);
  // Declining to ratify is abstention, not veto, so a rejected proposal simply
  // stops being offered here.
  if (approval) approval.status = "rejected";
}

// An avatar or banner is either a path inside the repository, which replicates
// with it, or an external URL, which does not and is untrusted.
export function isExternal(reference: string): boolean {
  return /^https?:\/\//i.test(reference.trim());
}

// External images are fetched through the proxy, which sanitises them and
// caps their size. Repository paths resolve locally and need no proxy.
const IMAGE_PROXY = "https://img.radicle.xyz/64x64";

// Images sitting in the actor repository's tree, which is where the spec
// prefers an avatar to live so it replicates with the repository. Stand-ins:
// the real thing would read the tree.
export interface RepoImage {
  path: string;
  src: string;
}

// A deterministic placeholder so each path looks like a distinct image without
// shipping binary fixtures.
function placeholder(path: string): string {
  let hash = 0;
  for (const char of path) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  const second = (hue + 60 + (hash % 120)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 65% 55%)"/>
<stop offset="1" stop-color="hsl(${second} 60% 38%)"/>
</linearGradient></defs>
<rect width="64" height="64" fill="url(#g)"/>
<circle cx="${20 + (hash % 24)}" cy="${18 + (hash % 20)}" r="${8 + (hash % 10)}" fill="hsl(${second} 80% 78%)" fill-opacity="0.65"/>
<rect x="0" y="${40 + (hash % 12)}" width="64" height="64" fill="hsl(${hue} 45% 22%)" fill-opacity="0.55"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function repoImage(path: string): RepoImage {
  return { path, src: placeholder(path) };
}

// Empty to begin with: a fresh actor repository contains nothing but the
// profile itself.
export const repoImages = $state<RepoImage[]>([]);

// Monotonic, so a name is never reused after its file has been deleted.
let imageCounter = 0;

// Stands in for choosing a file from disk, which would copy it into the actor
// repository.
export function addRepoImage(): RepoImage {
  imageCounter += 1;
  const next = repoImage(`images/image-${imageCounter}.png`);
  repoImages.push(next);
  return next;
}

// An image nothing points at any more is deleted rather than left to sit in
// the repository, where it would replicate to everyone forever.
export function removeRepoImage(path: string) {
  const index = repoImages.findIndex(image => image.path === path);
  if (index >= 0) repoImages.splice(index, 1);
}

export function imageSource(reference: string): string | undefined {
  const value = reference.trim();
  if (!value) return undefined;
  if (isExternal(value)) {
    return `${IMAGE_PROXY}/${encodeURIComponent(value)}`;
  }
  // A repository path resolves against the tree, with no proxy involved.
  return repoImages.find(image => image.path === value)?.src;
}

// Buttons that move the prototype along, surfaced in the floating panel
// rather than inside the screens they belong to, so the mock-up is never
// shaped by scaffolding.
export interface PrototypeAction {
  id: string;
  label: string;
  run: () => void;
}

export const prototypeActions = $state<PrototypeAction[]>([]);

export function setPrototypeAction(id: string, label: string, run: () => void) {
  const index = prototypeActions.findIndex(action => action.id === id);
  const next = { id, label, run };
  if (index >= 0) prototypeActions[index] = next;
  else prototypeActions.push(next);
}

export function clearPrototypeAction(id: string) {
  const index = prototypeActions.findIndex(action => action.id === id);
  if (index >= 0) prototypeActions.splice(index, 1);
}

// Profile edits are ordinary commits on the actor repository's default
// branch, so there is a history to look at. Recorded here so the prototype can
// show one.
export interface ProfileEdit {
  id: string;
  oid: string;
  by: string;
  at: number;
  // Empty for the commit that first published the profile.
  fields: string[];
}

export const profileHistory = $state<ProfileEdit[]>([]);

const FIELD_NAMES: Record<keyof Profile, string> = {
  version: "schema version",
  displayName: "display name",
  fullName: "full name",
  pronouns: "pronouns",
  bio: "bio",
  location: "location",
  timezone: "time zone",
  avatar: "avatar",
  banner: "banner",
  links: "links",
  readme: "about",
};

function fakeOid(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 40; i++) {
    out += hex[Math.floor(Math.random() * hex.length)];
  }
  return out;
}

function changedFields(before: Profile, after: Profile): string[] {
  return (Object.keys(FIELD_NAMES) as (keyof Profile)[])
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => FIELD_NAMES[key]);
}

function recordEdit(before: Profile, after: Profile) {
  const fields = changedFields(before, after);
  if (fields.length === 0) return;
  profileHistory.unshift({
    id: id("edit"),
    oid: fakeOid(),
    by: thisKeyAlias(),
    at: Date.now(),
    fields,
  });
}

// One entry for the profile that already exists, dated when this key was
// enrolled, so the view is not empty on a seeded profile.
function seedHistory() {
  profileHistory.length = 0;
  const first = prototype.keys.find(key => key.thisKey);
  profileHistory.push({
    id: id("edit"),
    oid: fakeOid(),
    by: thisKeyAlias(),
    at: first ? first.addedAt : Date.now(),
    fields: [],
  });
}

export function ago(timestamp: number): string {
  const elapsed = formatTimestamp(timestamp);
  return elapsed === "now" ? "just now" : `${elapsed} ago`;
}
