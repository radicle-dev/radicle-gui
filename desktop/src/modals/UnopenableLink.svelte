<script lang="ts">
  import { hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";

  interface Props {
    link: string;
    reason: "invalid" | "no-page" | "unsupported";
  }

  const { link, reason }: Props = $props();
</script>

<style>
  .modal {
    width: 26rem;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .link {
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
    word-break: break-all;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    padding: 0 1.5rem 1.5rem;
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">Can't open link</span>
  </div>

  <div class="body">
    <span>
      {#if reason === "invalid"}
        This isn't a valid rad: link.
      {:else if reason === "unsupported"}
        The app doesn't know how to open this link.
      {:else}
        Neither this app nor the explorer has a page for this link.
      {/if}
    </span>
    <span class="link">{link}</span>
  </div>

  <div class="actions">
    <Button variant="outline" onclick={hide}>Close</Button>
  </div>
</div>
