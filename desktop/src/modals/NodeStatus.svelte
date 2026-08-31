<script lang="ts">
  import type { NodeStatus } from "@bindings/node/NodeStatus";
  import type { PublishChange } from "@bindings/node/PublishChange";
  import type { PublishKind } from "@bindings/node/PublishKind";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { formatTimestamp, pluralize, truncateId } from "@app/lib/utils";

  import Command from "@app/components/Command.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  let status = $state<NodeStatus | undefined>(undefined);

  // `$nodeRunning` is fed by a Tauri event, so it stays false outside the Tauri
  // runtime. Once a status has been fetched, prefer that: it reports the node
  // the backend actually talked to.
  const running = $derived(status?.running ?? $nodeRunning);

  // `formatTimestamp` returns "now" for anything under a minute, which does not
  // take "ago". Everywhere else in the app uses the bare form, so the suffix is
  // handled here rather than in the shared helper.
  function relativeTime(timestamp: number): string {
    const elapsed = formatTimestamp(timestamp);
    return elapsed === "now" ? "just now" : `${elapsed} ago`;
  }

  const sync = $derived(status?.sync);
  const reached = $derived(sync?.latest?.confirmedAt !== undefined);

  // A patch's branch moves for a new patch and for a revision, but a comment
  // or edit moves only its collaborative object, so the three read differently.
  const KIND_LABELS: Record<PublishKind, Record<PublishChange, string>> = {
    patch: {
      created: "Latest patch",
      revised: "Latest patch revision",
      updated: "Latest patch update",
    },
    issue: {
      created: "Latest issue",
      revised: "Latest issue update",
      updated: "Latest issue update",
    },
    branch: {
      created: "Latest branch push",
      revised: "Latest branch push",
      updated: "Latest branch push",
    },
    mixed: {
      created: "Latest published change",
      revised: "Latest published change",
      updated: "Latest published change",
    },
  };
  const latestLabel = $derived(
    sync?.latest ? KIND_LABELS[sync.latest.kind][sync.latest.change] : "",
  );

  // Names for the collaborative-object actions worth calling out. Anything not
  // listed keeps the broader "patch update" wording rather than guessing a noun
  // for an action this was never taught about.
  const ACTION_LABELS: Record<string, string> = {
    comment: "comment",
    "revision.comment": "comment",
    "review.comment": "review comment",
    review: "review",
    edit: "edit",
    merge: "merge",
  };

  // Object titles are free text and can be far longer than the line.
  function truncate(title: string): string {
    return title.length > 42 ? `${title.slice(0, 41)}…` : title;
  }

  // Prefer naming the action and the object it was on; fall back to the kind
  // and the repository when the action is unknown or the title is unavailable.
  const latestSubject = $derived.by(() => {
    const latest = sync?.latest;
    if (!latest) return "";
    const action = latest.action ? ACTION_LABELS[latest.action] : undefined;
    if (action && latest.title) {
      return `Latest ${action} on ${truncate(latest.title)}`;
    }
    return latest.name ? `${latestLabel} on ${latest.name}` : latestLabel;
  });

  async function load() {
    try {
      status = await invoke<NodeStatus>("node_status");
    } catch {
      // The node can go down between polls. Keep the last known figures rather
      // than blanking the modal.
    }
  }

  // Poll while the modal is open. `$nodeRunning` is in the dependency list so
  // the figures refresh as soon as the node comes up or goes down, rather than
  // waiting out the interval.
  $effect(() => {
    void $nodeRunning;
    void load();
    const interval = setInterval(() => void load(), 5_000);
    return () => clearInterval(interval);
  });
</script>

<style>
  .modal {
    width: 40rem;
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  /* The identity block, laid out like an ID card: who this node is comes
     first, and the figures below belong to it. */
  .identity {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.625rem;
    padding: 2rem 1.5rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .avatar {
    width: 4.5rem;
    height: 4.5rem;
    overflow: hidden;
    flex-shrink: 0;
    border-radius: var(--border-radius-sm);
  }
  .avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .alias {
    font: var(--txt-heading-l);
    color: var(--color-text-primary);
    text-align: center;
    max-width: 100%;
  }
  .nid {
    display: flex;
    justify-content: center;
    margin-top: -0.25rem;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .status.online {
    color: var(--color-text-brand);
  }

  /* A small beacon rather than the plain dot it replaced: the one thing this
     modal exists to answer should look alive when it is. */
  .pulse {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
  .pulse-core {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background-color: var(--color-text-tertiary);
    z-index: 1;
  }
  .status.online .pulse-core {
    background-color: var(--color-text-brand);
  }
  .pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px solid var(--color-text-brand);
    opacity: 0;
    animation: pulse 2.6s cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
  }
  .pulse-ring.delayed {
    animation-delay: 1.3s;
  }
  @keyframes pulse {
    0% {
      transform: scale(0.4);
      opacity: 0.6;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }
  /* A ring that never stops moving is the kind of thing motion sensitivity
     settings exist for. */
  @media (prefers-reduced-motion: reduce) {
    .pulse-ring {
      animation: none;
      opacity: 0.3;
      transform: scale(0.75);
    }
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1.5rem 1rem;
  }
  .stat + .stat {
    border-left: 1px solid var(--color-border-subtle);
  }
  .stat-value {
    font: var(--txt-heading-xl);
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }
  .stat-label {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    text-align: center;
  }
  .caption {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    text-align: center;
    max-width: 24rem;
  }
  .action {
    display: flex;
    justify-content: center;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid var(--color-border-subtle);
  }

  /* Whether our own work has actually left this machine. Distinct from being
     online and from having peers: a node can be connected to ten peers and
     still hold changes none of them have. */
  .propagation {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid var(--color-border-subtle);
    text-align: center;
  }
  .propagation-headline {
    font: var(--txt-body-m-medium);
    color: var(--color-text-brand);
  }
  .propagation-headline.pending {
    color: var(--color-feedback-warning-text);
  }
  .propagation-detail {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
</style>

<div class="modal">
  <div class="identity">
    {#if status}
      <div class="avatar">
        <UserAvatar nodeId={status.nid} styleWidth="4.5rem" />
      </div>
      <div class="alias txt-overflow">{status.alias}</div>
      <div class="nid">
        <CopyableId id={status.nid}>
          {truncateId(status.nid)}
        </CopyableId>
      </div>
    {/if}
    <span class="status" class:online={running}>
      <span class="pulse">
        <span class="pulse-core"></span>
        {#if running}
          <span class="pulse-ring"></span>
          <span class="pulse-ring delayed"></span>
        {/if}
      </span>
      {running ? "Online" : "Offline"}
    </span>
    <div class="caption">
      {#if !running}
        Changes you make are safe, but won't be announced
      {:else if status && status.listenAddrs.length > 0}
        Listening for inbound connections on {status.listenAddrs.join(", ")}
      {:else if status}
        Not configured to listen for inbound connections
      {/if}
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <span class="stat-value">{status?.connectedPeers ?? "—"}</span>
      <span class="stat-label">
        {status ? pluralize("peer", status.connectedPeers) : "Peers"} connected
      </span>
    </div>
    <div class="stat">
      <span class="stat-value">{status?.seeding ?? "—"}</span>
      <span class="stat-label">
        {status ? pluralize("repository", status.seeding) : "Repositories"}
        seeding
      </span>
    </div>
  </div>

  {#if sync?.latest}
    <div class="propagation">
      <div class="propagation-headline" class:pending={!reached}>
        {latestSubject}
        {#if sync.latest.confirmedAt !== undefined}
          reached {sync.latest.confirmedBy}
          {pluralize("node", sync.latest.confirmedBy)}
        {:else}
          hasn't reached another node yet
        {/if}
      </div>
      <div class="propagation-detail">
        {#if sync.latest.confirmedAt !== undefined}
          Confirmed {relativeTime(sync.latest.confirmedAt)}
        {:else}
          Published {relativeTime(sync.latest.publishedAt)}
        {/if}
      </div>
    </div>
  {/if}

  {#if !running}
    <div class="action">
      <Command styleWidth="fit-content" command="rad node start" />
    </div>
  {/if}
</div>
