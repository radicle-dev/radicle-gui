<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ActorRevision } from "@bindings/actor/ActorRevision";

  import { publicKeyFromDid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Clipboard from "@app/components/Clipboard.svelte";
  import Icon from "@app/components/Icon.svelte";

  import {
    type ActorWrite,
    ago,
    controllersOf,
    describeActorError,
    isController,
    keyName,
    mayChangeKeys,
    revisionTitle,
    type Vote,
    votesText,
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

  const removesMe = $derived(revision.removed.includes(localDid));
  const hinted = $derived(revision.unreadable || removesMe);
  const votes = $derived(mine || (controls && !signed && !rejected));

  const title = $derived(revisionTitle(actor, revision));
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
  /* The buttons line up with the bottom of a hint that holds a command. */
  .actions.tall {
    align-items: flex-end;
  }
  .status {
    flex-shrink: 0;
    padding: 0.125rem 0.5rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  .status.rejected {
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .actions-hint {
    margin-right: auto;
  }
  .command {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    font: var(--txt-code-regular);
    color: var(--color-text-primary);
  }
  .unsupported {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    word-break: break-all;
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
  .chip.brand {
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
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
        Proposed by {mine ? "this device" : keyName(actor, revision.author)}
        {ago(revision.createdAt)}
      </span>
    </div>
    {#if revision.rejected.length > 0}
      <span class="status rejected txt-body-m-medium">Rejected</span>
    {:else}
      <span class="status txt-body-m-medium">Awaiting signatures</span>
    {/if}
  </div>

  <!-- Approving is a decision about a key, so each key added is shown
       whole; the alias only labels it. -->
  {#each revision.added as key (key.did)}
    <div class="added-key txt-body-m-regular">
      {#if key.alias}
        <span class="txt-body-m-medium">{key.alias}</span>
      {/if}
      <span class="mono">{publicKeyFromDid(key.did)}</span>
    </div>
  {/each}

  <div class="signatures">
    <div class="progress-row">
      <span class="txt-body-m-medium">
        {votesText(actor, revision)}
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
        {#if key.did === localDid}
          <span class="chip brand txt-body-s-regular">This device</span>
        {/if}
        <span class="signer-when">{verdict}</span>
      </div>
    {/each}
  </div>

  {#if hinted || votes}
    <div class="actions" class:tall={revision.unreadable}>
      <span class="actions-hint txt-body-m-regular">
        {#if revision.unreadable}
          {@const command = `rad id show ${revision.id} --repo ${actor.rid}`}
          <span class="unsupported">
            This change edits more than this version of Desktop supports. Review
            it with this command.
            <span class="command">
              <span style:flex="1">{command}</span>
              <Clipboard text={command} />
            </span>
          </span>
        {:else if removesMe}
          Approving removes this device from your profile.
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
  {/if}

  {#if error}
    <span class="card-error txt-body-m-regular">{error}</span>
  {/if}
</div>
