<script lang="ts">
  import type { RepoSyncStatus } from "@bindings/node/RepoSyncStatus";
  import type { SeedStatus } from "@bindings/node/SeedStatus";

  import { invoke } from "@app/lib/invoke";
  import {
    formatOid,
    formatTimestamp,
    pluralize,
    truncateId,
  } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import Spinner from "@app/components/Spinner.svelte";

  interface Props {
    rid: string;
  }

  const { rid }: Props = $props();

  let expanded = $state(false);
  let syncStatus = $state<RepoSyncStatus | undefined>(undefined);
  let loaded = $state(false);
  let announcing = $state(false);
  let announced = $state(false);

  // The replication factor drives the colour but is never named: a count below
  // it should look low without the panel lecturing about targets. A repository
  // we have never pushed to reports nothing, so it stays neutral rather than
  // reading as under-replicated.
  const replicated = $derived(
    syncStatus ? syncStatus.synced >= syncStatus.target : false,
  );
  const underReplicated = $derived(
    syncStatus
      ? syncStatus.tracked > 0 && syncStatus.synced < syncStatus.target
      : false,
  );
  const available = $derived(syncStatus?.available ?? false);
  const seedCount = $derived(syncStatus?.seeds.length ?? 0);
  // Measured against the same total shown beside the summary, so the bar and
  // the figure next to it cannot disagree. It sits low even on a healthy
  // repository, since the total counts every seed that holds the repo at all.
  const syncedShare = $derived(
    syncStatus && seedCount > 0 ? (syncStatus.synced / seedCount) * 100 : 0,
  );

  // Announcing advertises our refs so seeds holding the repository fetch them,
  // which is what moves the replicated count up. Only offered when below the
  // recommended number, where it is the one thing worth doing about it.
  async function announce() {
    if (announcing) return;
    announcing = true;
    try {
      await invoke("announce_repo", { rid });
      announced = true;
      await load();
    } catch {
      announced = false;
    } finally {
      announcing = false;
    }
  }

  async function load() {
    try {
      syncStatus = await invoke<RepoSyncStatus>("repo_sync_status", { rid });
    } catch {
      // The node can go down between polls. Keep the last known figures rather
      // than blanking the count in the header.
    } finally {
      loaded = true;
    }
  }

  // The count is fetched once so the header can show it, then polled only while
  // the popover is open — the seed list is an IPC round trip per refresh and
  // nobody is watching it the rest of the time.
  $effect(() => {
    void rid;
    void load();
  });

  $effect(() => {
    if (!expanded) {
      announced = false;
      return;
    }
    const interval = setInterval(() => void load(), 5_000);
    return () => clearInterval(interval);
  });

  // `SyncedAt.timestamp` is seconds since epoch; `formatTimestamp` takes
  // milliseconds.
  function syncedAt(seed: SeedStatus): number | undefined {
    if (!seed.sync) return undefined;
    const seconds =
      seed.sync.status === "synced"
        ? seed.sync.at.timestamp
        : seed.sync.remote.timestamp;
    return seconds * 1000;
  }

  function syncedOid(seed: SeedStatus): string | undefined {
    if (!seed.sync) return undefined;
    return seed.sync.status === "synced"
      ? seed.sync.at.oid
      : seed.sync.remote.oid;
  }
</script>

<style>
  /* Matches the `.meta-item` rhythm in RepoHeader so this reads as one of the
     header's facts rather than a control bolted on. */
  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0.25rem;
    margin: -0.125rem -0.25rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    font: var(--txt-body-m-regular);
    cursor: pointer;
    white-space: nowrap;
  }
  .meta-item:hover,
  .meta-item.active {
    background-color: var(--color-surface-subtle);
  }
  .meta-label {
    color: var(--color-text-secondary);
  }
  .meta-value {
    color: var(--color-text-primary);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background-color: var(--color-border-strong);
    flex-shrink: 0;
  }
  .dot.ok {
    background-color: var(--color-text-brand);
  }
  .dot.stale {
    background-color: var(--color-feedback-warning-text);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 24rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .summary.ok {
    color: var(--color-text-brand);
  }
  .summary.stale {
    color: var(--color-feedback-warning-text);
  }
  .sync {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bar {
    height: 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    /* Any non-zero replication should read as a bar, not a sliver. */
    min-width: 0.5rem;
    background-color: var(--color-text-brand);
    transition: width 0.5s ease;
  }
  .bar-fill.empty {
    min-width: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar-fill {
      transition: none;
    }
  }
  .summary-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .under {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.625rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .total {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .seeds {
    display: flex;
    flex-direction: column;
    max-height: 14rem;
    overflow-y: auto;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .seed {
    display: grid;
    grid-template-columns: 0.5rem 1fr auto auto 1rem;
    align-items: center;
    gap: 0.625rem;
    padding: 0.3125rem 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .seed + .seed {
    border-top: 1px solid var(--color-border-subtle);
  }
  .seed:hover {
    background-color: var(--color-surface-subtle);
  }
  /* Seeds holding stale refs recede, so the up-to-date ones read first in a
     list that can run to a couple of hundred rows. */
  .seed.stale {
    color: var(--color-text-tertiary);
  }
  .seed-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background-color: var(--color-border-strong);
  }
  .seed-dot.connected {
    background-color: var(--color-text-brand);
    box-shadow: 0 0 0 3px var(--color-surface-brand-subtle);
  }
  .seed-oid {
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
  }
  .seed-time {
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .seed-state {
    display: inline-flex;
    justify-content: center;
  }
  .seed-state.synced {
    color: var(--color-text-brand);
  }
  .seed-state.out-of-sync {
    color: var(--color-text-tertiary);
  }
  .empty {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
</style>

<Popover popoverPadding="0" placement="bottom-end" bind:expanded>
  {#snippet toggle(onclick)}
    <button
      type="button"
      class="meta-item"
      class:active={expanded}
      title="Seeds holding this repository"
      {onclick}>
      <span class="meta-label">Seeds</span>
      <span
        class="dot"
        class:ok={available && replicated}
        class:stale={available && underReplicated}>
      </span>
      <span class="meta-value">
        {loaded && available ? seedCount : "—"}
      </span>
    </button>
  {/snippet}

  {#snippet popover()}
    <div class="card">
      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if !available}
        <div class="empty">
          Your node is not running, so its seeds can't be listed.
        </div>
      {:else if syncStatus}
        {#if seedCount === 0}
          <div class="empty">No seeds have announced this repository yet.</div>
          <!-- Nothing of ours to replicate here, so there is no sync summary to
             show; the header already carries the seed count and the list is
             directly below. -->
        {:else if syncStatus.tracked > 0}
          <div class="sync">
            <div class="summary-row">
              <div
                class="summary"
                class:ok={replicated}
                class:stale={underReplicated}>
                <!-- Names the subject: the count is seeds holding our refs at
                     our current head, not seeds holding the repository, which
                     is the larger number shown to the right. -->
                {#if syncStatus.synced > 0}
                  Your changes replicated to {syncStatus.synced}
                  {pluralize("seed", syncStatus.synced)}
                {:else}
                  Your changes haven't replicated yet
                {/if}
              </div>
              <!-- Bare number: the summary on the left already says "seeds". -->
              <span class="total">{seedCount}</span>
            </div>
            <div class="bar">
              <div
                class="bar-fill"
                class:empty={syncStatus.synced === 0}
                style:width="{syncedShare}%">
              </div>
            </div>
            <!-- Names where the number comes from and offers the one action
                 that moves it: announcing tells seeds to fetch our refs. -->
            {#if underReplicated}
              <div class="under">
                <span>
                  Radicle recommends your changes reach at least
                  {syncStatus.target} seeds, so they stay available if a seed goes
                  offline.
                </span>
                <Button
                  variant="ghost"
                  styleHeight="1.5rem"
                  disabled={announcing}
                  title="Announce your refs so seeds fetch them"
                  onclick={() => void announce()}>
                  <span style:color="var(--color-text-tertiary)">
                    {#if announcing}
                      <Spinner />
                    {:else}
                      <Icon name={announced ? "checkmark" : "refresh"} />
                    {/if}
                  </span>
                  {announcing
                    ? "Announcing"
                    : announced
                      ? "Announced"
                      : "Announce"}
                </Button>
              </div>
            {/if}
          </div>
        {/if}

        {#if seedCount > 0}
          <div class="seeds">
            {#each syncStatus.seeds as seed (seed.nid)}
              {@const at = syncedAt(seed)}
              {@const oid = syncedOid(seed)}
              <div class="seed" class:stale={seed.sync?.status === "outOfSync"}>
                <span class="seed-dot" class:connected={seed.connected}></span>
                <span class="txt-overflow">
                  {seed.alias ?? truncateId(seed.nid)}
                </span>
                <span class="seed-oid">{oid ? formatOid(oid) : ""}</span>
                <span class="seed-time">{at ? formatTimestamp(at) : ""}</span>
                <span
                  class="seed-state"
                  class:synced={seed.sync?.status === "synced"}
                  class:out-of-sync={seed.sync?.status === "outOfSync"}>
                  {#if seed.sync}
                    <Icon
                      name={seed.sync.status === "synced"
                        ? "checkmark"
                        : "close"} />
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/snippet}
</Popover>
