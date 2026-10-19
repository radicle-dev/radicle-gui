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
</style>

<a href="/node" title="Your node runs in this tab">
  <span
    class="dot"
    class:pulse={net.status === "starting" || net.status === "connecting"}
    style:background={color}></span>
  Node · {label}
</a>
