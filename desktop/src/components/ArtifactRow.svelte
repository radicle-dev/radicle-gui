<script lang="ts">
  import type { Artifact } from "@bindings/cob/release/Artifact";
  import type { ArtifactDigest } from "@bindings/cob/release/ArtifactDigest";

  import { slide } from "svelte/transition";

  import { pickLike } from "@app/lib/artifactPickers";
  import { artifactNodeRunning } from "@app/lib/events";
  import { invoke, InvokeError } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import {
    attestedBy,
    canAttest,
    canEditMetadata,
    delegatesFirst,
    displayMetadataValue,
    locationsByNode,
    parseMetadataValue,
    redactedByDelegate,
  } from "@app/lib/releases";
  import { authorForNodeId, formatBytes } from "@app/lib/utils";

  import ArtifactDownloadButton from "@app/components/ArtifactDownloadButton.svelte";
  import Button from "@app/components/Button.svelte";
  import DelegateBadge from "@app/components/DelegateBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import ConfirmRedact from "@app/modals/ConfirmRedact.svelte";

  interface Props {
    artifact: Artifact;
    rid: string;
    releaseId: string;
    ownDid: string;
    delegateIds: Set<string>;
    cidLabel: string;
    seeding: boolean;
    onChange: () => Promise<void>;
  }

  const {
    artifact,
    rid,
    releaseId,
    ownDid,
    delegateIds,
    cidLabel,
    seeding,
    onChange,
  }: Props = $props();

  const SIZE_KEY = "sizeBytes";
  // `title` in the metadata is the convention for a display name.
  const TITLE_KEY = "title";

  const size = $derived.by(() => {
    const size = artifact.metadata[SIZE_KEY];
    return typeof size === "number" ? formatBytes(size) : undefined;
  });
  const metadata = $derived(
    Object.entries(artifact.metadata).filter(([key]) => key !== SIZE_KEY),
  );
  const artifactName = $derived.by(() => {
    const title = artifact.metadata[TITLE_KEY];
    return typeof title === "string" && title.trim() !== ""
      ? title.trim()
      : undefined;
  });
  const locations = $derived(
    delegatesFirst(
      locationsByNode(artifact.locations),
      g => g.user.did,
      delegateIds,
    ),
  );
  const redactions = $derived(
    delegatesFirst(artifact.redactions, r => r.user.did, delegateIds),
  );
  const attestations = $derived(
    delegatesFirst(artifact.attestations, n => n.did, delegateIds),
  );
  const trust = $derived.by(() => {
    const count = attestedBy(attestations, delegateIds);
    return count === 0
      ? undefined
      : `Attested by ${count} delegate${count === 1 ? "" : "s"}`;
  });
  const editable = $derived(canEditMetadata(artifact, ownDid, delegateIds));
  const artifactNodeUp = $derived($artifactNodeRunning);

  let open = $state(false);

  function openRedact() {
    show({
      component: ConfirmRedact,
      props: {
        name: artifactName ?? artifact.name,
        seeding,
        confirm: async (reason: string) => {
          await invoke("redact_artifact", {
            rid,
            releaseId,
            cid: artifact.cid,
            reason,
          });
          await onChange();
        },
      },
    });
  }

  // The key being edited, or an empty key for a new entry.
  let editing: string | undefined = $state();
  let draftKey = $state("");
  let draftValue = $state("");
  let saving = $state(false);
  let metadataError: string | undefined = $state();

  function startEdit(key: string, value: unknown) {
    editing = key;
    draftKey = key;
    draftValue = key === "" ? "" : displayMetadataValue(value);
    metadataError = undefined;
  }

  function cancelEdit() {
    editing = undefined;
    draftKey = "";
    draftValue = "";
    metadataError = undefined;
  }

  async function saveMetadata(previousKey: string) {
    const key = draftKey.trim();
    if (key === "") {
      metadataError = "A key is required.";
      return;
    }
    if (key === SIZE_KEY) {
      metadataError = `"${SIZE_KEY}" is maintained by the app.`;
      return;
    }

    saving = true;
    metadataError = undefined;
    try {
      // Renaming a key is a remove plus a set, since the COB has no rename.
      if (previousKey !== "" && previousKey !== key) {
        await invoke("remove_artifact_metadata", {
          rid,
          releaseId,
          cid: artifact.cid,
          key: previousKey,
        });
      }
      await invoke("set_artifact_metadata", {
        rid,
        releaseId,
        cid: artifact.cid,
        key,
        value: parseMetadataValue(draftValue),
      });
      cancelEdit();
      await onChange();
    } catch (error) {
      console.error("Saving artifact metadata failed", error);
      metadataError = "Saving failed.";
    } finally {
      saving = false;
    }
  }

  async function removeMetadata(key: string) {
    saving = true;
    metadataError = undefined;
    try {
      await invoke("remove_artifact_metadata", {
        rid,
        releaseId,
        cid: artifact.cid,
        key,
      });
      cancelEdit();
      await onChange();
    } catch (error) {
      console.error("Removing artifact metadata failed", error);
      metadataError = "Removing failed.";
    } finally {
      saving = false;
    }
  }

  let attesting = $state(false);
  let attestError: string | undefined = $state();

  async function attest() {
    const path = await pickLike(artifact.directory);
    if (!path) {
      return;
    }

    attesting = true;
    attestError = undefined;
    try {
      await invoke("attest_artifact", {
        rid,
        releaseId,
        cid: artifact.cid,
        path,
      });
    } catch (error) {
      attestError =
        error instanceof InvokeError &&
        error.code === "ArtifactError.CidMismatch"
          ? "Your build has a different CID, so it was not attested."
          : "Attesting failed.";
    } finally {
      attesting = false;
      await onChange();
    }
  }

  let reseeding = $state(false);
  let reseedError: string | undefined = $state();

  async function reseed() {
    const path = await pickLike(artifact.directory);
    if (!path) {
      return;
    }

    reseeding = true;
    reseedError = undefined;
    try {
      const digest = await invoke<ArtifactDigest>("compute_artifact_cid", {
        path,
      });
      if (digest.cid !== artifact.cid) {
        reseedError = "CID mismatch";
        return;
      }
      await invoke("seed_artifact", {
        rid,
        releaseId,
        cid: artifact.cid,
        sourcePath: path,
      });
    } catch (error) {
      console.error("Seeding failed", error);
      reseedError = (await invoke<boolean>("artifact_node_running").catch(
        () => false,
      ))
        ? "Seeding failed"
        : "Artifact node not running";
    } finally {
      reseeding = false;
      await onChange();
    }
  }

  let unseeding = $state(false);
  let unseedFailed = $state(false);

  async function stopSeeding() {
    unseeding = true;
    unseedFailed = false;
    try {
      await invoke("unseed_artifact", { rid, releaseId, cid: artifact.cid });
    } catch (error) {
      console.error("Unseeding failed", error);
      unseedFailed = true;
    } finally {
      unseeding = false;
      await onChange();
    }
  }

  let addingLocation = $state(false);
  let draftUrl = $state("");
  let savingLocation = $state(false);
  let locationError: string | undefined = $state();

  function startAddLocation() {
    addingLocation = true;
    draftUrl = "";
    locationError = undefined;
  }

  function cancelAddLocation() {
    addingLocation = false;
    draftUrl = "";
    locationError = undefined;
  }

  async function addLocation() {
    const url = draftUrl.trim();
    if (url === "") {
      locationError = "A URL is required.";
      return;
    }

    savingLocation = true;
    locationError = undefined;
    try {
      await invoke("add_artifact_location", {
        rid,
        releaseId,
        cid: artifact.cid,
        url,
      });
      cancelAddLocation();
      await onChange();
    } catch (error) {
      console.error("Adding a location failed", error);
      locationError =
        error instanceof InvokeError &&
        error.code === "ArtifactError.InvalidLocation"
          ? "This is not a URL peers can fetch from."
          : "Adding the location failed.";
    } finally {
      savingLocation = false;
    }
  }

  async function removeLocation(url: string) {
    savingLocation = true;
    locationError = undefined;
    try {
      await invoke("remove_artifact_location", {
        rid,
        releaseId,
        cid: artifact.cid,
        url,
      });
      closeFocused();
      await onChange();
    } catch (error) {
      console.error("Removing a location failed", error);
      locationError = "Removing the location failed.";
    } finally {
      savingLocation = false;
    }
  }
</script>

<style>
  .artifact {
    padding: 0.75rem 0.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .artifact:first-child {
    border-top: 1px solid var(--color-border-subtle);
  }
  .artifact-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .summary:hover .toggle,
  .summary:focus-visible .toggle {
    color: var(--color-text-primary);
  }
  .identity {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: nowrap;
    min-width: 0;
  }
  .name {
    font: var(--txt-body-l-regular);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 1;
  }
  .trailing {
    display: inline-flex;
    align-items: baseline;
    align-self: center;
    gap: 0.5rem;
    flex-shrink: 0;
    max-width: 60%;
    min-width: 0;
  }
  .filename {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .artifact-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: auto;
    flex-shrink: 0;
  }
  .size {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .identity.expanded {
    flex-wrap: wrap;
  }
  .identity.expanded .trailing {
    max-width: none;
  }
  .identity.expanded .name,
  .identity.expanded .filename {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
    max-width: none;
    min-width: 0;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    align-self: center;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
    transition: transform 0.15s;
  }
  .toggle.open {
    transform: rotate(180deg);
  }
  .artifact-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.375rem;
    font: var(--txt-body-s-regular);
  }
  .cid {
    color: var(--color-text-tertiary);
    font: var(--txt-code-small);
  }
  .trust {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-foreground-success);
    white-space: nowrap;
  }
  .seeding {
    display: inline-flex;
    align-items: center;
    height: 1.75rem;
    padding: 0 0.5rem;
    border: none;
    border-radius: var(--border-radius-sm);
    background: none;
    cursor: pointer;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .seeding:hover:not(:disabled),
  .seeding:focus-visible {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .seeding-label {
    display: inline-grid;
  }
  .seeding-idle,
  .seeding-stop {
    grid-area: 1 / 1;
    text-align: center;
  }
  .seeding-stop {
    visibility: hidden;
  }
  .seeding:hover:not(:disabled) .seeding-idle,
  .seeding:focus-visible .seeding-idle {
    visibility: hidden;
  }
  .seeding:hover:not(:disabled) .seeding-stop,
  .seeding:focus-visible .seeding-stop {
    visibility: visible;
  }
  .unseed-error {
    color: var(--color-foreground-red);
  }
  .seed-error {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-feedback-warning-text);
    font: var(--txt-body-s-regular);
    white-space: nowrap;
  }
  .contributor {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
  }
  .redacted-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    white-space: nowrap;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0 0.375rem;
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .section-title {
    display: flex;
    align-items: center;
    min-height: 1.5rem;
    gap: 0.5rem;
    font: var(--txt-body-s-medium);
    color: var(--color-text-secondary);
  }
  .section-count {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .empty-section {
    color: var(--color-text-tertiary);
  }
  .people {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-foreground-success);
  }
  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    width: fit-content;
    max-width: 100%;
  }
  .meta-key {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }
  .meta-value {
    word-break: break-word;
    min-width: 0;
  }
  .meta-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    opacity: 0;
  }
  .meta-row:hover .meta-actions,
  .meta-row:focus-within .meta-actions {
    opacity: 1;
  }
  .meta-editor {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .key-field {
    width: 9rem;
    flex-shrink: 0;
  }
  .value-field {
    width: 16rem;
    max-width: 100%;
  }
  .meta-error {
    color: var(--color-feedback-error-text);
    font: var(--txt-body-s-regular);
  }
  .confirm-remove {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    min-width: 15rem;
    max-width: 22rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
  }
  .confirm-remove-text {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--color-text-primary);
  }
  .confirm-remove-note {
    color: var(--color-text-secondary);
  }
  .confirm-remove-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .confirm-remove-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-error-fill);
    color: var(--color-text-on-brand);
    cursor: pointer;
    transition: background-color 0.1s ease;
  }
  .confirm-remove-button:hover:not(:disabled),
  .confirm-remove-button:focus-visible:not(:disabled) {
    background-color: var(--color-feedback-error-fill-hover);
  }
  .confirm-remove-button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .locations,
  .redactions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .location-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .location-node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .location-url {
    color: var(--color-text-secondary);
    word-break: break-all;
  }
  .url-field {
    width: 24rem;
    max-width: 100%;
  }
  .redaction {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--color-text-secondary);
  }
  .reason {
    color: var(--color-text-tertiary);
    word-break: break-word;
  }
</style>

<div class="artifact">
  <div class="artifact-row">
    <button
      type="button"
      class="summary"
      aria-expanded={open}
      title={open ? "Hide details" : "Show details"}
      onclick={() => (open = !open)}>
      <span class="identity" class:expanded={open}>
        <span class="name">{artifactName ?? artifact.name}</span>
        <span class="trailing">
          {#if artifactName}
            <span class="filename">{artifact.name}</span>
          {/if}
          {#if artifact.redacted}
            <span class="redacted-badge">
              {redactedByDelegate(artifact, delegateIds)
                ? "Redacted by delegate"
                : "Redacted by author"}
            </span>
          {/if}
          <span class="toggle" class:open>
            <Icon name="chevron-down" />
          </span>
        </span>
      </span>
    </button>
    {#if size}
      <span class="size">{size}</span>
    {/if}
    <div class="artifact-actions">
      {#if seeding}
        <button
          class="seeding"
          disabled={unseeding}
          title="Your node is seeding this artifact. Click to unseed."
          onclick={stopSeeding}>
          {#if unseeding}
            Unseeding…
          {:else}
            <span class="seeding-label">
              <span class="seeding-idle">Seeding</span>
              <span class="seeding-stop">Unseed</span>
            </span>
          {/if}
        </button>
      {:else if !artifact.redacted}
        {#if reseedError}
          <span class="seed-error">
            <Icon name="warning" />{reseedError}
          </span>
        {/if}
        <Button
          variant="naked"
          styleHeight="1.75rem"
          disabled={reseeding || artifactNodeUp === false}
          title={artifactNodeUp === false
            ? "Your artifact node is not running"
            : "Seed your own copy so others can download it"}
          onclick={reseed}>
          {reseeding ? "Seeding…" : "Seed"}
        </Button>
      {/if}
      <ArtifactDownloadButton
        {artifact}
        {delegateIds}
        {seeding}
        onDownloaded={onChange}
        {releaseId}
        {rid} />
    </div>
  </div>

  <div class="artifact-meta">
    <span class="cid">
      <Id id={cidLabel} clipboard={artifact.cid} label="CID" shorten={false} />
    </span>
    <span class="contributor">
      <NodeId {...authorForNodeId(artifact.author)} />
      {#if delegateIds.has(artifact.author.did)}
        <DelegateBadge />
      {/if}
    </span>
    {#if trust}
      <span class="trust">
        <Icon name="checkmark" />
        {trust}
      </span>
    {/if}
    {#if unseedFailed}
      <span class="unseed-error">Could not unseed.</span>
    {/if}
  </div>

  {#if open}
    <div class="details" transition:slide={{ duration: 180 }}>
      <div class="section">
        <div class="section-title">
          Metadata
          <span class="section-count">{metadata.length}</span>
          {#if editable && editing !== ""}
            <Button
              variant="naked"
              styleHeight="1.5rem"
              disabled={saving}
              onclick={() => startEdit("", undefined)}>
              <Icon name="plus" />Add
            </Button>
          {/if}
        </div>

        {#if metadata.length === 0 && editing !== ""}
          <div class="empty-section">No metadata</div>
        {/if}

        {#each metadata as [key, value] (key)}
          {#if editing === key}
            <div class="meta-editor">
              <span class="key-field">
                <TextInput
                  bind:value={draftKey}
                  placeholder="Key"
                  styleHeight="1.75rem"
                  disabled={saving} />
              </span>
              <span class="value-field">
                <TextInput
                  bind:value={draftValue}
                  placeholder="Value"
                  styleHeight="1.75rem"
                  disabled={saving}
                  onSubmit={() => saveMetadata(key)} />
              </span>
              <Button
                variant="secondary"
                styleHeight="1.75rem"
                disabled={saving}
                onclick={() => saveMetadata(key)}>
                Save
              </Button>
              <Button
                variant="naked"
                styleHeight="1.75rem"
                disabled={saving}
                onclick={cancelEdit}>
                Cancel
              </Button>
            </div>
          {:else}
            <div class="meta-row">
              <span class="meta-key">{key}</span>
              <span class="meta-value">
                {displayMetadataValue(value)}
              </span>
              {#if editable}
                <span class="meta-actions">
                  <Button
                    variant="naked"
                    styleHeight="1.5rem"
                    title="Edit"
                    disabled={saving}
                    onclick={() => startEdit(key, value)}>
                    <Icon name="edit" />
                  </Button>
                  <Popover placement="bottom-end" popoverPadding="0">
                    {#snippet toggle(onclick)}
                      <Button
                        variant="naked"
                        styleHeight="1.5rem"
                        title="Remove"
                        disabled={saving}
                        {onclick}>
                        <Icon name="trash" />
                      </Button>
                    {/snippet}
                    {#snippet popover()}
                      <div class="confirm-remove">
                        <div class="confirm-remove-text">
                          <div class="txt-body-m-medium">
                            Remove "{key}"?
                          </div>
                          <div class="confirm-remove-note txt-body-m-regular">
                            The entry is dropped from the release for everyone
                            who replicates it. You can set it again afterwards.
                          </div>
                        </div>
                        <div class="confirm-remove-actions">
                          <Button
                            variant="outline"
                            disabled={saving}
                            onclick={closeFocused}>
                            Cancel
                          </Button>
                          <button
                            type="button"
                            class="confirm-remove-button txt-body-m-medium"
                            disabled={saving}
                            onclick={() => removeMetadata(key)}>
                            <Icon name="trash" />
                            {saving ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      </div>
                    {/snippet}
                  </Popover>
                </span>
              {/if}
            </div>
          {/if}
        {/each}

        {#if editing === ""}
          <div class="meta-editor">
            <span class="key-field">
              <TextInput
                bind:value={draftKey}
                placeholder="Key"
                autofocus
                styleHeight="1.75rem"
                disabled={saving} />
            </span>
            <span class="value-field">
              <TextInput
                bind:value={draftValue}
                placeholder="Value"
                styleHeight="1.75rem"
                disabled={saving}
                onSubmit={() => saveMetadata("")} />
            </span>
            <Button
              variant="secondary"
              styleHeight="1.75rem"
              disabled={saving}
              onclick={() => saveMetadata("")}>
              Save
            </Button>
            <Button
              variant="naked"
              styleHeight="1.75rem"
              disabled={saving}
              onclick={cancelEdit}>
              Cancel
            </Button>
          </div>
        {/if}

        {#if metadataError}
          <div class="meta-error">{metadataError}</div>
        {/if}
      </div>

      <div class="section">
        <div class="section-title">
          Attestations
          <span class="section-count">{attestations.length}</span>
          {#if canAttest(artifact, ownDid)}
            <Button
              variant="naked"
              styleHeight="1.5rem"
              disabled={attesting}
              title="Attest that your own build has the same CID"
              onclick={attest}>
              <Icon name="checkmark" />
              {attesting ? "Attesting…" : "Attest"}
            </Button>
          {/if}
        </div>
        {#if attestError}
          <div class="meta-error">{attestError}</div>
        {/if}
        {#if attestations.length === 0}
          <div class="empty-section">Nobody has attested to this artifact</div>
        {:else}
          <div class="people">
            {#each attestations as node (node.did)}
              <div class="person">
                <Icon name="checkmark" />
                <NodeId {...authorForNodeId(node)} />
                {#if delegateIds.has(node.did)}
                  <DelegateBadge tooltip="Attested by a delegate" />
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="section">
        <div class="section-title">
          Redactions
          <span class="section-count">{redactions.length}</span>
          <!-- Only the author's and delegates' redactions hide an artifact. -->
          {#if editable && !redactions.some(r => r.user.did === ownDid)}
            <Button variant="naked" styleHeight="1.5rem" onclick={openRedact}>
              <Icon name="warning" />Redact
            </Button>
          {/if}
        </div>
        {#if redactions.length === 0}
          <div class="empty-section">No redactions</div>
        {:else}
          <div class="redactions">
            {#each redactions as redaction (redaction.user.did)}
              <div class="redaction">
                <NodeId {...authorForNodeId(redaction.user)} />
                {#if delegateIds.has(redaction.user.did)}
                  <DelegateBadge tooltip="Redacted by a delegate" />
                {/if}
                <span class="reason">
                  {redaction.reason || "No reason"}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="section">
        <div class="section-title">
          Locations
          <span class="section-count">{artifact.locations.length}</span>
          {#if !artifact.redacted && !addingLocation}
            <Button
              variant="naked"
              styleHeight="1.5rem"
              disabled={savingLocation}
              title="Add a URL others can download this artifact from"
              onclick={startAddLocation}>
              <Icon name="plus" />Add
            </Button>
          {/if}
        </div>
        {#if addingLocation}
          <div class="meta-editor">
            <span class="url-field">
              <TextInput
                bind:value={draftUrl}
                placeholder="https://…"
                autofocus
                styleHeight="1.75rem"
                disabled={savingLocation}
                onDismiss={cancelAddLocation}
                onSubmit={addLocation} />
            </span>
            <Button
              variant="secondary"
              styleHeight="1.75rem"
              disabled={savingLocation}
              onclick={addLocation}>
              Save
            </Button>
            <Button
              variant="naked"
              styleHeight="1.75rem"
              disabled={savingLocation}
              onclick={cancelAddLocation}>
              Cancel
            </Button>
          </div>
        {/if}
        {#if locationError}
          <div class="meta-error">{locationError}</div>
        {/if}
        {#if artifact.locations.length === 0}
          {#if !addingLocation}
            <div class="empty-section">No locations</div>
          {/if}
        {:else}
          <div class="locations">
            {#each locations as group (group.user.did)}
              <div class="location-group">
                <div class="location-node">
                  <NodeId {...authorForNodeId(group.user)} />
                  {#if delegateIds.has(group.user.did)}
                    <DelegateBadge tooltip="Location added by a delegate" />
                  {/if}
                </div>
                {#each group.urls as url (url)}
                  <div class="meta-row">
                    <span class="location-url">
                      <Id
                        id={url}
                        clipboard={url}
                        label="location URL"
                        shorten={false} />
                    </span>
                    {#if group.user.did === ownDid}
                      <span class="meta-actions">
                        <Popover placement="bottom-end" popoverPadding="0">
                          {#snippet toggle(onclick)}
                            <Button
                              variant="naked"
                              styleHeight="1.5rem"
                              title="Remove location"
                              disabled={savingLocation}
                              {onclick}>
                              <Icon name="trash" />
                            </Button>
                          {/snippet}
                          {#snippet popover()}
                            <!-- Withdrawing your own endpoint also unseeds, as in Unseed. -->
                            {@const unseeds =
                              url.startsWith("radiroh:") && seeding}
                            {@const busy = savingLocation || unseeding}
                            <div class="confirm-remove">
                              <div class="confirm-remove-text">
                                <div class="txt-body-m-medium">
                                  {unseeds
                                    ? "Unseed this artifact?"
                                    : "Remove this location?"}
                                </div>
                                <div
                                  class="confirm-remove-note txt-body-m-regular">
                                  {#if unseeds}
                                    This is your node's location. Removing it
                                    also unseeds it from your node seeding the
                                    artifact.
                                  {:else}
                                    Peers stop downloading the artifact from it.
                                  {/if}
                                </div>
                              </div>
                              <div class="confirm-remove-actions">
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onclick={closeFocused}>
                                  Cancel
                                </Button>
                                <button
                                  type="button"
                                  class="confirm-remove-button txt-body-m-medium"
                                  disabled={busy}
                                  onclick={async () => {
                                    if (unseeds) {
                                      await stopSeeding();
                                      closeFocused();
                                    } else {
                                      await removeLocation(url);
                                    }
                                  }}>
                                  <Icon name="trash" />
                                  {#if unseeds}
                                    {busy ? "Unseeding…" : "Unseed"}
                                  {:else}
                                    {busy ? "Removing…" : "Remove"}
                                  {/if}
                                </button>
                              </div>
                            </div>
                          {/snippet}
                        </Popover>
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
