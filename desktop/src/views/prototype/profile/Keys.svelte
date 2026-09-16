<script lang="ts">
  import type { ActorKey } from "./store.svelte";

  import { truncateId } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";

  import Approvals from "./Approvals.svelte";
  import {
    ago,
    controllers,
    controllerWarning,
    identityMajority,
    keyRole,
    prototype,
    revoke,
  } from "./store.svelte";

  interface Props {
    onenroll: () => void;
    onrecovery: () => void;
    onproposed: () => void;
  }

  const { onenroll, onrecovery, onproposed }: Props = $props();

  const controllerCount = $derived(controllers().length);
  const majority = $derived(identityMajority());
  const warning = $derived(controllerWarning());

  let confirming = $state<string | undefined>(undefined);

  function doRevoke(key: ActorKey) {
    confirming = undefined;
    if (revoke(key)) onproposed();
  }
</script>

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
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
  .header-actions {
    display: flex;
    gap: 0.5rem;
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
  /* The two quorums side by side, because conflating them is the easiest
     mistake to make here. */
  .quorums {
    display: flex;
    gap: 0.875rem;
  }
  .quorum {
    flex: 1;
    min-width: 0;
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
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .quorum-note {
    color: var(--color-text-tertiary);
  }
  .notice {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.75rem;
    border-radius: var(--border-radius-md);
  }
  .notice.error {
    border: 1px solid var(--color-feedback-error-border);
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
  .notice-heading {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .notice-actions {
    display: flex;
    gap: 0.5rem;
  }
  /* Matches Button's metrics, on the feedback fill so the action belongs to
     the panel it sits in. */
  .notice-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 2rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-error-fill);
    color: var(--color-text-on-brand);
    font: var(--txt-body-m-medium);
    cursor: pointer;
  }
  .notice-action:hover {
    background-color: var(--color-feedback-error-fill-hover);
  }
  .notice-action:active {
    background-color: var(--color-feedback-error-fill-active);
  }
</style>

<div class="sections">
  <div>
    <div class="section-header">
      <span class="section-title txt-body-m-medium">
        Keys
        <span class="global-counter-badge">{prototype.keys.length}</span>
      </span>
      <div class="header-actions">
        <Button variant="outline" bordered onclick={onrecovery}>
          <Icon name="lock" />
          Add a recovery key
        </Button>
        <Button variant="secondary" onclick={onenroll}>
          <Icon name="plus" />
          Add key
        </Button>
      </div>
    </div>

    <div class="keys">
      {#each prototype.keys as key (key.id)}
        <div class="key">
          <span class="key-icon">
            <Icon name={key.controller && !key.bound ? "lock" : "key"} />
          </span>
          <div class="key-text">
            <div class="key-name-row">
              <span class="key-name txt-body-m-medium">{key.alias}</span>
              {#if key.thisKey}
                <span class="chip brand txt-body-m-medium">
                  On this machine
                </span>
              {/if}
              {#if keyRole(key)}
                <span class="chip txt-body-m-medium">{keyRole(key)}</span>
              {/if}
            </div>
            <div class="key-facts txt-body-m-regular">
              <CopyableId id={key.id} styleFont="var(--txt-body-m-regular)">
                {truncateId(key.id)}
              </CopyableId>
              <span class="separator">·</span>
              <span>added {ago(key.addedAt)}</span>
              <span class="separator">·</span>
              <span>
                {#if key.thisKey}
                  active now
                {:else if key.lastSeen === undefined}
                  kept offline
                {:else}
                  seen {ago(key.lastSeen)}
                {/if}
              </span>
            </div>
          </div>
          <div class="key-actions">
            {#if key.thisKey}
              <!-- Revoking the key you sign with would lock you out. -->
            {:else if confirming === key.id}
              <div class="confirm">
                <span class="confirm-text txt-body-m-regular">
                  {identityMajority() > 1 ? "Propose revoking?" : "Revoke?"}
                </span>
                <Button
                  variant="ghost"
                  styleHeight="1.75rem"
                  onclick={() => doRevoke(key)}>
                  Yes
                </Button>
                <Button
                  variant="outline"
                  styleHeight="1.75rem"
                  onclick={() => (confirming = undefined)}>
                  Cancel
                </Button>
              </div>
            {:else}
              <Button
                variant="naked"
                title="Revoke key"
                onclick={() => (confirming = key.id)}>
                <Icon name="trash" />
              </Button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if warning === "frozen-risk"}
    <div class="notice error">
      <div class="notice-heading txt-body-m-medium">
        <Icon name="warning" />
        Don't get locked out
      </div>
      <span class="txt-body-m-regular">
        With two keys, both have to approve every change. If you lose one, you
        can never remove it or add a replacement. Adding a third key fixes this.
      </span>
      <div class="notice-actions">
        <button type="button" class="notice-action" onclick={onrecovery}>
          Add a recovery key
        </button>
      </div>
    </div>
  {:else if warning === "thin"}
    <div class="notice error">
      <div class="notice-heading txt-body-m-medium">
        <Icon name="warning" />
        Only one key
      </div>
      <span class="txt-body-m-regular">
        Lose this key and you lose the profile, with no way to get it back.
        Three keys is the recommended minimum.
      </span>
      <div class="notice-actions">
        <button type="button" class="notice-action" onclick={onrecovery}>
          Add a recovery key
        </button>
      </div>
    </div>
  {/if}

  <div>
    <div class="section-header">
      <span class="section-title txt-body-m-medium">Approvals needed</span>
    </div>

    <div class="quorums">
      <div class="quorum">
        <div class="quorum-title txt-body-m-medium">
          <Icon name="key" />
          Adding or removing a key
        </div>
        <span class="quorum-value">
          {majority} of {controllerCount}
        </span>
        <span class="quorum-note txt-body-m-regular">
          How many of your controllers have to approve. Always a majority, so it
          rises as you add keys. You cannot change this.
        </span>
      </div>
      <div class="quorum">
        <div class="quorum-title txt-body-m-medium">
          <Icon name="edit" />
          Editing your profile
        </div>
        <span class="quorum-value">
          {prototype.threshold} of {controllerCount}
        </span>
        <span class="quorum-note txt-body-m-regular">
          How many have to approve a change to your profile details. One means
          your edits show up straight away. You can change this with the CLI.
        </span>
      </div>
    </div>
  </div>

  {#if prototype.approvals.length > 0}
    <div>
      <div class="section-header">
        <span class="section-title txt-body-m-medium">Changes</span>
      </div>
      <Approvals />
    </div>
  {/if}
</div>
