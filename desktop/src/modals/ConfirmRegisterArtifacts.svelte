<script lang="ts">
  import type { StagedArtifact } from "@app/lib/stageArtifacts";
  import {
    planDetail,
    planSummary,
    planTitle,
    registerPlan,
  } from "@app/lib/stageArtifacts";
  import { formatBytes } from "@app/lib/utils";

  import Checkbox from "@app/components/Checkbox.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    staged: StagedArtifact[];
    confirm: (
      staged: StagedArtifact[],
      includeRedacted: boolean,
    ) => Promise<void>;
  }

  const { staged, confirm }: Props = $props();

  let includeRedacted = $state(false);

  const plan = $derived(registerPlan(staged, includeRedacted));
  const acting = $derived(plan.acting);
  const registering = $derived(plan.registering);
  const newCount = $derived(plan.newCount);
  const willSeed = $derived(acting.some(p => p.seed));
  const anyExisting = $derived(staged.some(s => s.existing));
  const anyDuplicate = $derived(staged.some(s => s.duplicateOf !== undefined));
  const anyKeepsName = $derived(staged.some(s => s.existing?.keepsName));
  const redacted = $derived(
    staged.filter(s => s.existing?.redaction !== undefined),
  );
  const registersFolder = $derived(
    registering.some(p => p.item.digest.directory),
  );

  const totalBytes = $derived(
    acting.reduce((sum, p) => sum + p.item.digest.sizeBytes, 0),
  );
  const totalFiles = $derived(
    acting.reduce((sum, p) => sum + p.item.digest.fileCount, 0),
  );

  const title = $derived(planTitle(plan));
  const summary = $derived(planSummary(plan));
</script>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 13rem;
    overflow-y: auto;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .item-icon {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  .item-name {
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .item-detail {
    margin-left: auto;
    flex-shrink: 0;
    white-space: nowrap;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .total {
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .warning {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
  }
  .warning-icon {
    display: inline-flex;
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: var(--color-feedback-warning-text);
  }
  .warning-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .note {
    padding: 0.625rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
</style>

<ConfirmModal
  {title}
  width="30rem"
  icon="plus"
  label={newCount > 0 ? "Register" : "Update"}
  busyLabel={newCount > 0 ? "Registering…" : "Updating…"}
  failure="Unable to register these artifacts."
  canConfirm={acting.length > 0}
  confirm={() => confirm(staged, includeRedacted)}>
  {#snippet body({ working })}
    <div class="list">
      {#each plan.items as p}
        <div class="item">
          <span class="item-icon">
            <Icon name={p.item.digest.directory ? "folder" : "attach"} />
          </span>
          <span class="item-name">{p.item.name}</span>
          <span class="item-detail">{planDetail(p, includeRedacted)}</span>
        </div>
      {/each}
    </div>

    {#if acting.length > 0 && (acting.length > 1 || acting.some(p => p.item.digest.directory))}
      <div class="total">
        {totalFiles}
        {totalFiles === 1 ? "file" : "files"} in total, {formatBytes(
          totalBytes,
        )}
      </div>
    {/if}

    {#if anyExisting || anyDuplicate}
      <div class="note">
        An artifact is identified by the hash of its contents, not by its name,
        so anything already in this release stays the single entry it is.
        {#if anyDuplicate}
          Picks with the same contents are registered once.
        {/if}
        {#if acting.length === 0}
          Nothing will be registered.
        {:else}
          {summary}.
        {/if}
        {#if anyKeepsName}
          A name marked “stays” is kept: only its author can rename it.
        {/if}
      </div>
    {/if}

    {#if redacted.length > 0}
      <div class="warning">
        <span class="warning-icon"><Icon name="warning" /></span>
        <div class="warning-body">
          {#each redacted as item (item.digest.cid)}
            <span>
              “{item.existing?.name}” was redacted{item.existing?.redaction
                ? `: ${item.existing.redaction}`
                : "."}
            </span>
          {/each}
          <Checkbox bind:checked={includeRedacted} disabled={working}>
            Register {redacted.length === 1 ? "it" : "them"} again
          </Checkbox>
        </div>
      </div>
    {/if}

    {#if acting.length > 0}
      <div class="warning">
        <span class="warning-icon"><Icon name="warning" /></span>
        <div class="warning-body">
          {#if registering.length > 0}
            <span>
              {#if registersFolder}
                A folder is registered whole, as one artifact.
              {:else}
                These names and CIDs are signed into the release and reach
                everyone who has this repository.
              {/if}
            </span>
          {/if}
          {#if willSeed}
            <span>
              Your artifact node is running, so it seeds the artifact and adds
              your node's location.
            </span>
          {/if}
        </div>
      </div>
    {/if}
  {/snippet}
</ConfirmModal>
