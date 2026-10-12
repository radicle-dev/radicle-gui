<script lang="ts">
  import type { ArtifactBinaries } from "@bindings/artifact/ArtifactBinaries";
  import type { ArtifactNodeStatus } from "@bindings/artifact/ArtifactNodeStatus";

  import { artifactNodeRunning } from "@app/lib/events";
  import { poll } from "@app/lib/interval";
  import { invoke } from "@app/lib/invoke";
  import { formatBytes, formatUptime } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Popover from "@app/components/Popover.svelte";

  // Installs both `rad-artifact` and `rad-artifact-node`.
  const INSTALL_COMMAND =
    "curl -sSf https://files.radicle.dev/releases/radicle-artifact/install | sh";

  let popoverExpanded: boolean = $state(false);
  const running = $derived($artifactNodeRunning);
  let status: ArtifactNodeStatus | undefined = $state();
  let binaries: ArtifactBinaries | undefined = $state();

  // Undefined while the check is outstanding, so the guidance does not flash
  // "install" at someone who has it.
  const installed = $derived(
    binaries === undefined ? undefined : binaries.cli && binaries.node,
  );

  $effect(() => {
    if (!popoverExpanded) {
      return;
    }
    let cancelled = false;
    invoke<ArtifactBinaries>("artifact_binaries")
      .then(binaries_ => {
        if (!cancelled) {
          binaries = binaries_;
        }
      })
      .catch(() => {
        if (!cancelled) {
          binaries = undefined;
        }
      });
    return () => {
      cancelled = true;
    };
  });

  // Cleared on close, so a reopened popover never shows an old snapshot.
  $effect(() => {
    if (!popoverExpanded) {
      status = undefined;
      return;
    }
    return poll(async active => {
      try {
        const status_ = await invoke<ArtifactNodeStatus>(
          "artifact_node_status",
        );
        if (active()) {
          status = status_;
        }
      } catch {
        if (active()) {
          status = undefined;
        }
      }
    }, 3000);
  });

  const uptime = $derived(
    status
      ? formatUptime(Math.max(0, Date.now() / 1000 - status.startedAtUnix))
      : undefined,
  );
</script>

<style>
  .state {
    margin-left: auto;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .popover {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 32rem;
    padding: 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
  }
  .stats {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.375rem 1rem;
  }
  .key {
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .value {
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .endpoint {
    color: var(--color-text-secondary);
    word-break: break-all;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .detail {
    color: var(--color-text-tertiary);
  }
  .warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-feedback-warning-text);
  }
</style>

<Popover
  popoverPadding="0"
  placement="top-start"
  bind:expanded={popoverExpanded}>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      {onclick}
      active={popoverExpanded}
      styleWidth="100%"
      styleJustifyContent="flex-start">
      <span style:color="var(--color-text-tertiary)">
        <Icon name="parcel" />
      </span>
      Artifacts
      {#if running !== undefined}
        <span class="state">{running ? "Seeding" : "Offline"}</span>
      {/if}
    </Button>
  {/snippet}
  {#snippet popover()}
    <div class="popover">
      {#if status}
        {#if status.relayUnreachable}
          <div class="warning">
            <Icon name="warning" />
            No relay connected: peers may not reach this node.
          </div>
        {/if}
        <div class="stats">
          <span class="key">Endpoint</span>
          <span class="endpoint">
            <Id
              id={status.endpointId}
              clipboard={status.endpointId}
              label="endpoint"
              shorten={false} />
          </span>
          {#if status.version}
            <span class="key">Node version</span>
            <span class="value">{status.version}</span>
          {/if}
          {#if binaries?.cliVersion}
            <span class="key">CLI version</span>
            <span class="value">{binaries.cliVersion}</span>
          {/if}
          <span class="key">Uptime</span>
          <span class="value">{uptime}</span>
          <span class="key">Seeding</span>
          <span class="value">
            {status.seededCount}
            {status.seededCount === 1 ? "artifact" : "artifacts"}
            ({formatBytes(status.seededBytesLogical)})
          </span>
          <span class="key">Store</span>
          <span class="endpoint">
            <Id
              id={status.storePath}
              clipboard={status.storePath}
              label="store path"
              shorten={false} />
          </span>
          <span class="key">Connections</span>
          <span class="value">{status.connectionsActive} active</span>
          <span class="key">Traffic</span>
          <span class="value">
            {formatBytes(status.inBytes)} in, {formatBytes(status.outBytes)} out
          </span>
          <span class="key">Relay</span>
          {#if status.relays[0]}
            {@const relay = status.relays[0]}
            <span class="list" title={relay.lastError}>
              <span class="value">{relay.url}</span>
              <span class="detail">
                {#if relay.connected}
                  Connected{relay.latencyMs !== undefined
                    ? `, ${relay.latencyMs}ms`
                    : ""}
                {:else}
                  Disconnected
                {/if}
              </span>
            </span>
          {:else}
            <span class="value">None</span>
          {/if}
          {#if status.pkarrUri}
            <span class="key">Pkarr key</span>
            <span class="endpoint">
              <Id
                id={status.pkarrUri}
                clipboard={status.pkarrUri}
                label="pkarr key"
                shorten={false} />
            </span>
          {/if}
          {#if status.pkarrRelays.length > 0}
            <span class="key">Pkarr relays</span>
            <span class="list">
              {#each status.pkarrRelays as relay (relay)}
                <span class="endpoint">
                  <Id
                    id={relay}
                    clipboard={relay}
                    label="pkarr relay"
                    shorten={false} />
                </span>
              {/each}
            </span>
          {/if}
        </div>
      {:else if running === false && installed !== undefined}
        <div style:line-height="1.625rem">
          {#if installed}
            The artifact node is not running, so artifacts cannot be downloaded
            or seeded from this app.
          {:else if binaries?.cli}
            The artifact seeding daemon is not installed, so artifacts cannot be
            downloaded or seeded from this app.
          {:else}
            The artifact tools are not installed, so artifacts cannot be
            downloaded or seeded from this app.
          {/if}
          <div style:margin-top="1rem">
            {installed ? "Start it with:" : "Install them with:"}
            <div style:margin-top="0.5rem">
              {#if installed}
                <Command
                  styleWidth="fit-content"
                  command="rad-artifact node start" />
              {:else}
                <Command styleWidth="100%" command={INSTALL_COMMAND} />
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <span class="value">Checking the artifact node…</span>
      {/if}
    </div>
  {/snippet}
</Popover>
