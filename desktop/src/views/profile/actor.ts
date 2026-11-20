import type { ActorInfo } from "@bindings/actor/ActorInfo";
import type { ActorKey } from "@bindings/actor/ActorKey";
import type { ActorProfile } from "@bindings/actor/ActorProfile";
import type { ActorRevision } from "@bindings/actor/ActorRevision";
import type { ProfileImages } from "@bindings/actor/ProfileImages";
import type { Key } from "@radicle-gui/core/keys";

import { isJobsKey, keys } from "@radicle-gui/core/keys";
import { createQuery, invalidate } from "@radicle-gui/ui/lib/query.svelte";
import { get } from "svelte/store";

import { localActor } from "@app/lib/cobQueries";
import { nodeRunning } from "@app/lib/events";
import { invoke, InvokeError } from "@app/lib/invoke";
import { labs } from "@app/lib/labs";
import { queryClient } from "@app/lib/query";
import type { SidebarData } from "@app/lib/router/definitions";
import { formatTimestamp, publicKeyFromDid, truncateId } from "@app/lib/utils";

import { announce } from "@app/components/AnnounceSwitch.svelte";

// Where the profile is kept in the actor's repository.
export const PROFILE_PATH = ".radicle/profile.json";

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

// The local actor as the cache has it, so that writes and the node's updates
// show in place, and as the route loaded it until the cache has an answer.
// Create it during component initialisation.
export function createActor(
  loaded: () => Pick<SidebarData, "actor" | "actorError">,
): Pick<SidebarData, "actor" | "actorError"> {
  const query = createQuery(queryClient, () => ({
    ...localActor(),
    enabled: labs.actorRepos,
  }));

  // The query's own error, when it has one the page can show.
  const queryError = () => {
    const { error } = query.current;
    return error instanceof InvokeError
      ? { code: error.code, message: error.message }
      : undefined;
  };

  // A disabled query still holds what it last fetched, so with the lab off
  // the route's values count.
  return {
    get actor() {
      if (!labs.actorRepos) return loaded().actor;
      const { data } = query.current;
      if (queryError()) return null;
      return data !== undefined ? data : loaded().actor;
    },
    get actorError() {
      if (!labs.actorRepos) return loaded().actorError;
      const error = queryError();
      if (error) return error;
      return query.current.data !== undefined ? undefined : loaded().actorError;
    },
  };
}

// The actor writes and what each takes; the options are added by `change`.
export type ActorWrite =
  | {
      command: "create_actor" | "update_actor_profile";
      args: { profile: ActorProfile; images: ProfileImages };
    }
  | {
      command: "approve_enrollment";
      args: { code: string; controller: boolean };
    }
  | { command: "remove_actor_key"; args: { did: string } }
  | { command: "leave_actor"; args: { rid: string } }
  | { command: "cancel_leave"; args: { rid: string } }
  | { command: "retire_actor"; args: { rid: string } }
  | { command: "approve_actor_revision"; args: { id: string } }
  | { command: "withdraw_actor_revision"; args: { id: string } }
  | { command: "reject_actor_revision"; args: { id: string } };

// The votes on an open identity change.
export type Vote = Extract<ActorWrite, { args: { id: string } }>["command"];

// Runs an actor write, which announces when the node runs and the user has
// not turned announcing off. It returns once the actor is refetched, whether
// or not the write went through, so callers see what it left. The actor's
// repository is refetched too, since its identity and code change; most
// writes don't name it, so it comes from the cache.
export async function change({ command, args }: ActorWrite): Promise<void> {
  const opts = { announce: get(nodeRunning) && get(announce) };
  const rid =
    "rid" in args
      ? args.rid
      : queryClient.getQueryData<ActorInfo | null>(keys.actor())?.rid;
  try {
    await invoke<ActorInfo>(command, { ...args, opts });
  } finally {
    await Promise.all([
      invalidate(queryClient, { queryKey: keys.actor() }),
      rid !== undefined &&
        invalidate(queryClient, {
          queryKey: keys.repo(rid),
          // Job lists don't depend on the identity, and listing them is slow.
          predicate: query => !isJobsKey(query.queryKey as Key),
        }),
    ]);
  }
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

// The open change that removes `did` from `actor` and has `voter`'s vote.
export function votedRemoval(
  actor: ActorInfo,
  did: string,
  voter: string,
): ActorRevision | undefined {
  return actor.pending.find(
    revision =>
      revision.removed.includes(did) && revision.accepted.includes(voter),
  );
}

// What a change to `actor`'s keys does, in a line. A change that ended is
// told in the past tense, and since the keys have moved on since, every key
// it lists is told as added.
export function revisionTitle(
  actor: ActorInfo,
  revision: ActorRevision,
  past = false,
): string {
  const parts = [
    ...revision.added.map(key => {
      const known = !past && actor.keys.some(k => k.did === key.did);
      const role = {
        full: "",
        recovery: " as a recovery key",
        bound: " (not a controller)",
      }[keyKind(key)];
      const verb = past ? "Added" : known ? "Change" : "Add";
      return `${verb} ${keyName(actor, key.did)}${role}`;
    }),
    ...revision.removed.map(
      did => `${past ? "Removed" : "Remove"} ${keyName(actor, did)}`,
    ),
  ];

  // A lower quorum on profile edits is a change of its own; it must not
  // pass unseen inside a removal or a role change.
  if (revision.threshold !== undefined) {
    const approvals = revision.threshold === 1 ? "approval" : "approvals";
    const quorum = past
      ? `needed ${revision.threshold} ${approvals}`
      : `need ${revision.threshold} ${approvals} instead of ${actor.threshold}`;
    return parts.length > 0
      ? `${parts.join(", ")}; profile edits ${quorum}`
      : `Profile edits ${quorum}`;
  }

  if (parts.length > 0) return parts.join(", ");
  return past ? "Changed the identity" : "Change the identity";
}

// How the votes on an open change of `actor` stand.
export function votesText(actor: ActorInfo, revision: ActorRevision): string {
  const approved = Math.min(revision.accepted.length, actor.majority);
  const rejected =
    revision.rejected.length > 0
      ? `, ${revision.rejected.length} rejected`
      : "";

  return `${approved} of ${actor.majority} approved${rejected}`;
}

// What a key does for the actor: a full key acts as it and approves
// changes, a recovery key only approves, a bound key only acts.
export function keyKind(key: ActorKey): "full" | "recovery" | "bound" {
  if (key.bound && key.controller) return "full";
  return key.controller ? "recovery" : "bound";
}

// The label of each kind of key. Both roles are the default, so a key that
// has them needs none.
export const roleText = {
  full: undefined,
  recovery: "Recovery key",
  bound: "Not a controller",
};

// What a profile is called where its name is shown.
export function profileName(actor: ActorInfo): string {
  return actor.profile?.displayName || "A profile with no name";
}

// The alias of a key of `actor`, or of one an open change adds, and the
// shortened key otherwise.
export function keyName(actor: ActorInfo, did: string): string {
  const key =
    actor.keys.find(key => key.did === did) ??
    actor.pending.flatMap(r => r.added).find(key => key.did === did);

  return key?.alias ?? truncateId(publicKeyFromDid(did));
}

export function ago(seconds: number): string {
  const elapsed = formatTimestamp(seconds * 1000);
  return elapsed === "now" ? "just now" : `${elapsed} ago`;
}
