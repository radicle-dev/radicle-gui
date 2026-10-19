<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";

  import Button from "@app/components/Button.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";

  interface Props {
    repo: Repo;
  }

  const { repo }: Props = $props();

  let title = $state("");
  let body = $state("");
  let labels = $state<string[]>([]);
  let mode = $state<"write" | "preview">("write");

  const known = $derived([...new Set(repo.issues.flatMap(i => i.labels))].sort());
  const base = $derived(node.repoPath(repo));

  function submit() {
    const id = node.do({
      type: "createIssue",
      rid: repo.rid,
      title: title.trim(),
      body: body.trim(),
      labels,
    });
    if (id) navigate(`${base}/issues/${id}`);
  }
</script>

<style>
  .form {
    max-width: 48rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  h1 {
    font: var(--txt-heading-l);
    margin: 0;
  }
  .labels {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .labels button {
    all: unset;
    cursor: pointer;
    font: var(--txt-body-s-medium);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-full);
    padding: 0.125rem 0.5rem;
    color: var(--color-text-secondary);
  }
  .labels button.on {
    background: var(--color-surface-brand-primary);
    border-color: var(--color-surface-brand-primary);
    color: var(--color-text-on-brand);
  }
  .preview {
    min-height: 10rem;
    padding: 0.75rem;
  }
  textarea {
    min-height: 12rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>

<div class="form">
  <h1>New issue</h1>
  <div class="field">
    <label for="title">Title</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="title" class="input" bind:value={title} autofocus placeholder="What's going on?" />
  </div>
  <div class="field">
    <div class="row" style="justify-content: space-between;">
      <span class="label">Description</span>
      <SegmentedSwitch
        options={[
          { value: "write", label: "Write" },
          { value: "preview", label: "Preview" },
        ]}
        value={mode}
        onchange={v => (mode = v)} />
    </div>
    {#if mode === "write"}
      <textarea class="textarea" bind:value={body} placeholder="Steps to reproduce, what you expected, what happened. Markdown works."></textarea>
    {:else}
      <div class="card preview">
        {#if body.trim()}<Markdown content={body} compact />{:else}<span class="muted">Nothing to preview</span>{/if}
      </div>
    {/if}
  </div>
  {#if known.length > 0}
    <div class="field">
      <span class="label">Labels</span>
      <div class="labels">
        {#each known as l (l)}
          <button
            class:on={labels.includes(l)}
            onclick={() =>
              (labels = labels.includes(l) ? labels.filter(x => x !== l) : [...labels, l])}>
            {l}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  <div class="actions">
    <Button variant="naked" onclick={() => navigate(`${base}/issues`)}>Cancel</Button>
    <Button variant="secondary" disabled={!title.trim()} onclick={submit}>Open issue</Button>
  </div>
  <span class="muted txt-body-s-regular">
    Your issue is signed with your key and announced to {repo.seedCount} seeding nodes.
  </span>
</div>
