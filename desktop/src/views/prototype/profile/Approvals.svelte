<script lang="ts">
  import type { Approval, ApprovalKind } from "./store.svelte";
  import type { ComponentProps } from "svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  import { ago, prototype, reject, signedCount } from "./store.svelte";

  type IconName = ComponentProps<typeof Icon>["name"];

  const kindIcon: Record<ApprovalKind, IconName> = {
    "enroll-key": "key",
    "revoke-key": "trash",
    "profile-edit": "edit",
  };

  const statusLabel: Record<Approval["status"], string> = {
    pending: "Awaiting signatures",
    applied: "Applied",
    rejected: "Withdrawn",
  };

  const sorted = $derived(
    [...prototype.approvals].sort((a, b) => {
      if (a.status === b.status) return b.createdAt - a.createdAt;
      return a.status === "pending" ? -1 : 1;
    }),
  );
</script>

<style>
  .approvals {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .approval {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .approval.applied,
  .approval.rejected {
    color: var(--color-text-secondary);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .head-icon {
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
  .head-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .title {
    color: var(--color-text-primary);
  }
  .byline {
    color: var(--color-text-tertiary);
  }
  .status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: var(--border-radius-sm);
  }
  .status.pending {
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  .status.applied {
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .status.rejected {
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
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
  }
  .progress-label {
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
  .signers {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .signer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .signer-icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-quaternary);
  }
  .signer-icon.signed {
    color: var(--color-feedback-success-text);
  }
  .signer-name {
    color: var(--color-text-primary);
  }
  .signer-when {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .actions-hint {
    margin-right: auto;
    color: var(--color-text-tertiary);
  }
  .mono {
    font: var(--txt-code-regular);
  }
</style>

{#if sorted.length > 0}
  <div class="approvals">
    {#each sorted as approval (approval.id)}
      {@const signed = signedCount(approval)}
      <div
        class="approval"
        class:applied={approval.status === "applied"}
        class:rejected={approval.status === "rejected"}>
        <div class="head">
          <span class="head-icon"><Icon name={kindIcon[approval.kind]} /></span>
          <div class="head-text">
            <span class="title txt-body-m-medium">{approval.title}</span>
            <span class="byline txt-body-m-regular">
              Proposed by {approval.createdBy}
              {ago(approval.createdAt)}
            </span>
          </div>
          <span
            class="status txt-body-m-medium"
            class:pending={approval.status === "pending"}
            class:applied={approval.status === "applied"}
            class:rejected={approval.status === "rejected"}>
            {statusLabel[approval.status]}
          </span>
        </div>

        <div class="signatures">
          <div class="progress-row">
            <span class="progress-label txt-body-m-medium">
              {Math.min(signed, approval.required)} of {approval.required}
              approved
            </span>
            <div class="track">
              {#each Array.from({ length: approval.required }, (_, i) => i) as slot (slot)}
                <span class="segment" class:filled={slot < signed}></span>
              {/each}
            </div>
          </div>

          <div class="signers">
            {#each approval.signatures as signature (signature.keyId)}
              <div class="signer txt-body-m-regular">
                <span
                  class="signer-icon"
                  class:signed={signature.signedAt !== undefined}>
                  <Icon
                    name={signature.signedAt !== undefined
                      ? "checkmark"
                      : "clock"} />
                </span>
                <span class="signer-name">{signature.keyAlias}</span>
                <span class="signer-when">
                  {signature.signedAt !== undefined
                    ? `signed ${ago(signature.signedAt)}`
                    : "waiting"}
                </span>
              </div>
            {/each}
          </div>
        </div>

        {#if approval.status === "pending"}
          <div class="actions">
            <span class="actions-hint txt-body-m-regular">
              {#if approval.quorum === "identity"}
                Run <span class="mono">rad actor approve</span>
                on your other controllers.
              {:else}
                Ignoring this leaves your profile as it is.
              {/if}
            </span>
            <Button
              variant="outline"
              bordered
              onclick={() => reject(approval.id)}>
              Withdraw
            </Button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
