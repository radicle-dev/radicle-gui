<script lang="ts">
  import type { ArtifactProgress } from "@bindings/artifact/ArtifactProgress";
  import type { Artifact } from "@bindings/cob/release/Artifact";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  import { listen } from "@tauri-apps/api/event";

  import { artifactNodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import * as releases from "@app/lib/releases";
  import { formatBytes } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Checkbox from "@app/components/Checkbox.svelte";
  import Command from "@app/components/Command.svelte";
  import DelegateBadge from "@app/components/DelegateBadge.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import UntrustedWarning from "@app/components/UntrustedWarning.svelte";

  interface Props {
    artifact: Artifact;
    delegateIds: Set<string>;
    releaseId: string;
    rid: string;
    seeding: boolean;
    onDownloaded: () => void;
  }

  const {
    artifact,
    delegateIds,
    releaseId,
    rid,
    seeding,
    onDownloaded,
  }: Props = $props();

  let activeTab: "app" | "cli" | "browser" = $state("app");
  let expanded = $state(false);
  let running: "download" | "fetch" | undefined = $state();
  let progress: ArtifactProgress | undefined = $state();
  let downloadError: string | undefined = $state();
  let finished: "download" | "fetch" | undefined = $state();
  let seed = $state(true);

  $effect(() => {
    if (seeding) {
      seed = true;
    }
  });

  $effect(() => {
    if (!expanded && !running) {
      finished = undefined;
      downloadError = undefined;
    }
  });

  $effect(() => {
    // Events only exist under Tauri, not against the test HTTP API.
    if (!window.__TAURI_INTERNALS__) {
      return;
    }
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    void listen<ArtifactProgress>("artifact_progress", event => {
      if (event.payload.cid === artifact.cid) {
        progress = event.payload;
      }
    }).then(fn => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  });

  const percent = $derived.by(() => {
    if (!progress?.total || progress.offset === undefined) {
      return undefined;
    }
    return Math.min(100, Math.round((progress.offset / progress.total) * 100));
  });

  const phaseLabel = $derived.by(() => {
    switch (progress?.phase) {
      case "connecting":
        return "Connecting…";
      case "tryingLocation":
        return "Trying a location…";
      case "locationFailed":
        return "Location failed, trying another…";
      case "downloading":
        return "Downloading…";
      case "exporting":
        return "Writing to disk…";
      default:
        return "Starting…";
    }
  });

  async function transfer(kind: "download" | "fetch") {
    downloadError = undefined;
    finished = undefined;

    running = kind;
    progress = undefined;
    try {
      const done = await invoke<boolean>("download_artifact", {
        rid,
        releaseId,
        cid: artifact.cid,
        saveAs: kind === "download" ? artifact.name : undefined,
        seed,
      });
      if (!done) {
        return;
      }
      finished = kind;
      // Seeding is the node's state, not ours; ask what actually happened.
      onDownloaded();
    } catch {
      downloadError = `${kind === "download" ? "Download" : "Fetch"} failed. The artifact node may be offline, or no location is reachable.`;
    } finally {
      running = undefined;
      progress = undefined;
    }
  }

  const webLocations = $derived(
    releases.webLocations(artifact.locations, delegateIds),
  );
  const authorTrusted = $derived(delegateIds.has(artifact.author.did));
  const linksByOthers = $derived(
    webLocations.some(l => !delegateIds.has(l.user.did)),
  );
  const downloadable = $derived(seeding || artifact.locations.length > 0);
  const downloadLabel = $derived(seeding ? "Save" : "Download");

  const nodeRunning = $derived($artifactNodeRunning);
  const START_COMMAND = "rad-artifact node start";
  const command = $derived(
    `rad-artifact download --cid ${artifact.cid} --repo ${rid} --seed`,
  );
</script>

<style>
  .popover {
    width: 24rem;
    padding: 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
  }
  .start-command {
    margin-bottom: 0.75rem;
  }
  .untrusted {
    margin-bottom: 0.75rem;
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 1rem;
  }
  label {
    display: block;
    margin-bottom: 0.75rem;
    color: var(--color-text-secondary);
  }
  .warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    color: var(--color-feedback-warning-text);
  }
  .locations {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .location {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .url {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
  }
  .progress-track {
    height: 0.25rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    overflow: hidden;
    margin-top: 0.5rem;
  }
  .progress-bar {
    height: 100%;
    background-color: var(--color-fill-secondary);
    transition: width 0.1s linear;
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.5rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .error {
    margin-top: 0.75rem;
    color: var(--color-foreground-red);
    font: var(--txt-body-s-regular);
  }
  .success {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    color: var(--color-foreground-success);
    font: var(--txt-body-s-regular);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .seed-option {
    margin-top: 0.75rem;
  }
</style>

<Popover placement="bottom-end" popoverPadding="0" bind:expanded>
  {#snippet toggle(onclick)}
    <Button
      {onclick}
      styleHeight="1.75rem"
      disabled={!downloadable}
      title={downloadable
        ? undefined
        : "This artifact has no location to download from"}>
      <Icon name="download" />{downloadLabel}
    </Button>
  {/snippet}

  {#snippet popover()}
    <div class="popover">
      {#if !authorTrusted}
        <div class="untrusted">
          <UntrustedWarning
            text="Not from a delegate. Only download if you trust the author." />
        </div>
      {/if}
      <div class="tabs">
        <Button
          styleWidth="100%"
          flatRight
          bordered
          active={activeTab === "app"}
          onclick={() => (activeTab = "app")}>
          <Icon name="download" />App
        </Button>
        <Button
          styleWidth="100%"
          bordered
          flatLeft
          flatRight
          active={activeTab === "cli"}
          onclick={() => (activeTab = "cli")}>
          <Icon name="logo" />CLI
        </Button>
        <Button
          styleWidth="100%"
          flatLeft
          bordered
          disabled={webLocations.length === 0}
          title={webLocations.length === 0
            ? "This artifact has no web locations"
            : undefined}
          active={activeTab === "browser"}
          onclick={() => (activeTab = "browser")}>
          <Icon name="open-external" />Browser
        </Button>
      </div>

      {#if activeTab === "app"}
        <label for="download-artifact">
          {#if nodeRunning === false}
            Your artifact node is not running, so nothing can be downloaded
            here. Start it with:
          {:else if seeding}
            Save a copy of the file from your artifact node's store.
          {:else}
            Download through your artifact node, which checks what arrives
            against the CID. Fetch only adds it to the node's store.
          {/if}
        </label>
        {#if nodeRunning === false}
          <div class="start-command">
            <Command command={START_COMMAND} styleWidth="100%" />
          </div>
        {/if}
        <div class="actions">
          <Button
            styleWidth="100%"
            disabled={running !== undefined || nodeRunning === false}
            title={nodeRunning === false
              ? "Your artifact node is not running"
              : undefined}
            onclick={() => transfer("download")}>
            <Icon name="download" />
            {running === "download"
              ? seeding
                ? "Saving…"
                : "Downloading…"
              : downloadLabel}
          </Button>
          {#if !seeding}
            <Button
              styleWidth="100%"
              disabled={running !== undefined || nodeRunning === false}
              title={nodeRunning === false
                ? "Your artifact node is not running"
                : "Fetch into your artifact node's store without saving a file"}
              onclick={() => transfer("fetch")}>
              <Icon name="arrow-down" />
              {running === "fetch" ? "Fetching…" : "Fetch"}
            </Button>
          {/if}
        </div>

        {#if running}
          <div class="progress-track">
            <div class="progress-bar" style:width="{percent ?? 0}%"></div>
          </div>
          <div class="status">
            <span>{phaseLabel}</span>
            {#if progress?.offset !== undefined}
              <span>
                {formatBytes(progress.offset)}{progress.total
                  ? ` / ${formatBytes(progress.total)}`
                  : ""}
              </span>
            {/if}
          </div>
        {:else if finished}
          <div class="success">
            <Icon name="checkmark" />
            {finished === "download" ? "Saved" : "Fetched"}{seeding
              ? " and seeding"
              : ""}.
          </div>
        {/if}

        {#if downloadError}
          <div class="error">{downloadError}</div>
        {/if}

        {#if !seeding}
          <div class="seed-option">
            <Checkbox bind:checked={seed}>Seed after fetching</Checkbox>
          </div>
        {/if}
      {:else if activeTab === "cli"}
        {#if nodeRunning === false}
          <label for="start-command">
            Your artifact node is not running. Start it with:
          </label>
          <div class="start-command">
            <Command command={START_COMMAND} styleWidth="100%" />
          </div>
        {/if}
        <label for="download-command">
          Use the Radicle Artifact CLI to download this artifact.
        </label>
        <Command {command} styleWidth="100%" />
      {:else}
        <div class="warning">
          <Icon name="warning" />
          These downloads are not checked against the CID.
        </div>
        {#if authorTrusted && linksByOthers}
          <div class="untrusted">
            <UntrustedWarning
              text="Links without a delegate badge are not from a delegate. Only use them if you trust who added them." />
          </div>
        {/if}
        <div class="locations">
          {#each webLocations as location (`${location.user.did}:${location.url}`)}
            <div class="location">
              {#if delegateIds.has(location.user.did)}
                <DelegateBadge tooltip="Location added by a delegate" />
              {/if}
              <span class="url" title={location.url}>{location.url}</span>
              <ExternalLink href={location.url} title="Download" />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</Popover>
