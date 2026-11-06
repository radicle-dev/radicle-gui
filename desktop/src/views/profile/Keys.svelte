<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";

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
  } from "./actor";
  import EnrollKey from "./EnrollKey.svelte";
  import Notice from "./Notice.svelte";
  import PendingRevision from "./PendingRevision.svelte";

  interface Props {
    actor: ActorInfo;
    localDid: string;
  }

  const { actor, localDid }: Props = $props();

  const controllers = $derived(controllersOf(actor));
  const canChangeKeys = $derived(mayChangeKeys(actor, localDid));

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
      await change(write, "keys");
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
            "This machine's key cannot revoke keys. Revoke from a key that can.",
        }),
      };
    });
  }

  // A key whose removal has this machine's vote and waits for the others.
  function revokePending(did: string): boolean {
    return actor.pending.some(
      revision =>
        revision.removed.includes(did) && revision.accepted.includes(localDid),
    );
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
          change(
            { command: "approve_enrollment", args: { code, controller } },
            "keys",
          ),
      },
    });
  }

  // Both roles are the default, so a key that has them needs no label.
  const roleText = {
    full: undefined,
    recovery: "Recovery key",
    bound: "Cannot approve changes",
  };
</script>

<style>
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
  <Notice icon="warning" title="Written by a newer Desktop">
    <span class="txt-body-m-regular">
      The actor repository was written by a newer version of Desktop, which may
      know keys this version does not show.
    </span>
  </Notice>
{/if}

<div>
  <div class="section-header">
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
              <span class="chip brand txt-body-m-medium">On this machine</span>
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
{#if controllers.length === 2}
  <Notice icon="warning" title="Don't get locked out" tone="error">
    <span class="txt-body-m-regular">
      With two controllers, both have to approve every change to your keys. If
      you lose one, you can never remove it or add a replacement. Adding a third
      fixes this.
    </span>
  </Notice>
{:else if controllers.length === 1}
  <Notice icon="warning" title="Only one controller" tone="error">
    <span class="txt-body-m-regular">
      Lose this key and you lose control of the profile, with no way to get it
      back. Three controllers is the recommended minimum.
    </span>
  </Notice>
{/if}

{#if actor.pending.length > 0}
  <div>
    <div class="section-header">
      <span class="section-title txt-body-m-medium">Waiting for approval</span>
    </div>

    <div class="approvals">
      {#each actor.pending as revision (revision.id)}
        <PendingRevision {actor} {revision} {localDid} {acting} {act} />
      {/each}
    </div>
  </div>
{/if}

{#if actionError}
  <span class="footer-note error txt-body-m-regular">{actionError}</span>
{/if}
