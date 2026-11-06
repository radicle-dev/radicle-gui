<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ActorRevision } from "@bindings/actor/ActorRevision";

  import { publicKeyFromDid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  import {
    type ActorWrite,
    ago,
    controllersOf,
    describeActorError,
    isController,
    keyKind,
    keyName,
    mayChangeKeys,
    type Vote,
  } from "./actor";

  interface Props {
    actor: ActorInfo;
    revision: ActorRevision;
    localDid: string;
    acting: boolean;
    act: (
      write: ActorWrite,
      onerror?: (error: unknown) => void,
    ) => Promise<void>;
  }

  const { actor, revision, localDid, acting, act }: Props = $props();

  // A vote's error stays on the card it was cast from.
  let error = $state<string>();
  const vote = (command: Vote) => {
    error = undefined;
    void act({ command, args: { id: revision.id } }, e => {
      error = describeActorError(e, "Could not make the change.");
    });
  };

  const controllers = $derived(controllersOf(actor));
  const controls = $derived(isController(actor, localDid));
  const canChangeKeys = $derived(mayChangeKeys(actor, localDid));

  const mine = $derived(revision.author === localDid);
  const signed = $derived(revision.accepted.includes(localDid));
  const rejected = $derived(revision.rejected.includes(localDid));

  const title = $derived.by(() => {
    const parts = [
      ...revision.added.map(key => {
        const known = actor.keys.some(k => k.did === key.did);
        const role = {
          full: "",
          recovery: " as a recovery key",
          bound: " without approving changes",
        }[keyKind(key)];
        return `${known ? "Change" : "Add"} ${keyName(actor, key.did)}${role}`;
      }),
      ...revision.removed.map(did => `Remove ${keyName(actor, did)}`),
    ];

    // A lower quorum on profile edits is a change of its own; it must not
    // pass unseen inside a removal or a role change.
    if (revision.threshold !== undefined) {
      const approvals = revision.threshold === 1 ? "approval" : "approvals";
      const quorum = `need ${revision.threshold} ${approvals} instead of ${actor.threshold}`;
      return parts.length > 0
        ? `${parts.join(", ")}; profile edits ${quorum}`
        : `Profile edits ${quorum}`;
    }

    return parts.length > 0 ? parts.join(", ") : "Change the identity";
  });
</script>

<style>
  .approval {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .approval-head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .approval-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .approval-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--color-text-primary);
  }
  .byline,
  .actions-hint {
    color: var(--color-text-tertiary);
  }
  .status {
    flex-shrink: 0;
    padding: 0.125rem 0.5rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .actions-hint {
    margin-right: auto;
  }
  .signatures {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.875rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .progress-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    color: var(--color-text-secondary);
  }
  .track {
    display: flex;
    gap: 0.1875rem;
    flex: 1;
    max-width: 12rem;
  }
  .segment {
    flex: 1;
    height: 0.25rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
  }
  .segment.filled {
    background-color: var(--color-feedback-success-fill);
  }
  .signer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-primary);
  }
  .signer-icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-quaternary);
  }
  .signer-icon.signed {
    color: var(--color-feedback-success-text);
  }
  .signer-icon.rejected {
    color: var(--color-feedback-error-text);
  }
  .added-key {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--color-border-hint);
  }
  .mono {
    font: var(--txt-code-regular);
    color: var(--color-text-primary);
    word-break: break-all;
  }
  .card-error {
    color: var(--color-feedback-error-text);
  }
  .signer-when {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
</style>

<div class="approval">
  <div class="approval-head">
    <span class="approval-icon"><Icon name="key" /></span>
    <div class="approval-text">
      <span class="txt-body-m-medium">{title}</span>
      <span class="byline txt-body-m-regular">
        Proposed by {mine ? "this machine" : keyName(actor, revision.author)}
        {ago(revision.createdAt)}
      </span>
    </div>
    <span class="status txt-body-m-medium">Awaiting signatures</span>
  </div>

  <!-- Approving is a decision about a key, so each key added is shown
       whole; the alias is only what its node calls itself. -->
  {#each revision.added as key (key.did)}
    <div class="added-key txt-body-m-regular">
      <span class="mono">{publicKeyFromDid(key.did)}</span>
      {#if key.alias}
        <span>Calls itself {key.alias}</span>
      {/if}
    </div>
  {/each}

  <div class="signatures">
    <div class="progress-row">
      <span class="txt-body-m-medium">
        {Math.min(revision.accepted.length, actor.majority)}
        of {actor.majority} approved{revision.rejected.length > 0
          ? `, ${revision.rejected.length} rejected`
          : ""}
      </span>

      <div class="track">
        {#each Array.from({ length: actor.majority }, (_, i) => i) as slot (slot)}
          <span class="segment" class:filled={slot < revision.accepted.length}>
          </span>
        {/each}
      </div>
    </div>

    {#each controllers as key (key.did)}
      {@const verdict = revision.accepted.includes(key.did)
        ? "signed"
        : revision.rejected.includes(key.did)
          ? "rejected"
          : "waiting"}

      <div class="signer txt-body-m-regular">
        <span
          class="signer-icon"
          class:signed={verdict === "signed"}
          class:rejected={verdict === "rejected"}>
          <Icon
            name={verdict === "signed"
              ? "checkmark"
              : verdict === "rejected"
                ? "close"
                : "clock"} />
        </span>
        <span>{keyName(actor, key.did)}</span>
        <span class="signer-when">{verdict}</span>
      </div>
    {/each}
  </div>

  <div class="actions">
    <span class="actions-hint txt-body-m-regular">
      {#if revision.unreadable}
        This change does more than Desktop can show, so it cannot sign it.
      {:else if revision.removed.includes(localDid)}
        Approving this removes this machine's key. It will no longer act as you
        or change the profile.
      {:else if signed}
        Approve it from your other controllers to finish.
      {:else if rejected}
        You rejected this change. It stays open until enough controllers reject
        it, or the proposer withdraws it.
      {/if}
    </span>

    {#if mine}
      <Button
        variant="outline"
        bordered
        disabled={acting}
        onclick={() => vote("withdraw_actor_revision")}>
        Withdraw
      </Button>
    {:else if controls && !signed && !rejected}
      <Button
        variant="outline"
        bordered
        disabled={acting}
        onclick={() => vote("reject_actor_revision")}>
        Reject
      </Button>

      {#if canChangeKeys && !revision.unreadable}
        <Button
          variant="secondary"
          disabled={acting}
          onclick={() => vote("approve_actor_revision")}>
          Approve
        </Button>
      {/if}
    {/if}
  </div>

  {#if error}
    <span class="card-error txt-body-m-regular">{error}</span>
  {/if}
</div>
