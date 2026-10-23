<script lang="ts">
  import { node } from "@app/node/node.svelte";

  const net = node.network;

  const label = $derived.by(() => {
    switch (net.status) {
      case "starting":
        return "Starting node…";
      case "connecting":
        return "Connecting…";
      case "online":
        return `${net.peers.length} peers`;
      case "offline":
        return "Offline";
    }
  });
  const color = $derived(
    net.status === "online"
      ? "var(--color-feedback-success-fill)"
      : net.status === "offline"
        ? "var(--color-text-quaternary)"
        : "var(--color-feedback-warning-border)",
  );
</script>

<style>
  .short {
    display: none;
    font-variant-numeric: tabular-nums;
  }
  /* On narrower screens, just the status dot and the number of peers. */
  @media (max-width: 1100px) {
    .full {
      display: none;
    }
    .short {
      display: inline;
    }
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.625rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-full);
    color: var(--color-text-secondary);
    font: var(--txt-body-s-medium);
    text-decoration: none;
    white-space: nowrap;
  }
  a:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .pulse {
    animation: pulse 1s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from {
      opacity: 0.35;
    }
  }
  @media (max-width: 400px) {
    a {
      padding: 0 0.5rem;
      gap: 0;
    }
    .short {
      display: none;
    }
  }
</style>

<a href="/node" title={`Node · ${label}. Your node runs in this tab.`} aria-label={`Node · ${label}`}>
  <span
    class="dot"
    class:pulse={net.status === "starting" || net.status === "connecting"}
    style:background={color}></span>
  <span class="full">Node · {label}</span>
  {#if net.status === "online"}<span class="short">{net.peers.length}</span>{/if}
</a>
