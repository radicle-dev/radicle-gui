import type { ActorInfo } from "@bindings/actor/ActorInfo";
import type { ActorKey } from "@bindings/actor/ActorKey";
import type { ActorProfile } from "@bindings/actor/ActorProfile";

import { get } from "svelte/store";

import { nodeRunning } from "@app/lib/events";
import { invalidateReposSummary, invoke, InvokeError } from "@app/lib/invoke";
import * as router from "@app/lib/router";
import type { ProfileTab } from "@app/lib/router/definitions";
import { formatTimestamp, publicKeyFromDid, truncateId } from "@app/lib/utils";

import { announce } from "@app/components/AnnounceSwitch.svelte";

// The text for `error`: `overrides` first, where a place needs other words
// than the backend's for a code, then the backend's own message, then
// `fallback`.
export function describeActorError(
  error: unknown,
  fallback: string,
  overrides: Record<string, string> = {},
): string {
  if (error instanceof InvokeError && error.code in overrides) {
    return overrides[error.code];
  }

  return error instanceof Error ? error.message : fallback;
}

// Reloads the profile page on `tab` from storage, so it shows what was
// written.
async function reload(tab: ProfileTab): Promise<void> {
  invalidateReposSummary();
  await router.replace({ resource: "profile", tab });
}

// The actor writes and what each takes; the options are added by `change`.
export type ActorWrite =
  | { command: "create_actor"; args: { profile: ActorProfile } }
  | { command: "update_actor_profile"; args: { profile: ActorProfile } }
  | {
      command: "approve_enrollment";
      args: { code: string; controller: boolean };
    }
  | { command: "remove_actor_key"; args: { did: string } }
  | { command: "approve_actor_revision"; args: { id: string } }
  | { command: "withdraw_actor_revision"; args: { id: string } }
  | { command: "reject_actor_revision"; args: { id: string } };

// The votes on an open identity change.
export type Vote = Extract<ActorWrite, { args: { id: string } }>["command"];

// Runs an actor write, then reloads `tab` whether or not it went through: a
// failure may come from state the page has not seen, and a write that went
// through is not undone by a reload that did not. The write announces when
// the node runs and the user has not turned announcing off.
export async function change(
  { command, args }: ActorWrite,
  tab: ProfileTab,
): Promise<void> {
  const opts = { announce: get(nodeRunning) && get(announce) };
  const reloadQuietly = () =>
    reload(tab).catch((e: unknown) =>
      console.warn("Could not reload the profile", e),
    );
  try {
    await invoke<ActorInfo>(command, { ...args, opts });
  } catch (error) {
    await reloadQuietly();
    throw error;
  }
  await reloadQuietly();
}

// The keys that govern the actor's identity.
export function controllersOf(actor: ActorInfo): ActorKey[] {
  return actor.keys.filter(key => key.controller);
}

// Whether `did` governs the actor's identity. A rejection signs a verdict,
// not the document, so a controller rejects a change this version of the
// app cannot write back whole.
export function isController(actor: ActorInfo, did: string): boolean {
  return actor.keys.some(key => key.did === did && key.controller);
}

// Whether `did` may change the actor's keys: it governs the identity, and
// the payload is one this version of Desktop can write back whole.
export function mayChangeKeys(actor: ActorInfo, did: string): boolean {
  return isController(actor, did) && !actor.payloadNewer;
}

// What a key does for the actor: a full key acts as it and approves
// changes, a recovery key only approves, a bound key only acts.
export function keyKind(key: ActorKey): "full" | "recovery" | "bound" {
  if (key.bound && key.controller) return "full";
  return key.controller ? "recovery" : "bound";
}

// The alias of a key of `actor`, or of one an open change adds, and the
// shortened key otherwise.
export function keyName(actor: ActorInfo, did: string): string {
  const key =
    actor.keys.find(key => key.did === did) ??
    actor.pending.flatMap(r => r.added).find(key => key.did === did);

  return key?.alias ?? truncateId(publicKeyFromDid(did));
}

// When an edit proposed now goes live, as the end of a sentence. A profile
// edit is live once enough controllers' branches carry the same commit, and
// Desktop has no step for a controller to take over another key's commit
// yet, so the sentence says so.
export function approvalText(actor: ActorInfo): string {
  const needed = actor.threshold;
  const who =
    needed === 1 ? "a controller carries" : `${needed} controllers carry`;

  return `once ${who} the same edit, which Desktop cannot do yet`;
}

export function ago(seconds: number): string {
  const elapsed = formatTimestamp(seconds * 1000);
  return elapsed === "now" ? "just now" : `${elapsed} ago`;
}
