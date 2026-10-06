<script lang="ts">
  import type { Card } from "@bindings/cob/board/Card";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { RepoSummary } from "@bindings/repo/RepoSummary";

  import { cardFor, cardKey, ISSUE_TYPE, PATCH_TYPE } from "@app/lib/board";
  import { invoke } from "@app/lib/invoke";
  import { disableHide, enableHide, hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    repos: RepoSummary[];
    onBoard: string[];
    add: (card: Card) => Promise<void>;
  }

  const { repos, onBoard, add }: Props = $props();

  // A board never names a private repository other than its own.
  const candidates = $derived(repos.filter(r => !r.private));

  let repo: RepoSummary | undefined = $state();
  let items: { card: Card; title: string; kind: "issue" | "patch" }[] = $state(
    [],
  );
  let loading = $state(false);
  let working = $state(false);
  let filter = $state("");
  let error = $state<string | undefined>(undefined);

  const shown = $derived(
    items.filter(i =>
      i.title.toLowerCase().includes(filter.trim().toLowerCase()),
    ),
  );

  async function pick(next: RepoSummary) {
    repo = next;
    loading = true;
    error = undefined;
    try {
      const [issues, patches] = await Promise.all([
        invoke<PaginatedQuery<Issue[]>>("list_issues", {
          rid: next.rid,
          status: "open",
        }),
        invoke<PaginatedQuery<Patch[]>>("list_patches", {
          rid: next.rid,
          status: "open",
        }),
      ]);
      items = [
        ...issues.content.map(i => ({
          card: cardFor(next.rid, ISSUE_TYPE, i.id),
          title: i.title,
          kind: "issue" as const,
        })),
        ...patches.content.map(p => ({
          card: cardFor(next.rid, PATCH_TYPE, p.id),
          title: p.title,
          kind: "patch" as const,
        })),
      ];
    } catch (e) {
      console.error("Loading the repository's cards failed", e);
      error = "Couldn't load this repository's issues and patches.";
      items = [];
    } finally {
      loading = false;
    }
  }

  async function choose(card: Card) {
    if (working) return;
    working = true;
    error = undefined;
    disableHide();
    try {
      await add(card);
      enableHide();
      hide();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ?? "Adding the card failed.");
      enableHide();
    } finally {
      working = false;
    }
  }
</script>

<style>
  .modal {
    width: 32rem;
    max-height: 32rem;
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
    gap: 0.5rem;
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
    gap: 0.5rem;
    padding: 1rem 1.5rem 1.5rem;
    overflow-y: auto;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2.25rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-align: left;
    cursor: pointer;
  }
  .option:hover:not(:disabled) {
    background-color: var(--color-surface-subtle);
  }
  .option:disabled {
    color: var(--color-text-tertiary);
    cursor: default;
  }
  .option .meta {
    margin-left: auto;
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .muted {
    color: var(--color-text-tertiary);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
</style>

<div class="modal">
  <div class="header">
    {#if repo}
      <Button variant="naked" onclick={() => (repo = undefined)}>
        <span style:color="var(--color-text-tertiary)">
          <Icon name="arrow-left" />
        </span>
      </Button>
    {/if}
    <span class="title txt-overflow">
      {repo ? `Add from ${repo.name}` : "Add a card from another repository"}
    </span>
    <span style:margin-left="auto">
      <Button variant="naked" onclick={hide}>
        <span style:color="var(--color-text-tertiary)">
          <Icon name="close" />
        </span>
      </Button>
    </span>
  </div>
  <div class="body">
    {#if !repo}
      {#each candidates as candidate (candidate.rid)}
        <button class="option" onclick={() => void pick(candidate)}>
          <Icon name="repository" />
          <span class="txt-overflow">{candidate.name}</span>
          <span class="meta">{candidate.rid.slice(0, 12)}…</span>
        </button>
      {:else}
        <span class="muted">
          No other public repositories on this device. Cards from private
          repositories can only go on their own repository's boards.
        </span>
      {/each}
    {:else}
      <TextInput autofocus placeholder="Filter" bind:value={filter} />
      {#if loading}
        <span class="muted">Loading…</span>
      {:else}
        {#each shown as item (cardKey(item.card))}
          {@const added = onBoard.includes(cardKey(item.card))}
          <button
            class="option"
            disabled={added || working}
            onclick={() => void choose(item.card)}>
            <Icon name={item.kind === "issue" ? "issue" : "patch"} />
            <span class="txt-overflow">{item.title}</span>
            <span class="meta">
              {added ? "On the board" : item.card.oid.slice(0, 7)}
            </span>
          </button>
        {:else}
          <span class="muted">No open issues or patches.</span>
        {/each}
      {/if}
    {/if}
    {#if error}
      <span class="error">{error}</span>
    {/if}
  </div>
</div>
