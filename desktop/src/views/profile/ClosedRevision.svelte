<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ActorRevision } from "@bindings/actor/ActorRevision";

  import Icon from "@app/components/Icon.svelte";

  import { ago, keyName, revisionTitle } from "./actor";

  interface Props {
    actor: ActorInfo;
    // A change to the keys that ended, or one that waits on another.
    revision: ActorRevision;
    localDid: string;
    // The change the profile began with.
    first?: boolean;
  }

  const { actor, revision, localDid, first = false }: Props = $props();

  const STATES = {
    accepted: "Applied",
    rejected: "Rejected",
    lapsed: "Lapsed",
    open: "Waiting",
  } as const;

  const name = (did: string) =>
    did === localDid ? "this device" : keyName(actor, did);
  const list = (dids: string[]) =>
    new Intl.ListFormat("en", { type: "conjunction" }).format(dids.map(name));
</script>

<style>
  .change {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
  }
  .change-icon {
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
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--color-text-primary);
  }
  .byline {
    color: var(--color-text-tertiary);
  }
  .state {
    flex-shrink: 0;
    padding: 0.125rem 0.5rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .state.accepted {
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .state.rejected {
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
  .state.open {
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
</style>

<div class="change">
  <span class="change-icon">
    <Icon name={revision.removed.length > 0 ? "trash" : "key"} />
  </span>

  <div class="text">
    <span class="txt-body-m-medium">
      {first ? "Created the profile" : revisionTitle(actor, revision, true)}
    </span>
    <span class="byline txt-body-m-regular">
      Proposed by {name(revision.author)}
      {ago(revision.createdAt)}
      {#if revision.accepted.length > 0}
        · approved by {list(revision.accepted)}
      {/if}
      {#if revision.rejected.length > 0}
        · rejected by {list(revision.rejected)}
      {/if}
    </span>
  </div>

  <span class="state {revision.state} txt-body-m-medium">
    {STATES[revision.state]}
  </span>
</div>
