<script lang="ts">
  import { hide } from "@app/lib/modal";
  import { seedRepo } from "@app/lib/seedRepo";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    url?: string;
    host: string;
    /** Set when the repo itself is missing, which seeding can fix. */
    rid?: string;
  }

  const { url, host, rid }: Props = $props();

  let seeding = $state(false);
  let error = $state<string | undefined>(undefined);

  async function seed() {
    if (!rid || seeding) return;
    seeding = true;
    error = undefined;
    try {
      await seedRepo(rid);
      hide();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to seed this repo.";
    } finally {
      seeding = false;
    }
  }

  async function open() {
    if (!url) return;
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    hide();
  }
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
  .error {
    color: var(--color-feedback-error-text);
  }
  .url {
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
    word-break: break-all;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.5rem 1.5rem;
  }
  .confirm-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">Not on this node</span>
  </div>

  <div class="body">
    {#if rid}
      <span>
        This repo isn't on this node. Seeding it fetches it from the network and
        keeps it replicated{#if url}; it can also be viewed on {host}{/if}.
      </span>
      <span class="url">{rid}</span>
    {:else}
      <span>
        This app has no page for the link, but it can be viewed on {host}.
      </span>
      <span class="url">{url}</span>
    {/if}
    {#if error}
      <span class="error">{error}</span>
    {/if}
  </div>

  <div class="actions">
    <Button variant="outline" onclick={hide}>Cancel</Button>
    {#if url}
      <Button variant={rid ? "outline" : "ghost"} onclick={() => void open()}>
        <span class="confirm-label">
          <Icon name="open-external" />
          Open in {host}
        </span>
      </Button>
    {/if}
    {#if rid}
      <Button variant="ghost" disabled={seeding} onclick={() => void seed()}>
        <span class="confirm-label">
          <Icon name="seed" />
          {seeding ? "Seeding…" : "Seed"}
        </span>
      </Button>
    {/if}
  </div>
</div>
