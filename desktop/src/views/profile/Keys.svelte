<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ActorRevision } from "@bindings/actor/ActorRevision";

  import type { HintId } from "@app/lib/hints";
  import { hints } from "@app/lib/hints";
  import { invoke } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import { publicKeyFromDid, truncateId } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";

  import {
    type ActorWrite,
    ago,
    change,
    controllersOf,
    describeActorError,
    keyKind,
    keyName,
    mayChangeKeys,
    roleText,
    votedRemoval,
  } from "./actor";
  import ClosedRevision from "./ClosedRevision.svelte";
  import EnrollKey from "./EnrollKey.svelte";
  import Notice from "./Notice.svelte";
  import PendingRevision from "./PendingRevision.svelte";

  interface Props {
    actor: ActorInfo;
    localDid: string;
  }

  const { actor, localDid }: Props = $props();

  const controllers = $derived(controllersOf(actor));

  // The warnings about too few controllers that the user has read and closed,
  // by profile. Fewer controllers is a choice, so neither comes back for the
  // same count.
  const warning = $derived<HintId>(
    `profile.controllers:${actor.rid}:${controllers.length}`,
  );
  const dismiss = () => hints.dismiss(warning);
  const canChangeKeys = $derived(mayChangeKeys(actor, localDid));

  // What an identity change shows in: the open changes and their votes, the
  // keys and what each may do, and the two counts of approvals.
  const moved = $derived(
    JSON.stringify([
      actor.rid,
      actor.pending,
      actor.keys,
      actor.threshold,
      actor.majority,
    ]),
  );

  // The changes to the keys that ended, newest first, loaded again whenever
  // the identity moves.
  let closed = $state<ActorRevision[]>([]);
  $effect(() => {
    void moved;

    let gone = false;
    invoke<ActorRevision[]>("closed_actor_revisions")
      .then(revisions => {
        if (!gone) closed = revisions;
      })
      .catch((e: unknown) =>
        console.warn("Could not load the past changes to the keys", e),
      );

    return () => {
      gone = true;
    };
  });

  let acting = $state(false);
  let actionError = $state<string>();
  let confirmingRevoke = $state<string>();
  let revokeError = $state<{ did: string; message: string }>();

  // The error goes to the page's own place, or to `onerror` when the caller
  // shows it next to what was clicked.
  async function act(
    write: ActorWrite,
    onerror?: (error: unknown) => void,
  ): Promise<void> {
    acting = true;
    actionError = undefined;
    revokeError = undefined;

    try {
      await change(write);
    } catch (error) {
      if (onerror) onerror(error);
      else
        actionError = describeActorError(error, "Could not make the change.");
    } finally {
      acting = false;
    }
  }

  function revoke(did: string) {
    confirmingRevoke = undefined;
    void act({ command: "remove_actor_key", args: { did } }, error => {
      revokeError = {
        did,
        message: describeActorError(error, "Could not revoke the key.", {
          "ActorError.NotController":
            "This device's key cannot revoke keys. Revoke from a key that can.",
        }),
      };
    });
  }

  // A key whose removal has this machine's vote and waits for the others.
  function revokePending(did: string): boolean {
    return votedRemoval(actor, did, localDid) !== undefined;
  }

  // A confirmation for a key that left the list must not reopen when it
  // comes back.
  $effect(() => {
    if (
      confirmingRevoke &&
      !actor.keys.some(key => key.did === confirmingRevoke)
    )
      confirmingRevoke = undefined;
  });

  function openEnroll() {
    show({
      component: EnrollKey,
      props: {
        rid: actor.rid,
        majority: actor.majority,
        confirm: (code: string, controller: boolean) =>
          change({
            command: "approve_enrollment",
            args: { code, controller },
          }),
      },
    });
  }
</script>

<style>
  .quorums {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .quorum {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .quorum-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-secondary);
  }
  .quorum-value {
    color: var(--color-text-primary);
  }
  .quorum-note {
    color: var(--color-text-tertiary);
  }
  /* Past changes in one box, each below the last. */
  .closed {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .closed > :global(* + *) {
    border-top: 1px solid var(--color-border-subtle);
  }
  .approvals {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .footer-note {
    color: var(--color-text-tertiary);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.625rem;
  }
  /* As tall as its title, so the taller button beside it does not push the
     first line lower than on the Profile tab. */
  .section-header.with-action {
    height: 1.25rem;
    margin-bottom: 1rem;
  }
  .section-title {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-secondary);
  }
  .keys {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    overflow: hidden;
  }
  .key {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background-color: var(--color-surface-canvas);
  }
  .key + .key {
    border-top: 1px solid var(--color-border-subtle);
  }
  .key-icon {
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
  .key-actions {
    flex-shrink: 0;
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .confirm-text {
    color: var(--color-text-secondary);
  }
  .key-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .key-name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .key-name {
    color: var(--color-text-primary);
  }
  .chip {
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .chip.brand {
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
  }
  .key-facts {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    color: var(--color-text-tertiary);
  }
  .separator {
    color: var(--color-text-quaternary);
  }
</style>

{#if actor.payloadNewer}
  <Notice
    icon="warning"
    title="Written by a newer Desktop or another app"
    tone="warning">
    <span class="txt-body-m-regular">
      This profile holds fields this version of Desktop does not know, so the
      keys cannot be changed here. It may also hold keys this version does not
      show.
    </span>
  </Notice>
{/if}

<div>
  <div class="section-header with-action">
    <span class="section-title txt-body-m-medium">
      Keys
      <span class="global-counter-badge">{actor.keys.length}</span>
    </span>

    {#if canChangeKeys}
      <Button variant="secondary" onclick={openEnroll}>
        <Icon name="plus" />
        Add key
      </Button>
    {/if}
  </div>

  <div class="keys">
    {#each actor.keys as key (key.did)}
      {@const kind = keyKind(key)}
      {@const role = roleText[kind]}

      <div class="key">
        <span class="key-icon">
          <Icon name={kind === "recovery" ? "lock" : "key"} />
        </span>

        <div class="key-text">
          <div class="key-name-row">
            <span class="key-name txt-body-m-medium">
              {keyName(actor, key.did)}
            </span>

            {#if key.did === localDid}
              <span class="chip brand txt-body-m-medium">This device</span>
            {/if}

            {#if role}
              <span class="chip txt-body-m-medium">{role}</span>
            {/if}
          </div>

          <div class="key-facts txt-body-m-regular">
            <CopyableId id={key.did} styleFont="var(--txt-body-m-regular)">
              {truncateId(publicKeyFromDid(key.did))}
            </CopyableId>
            <span class="separator">·</span>
            <span>added {ago(key.addedAt)}</span>
            {#if key.did === localDid}
              <span class="separator">·</span>
              <span>active now</span>
            {:else if !key.bound}
              <span class="separator">·</span>
              <span>kept offline</span>
            {/if}
          </div>

          {#if revokeError?.did === key.did}
            <span class="error txt-body-m-regular">{revokeError.message}</span>
          {/if}
        </div>
        <!-- Revoking the key this machine signs with would lock it out. -->
        {#if canChangeKeys && key.did !== localDid}
          <div class="key-actions">
            {#if confirmingRevoke === key.did}
              <div class="confirm">
                <span class="confirm-text txt-body-m-regular">
                  {#if key.controller && controllers.length - 1 < actor.majority}
                    This needs its own approval too. Propose anyway?
                  {:else}
                    {actor.majority > 1 ? "Propose revoking?" : "Revoke?"}
                  {/if}
                </span>

                <Button
                  variant="ghost"
                  styleHeight="1.75rem"
                  disabled={acting}
                  onclick={() => revoke(key.did)}>
                  Yes
                </Button>

                <Button
                  variant="outline"
                  styleHeight="1.75rem"
                  disabled={acting}
                  onclick={() => (confirmingRevoke = undefined)}>
                  Cancel
                </Button>
              </div>
            {:else if revokePending(key.did)}
              <span class="chip txt-body-m-medium">Revoke pending</span>
            {:else}
              <Button
                variant="naked"
                title="Revoke key"
                disabled={acting}
                onclick={() => (confirmingRevoke = key.did)}>
                <Icon name="trash" />
              </Button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
  <!-- The key the error is about can be gone after the reload. -->
  {#if revokeError && !actor.keys.some(key => key.did === revokeError?.did)}
    <span class="footer-note error txt-body-m-regular">
      {revokeError.message}
    </span>
  {/if}
</div>

<!-- Below three controllers, losing one can freeze the keys for good. -->
{#if controllers.length === 2 && !hints.isDismissed(warning)}
  <Notice
    icon="warning"
    title="Don't get locked out"
    tone="warning"
    ondismiss={dismiss}>
    <span class="txt-body-m-regular">
      With two controllers, both have to approve every change to your keys. If
      you lose one, you can never remove it or add a replacement. With three
      controllers, any two can approve, so losing one does not lock you out.
    </span>
  </Notice>
{:else if controllers.length === 1 && !hints.isDismissed(warning)}
  <Notice
    icon="warning"
    title="Only one controller"
    tone="warning"
    ondismiss={dismiss}>
    <span class="txt-body-m-regular">
      Lose this key and you lose control of the profile, with no way to get it
      back. Three controllers is the recommended minimum.
    </span>
  </Notice>
{/if}

<div>
  <div class="section-header">
    <span class="section-title txt-body-m-medium">Approvals needed</span>
  </div>

  <div class="quorums">
    <div class="quorum">
      <span class="quorum-title txt-body-m-medium">
        <Icon name="key" />
        Adding or removing a key
      </span>
      <span class="quorum-value txt-heading-s">
        {actor.majority} of {controllers.length}
      </span>
      <span class="quorum-note txt-body-m-regular">
        How many of your controllers have to approve. Always a majority, so it
        rises as you add keys.
      </span>
    </div>
    <div class="quorum">
      <span class="quorum-title txt-body-m-medium">
        <Icon name="edit" />
        Editing your profile
      </span>
      <span class="quorum-value txt-heading-s">
        {actor.threshold} of {controllers.length}
      </span>
      <span class="quorum-note txt-body-m-regular">
        How many controllers have to agree on an edit. With one, your edits show
        up straight away.
      </span>
    </div>
  </div>
</div>

{#if actor.pending.length > 0 || closed.length > 0}
  <div>
    <div class="section-header">
      <span class="section-title txt-body-m-medium">Changes</span>
    </div>

    <div class="approvals">
      {#each actor.pending as revision (revision.id)}
        <PendingRevision {actor} {revision} {localDid} {acting} {act} />
      {/each}

      {#if closed.length > 0}
        <div class="closed">
          {#each closed as revision, index (revision.id)}
            <ClosedRevision
              {actor}
              {revision}
              {localDid}
              first={index === closed.length - 1} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if actionError}
  <span class="footer-note error txt-body-m-regular">{actionError}</span>
{/if}
