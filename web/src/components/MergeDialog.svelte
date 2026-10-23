<script lang="ts">
  import type { Patch, Repo } from "@app/node/model";

  import { copy, shortId } from "@app/lib/utils";

  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    open: boolean;
    repo: Repo;
    patch: Patch;
    // Stands in for the push in the prototype, which has no terminal.
    onSimulatePush: () => void;
  }

  /* eslint-disable prefer-const */
  let { open = $bindable(), repo, patch, onSimulatePush }: Props = $props();
  /* eslint-enable prefer-const */

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  const branch = $derived(`patch/${shortId(patch.id)}`);
  const steps = $derived([
    { label: "Check out the latest revision", cmd: `rad patch checkout ${shortId(patch.id)}` },
    { label: `Switch to ${repo.defaultBranch} and merge it`, cmd: `git checkout ${repo.defaultBranch} && git merge ${branch}` },
    { label: "Push your signed branch", cmd: `git push rad ${repo.defaultBranch}` },
  ]);
  const all = $derived(steps.map(s => s.cmd).join("\n"));
</script>

<style>
  dialog {
    width: min(34rem, calc(100vw - 2rem));
    box-sizing: border-box;
    padding: 1.25rem;
    background: var(--color-surface-canvas);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-lg);
    box-shadow: 0 24px 64px rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: var(--color-surface-scrim);
  }
  h2 {
    font: var(--txt-heading-s);
    margin: 0 0 0.375rem;
  }
  p {
    margin: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  ol {
    list-style: none;
    margin: 1rem 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .label {
    display: block;
    margin-bottom: 0.25rem;
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .cmd {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.375rem 0.25rem 0.375rem 0.625rem;
  }
  .cmd span {
    flex: 1;
    overflow-x: auto;
    white-space: nowrap;
  }
  .after {
    display: flex;
    gap: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-regular);
    color: var(--color-text-secondary);
  }
  .after strong {
    color: var(--color-text-primary);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }
  .simulate {
    all: unset;
    cursor: pointer;
    margin-right: auto;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .simulate:hover {
    color: var(--color-text-primary);
  }
</style>

<dialog
  bind:this={dialog}
  onclose={() => (open = false)}
  onclick={e => {
    if (e.target === dialog) open = false;
  }}>
  <h2>Merge from your terminal</h2>
  <p>
    Merging happens in your local copy, signed with your key. Run these in a clone of
    {repo.name}:
  </p>

  <ol>
    {#each steps as s, i (s.cmd)}
      <li>
        <span class="label">{i + 1}. {s.label}</span>
        <div class="cmd">
          <span>{s.cmd}</span>
          <Button variant="naked" styleHeight="1.5rem" title="Copy" ariaLabel="Copy command" onclick={() => copy(s.cmd, "command")}>
            <Icon name="copy" />
          </Button>
        </div>
      </li>
    {/each}
  </ol>

  <div class="after">
    <Icon name="patch-merged" />
    <span>
      <strong>When does it show as merged?</strong>
      When your push reaches this node, it sees that {repo.defaultBranch} contains the patch's
      commits and marks it merged.
      {#if repo.threshold > 1}
        {repo.defaultBranch} itself only moves for everyone once {repo.threshold} of
        {repo.delegates.length} delegates have the merge in their copy.
      {/if}
    </span>
  </div>

  <div class="actions">
    <button
      class="simulate"
      title="The prototype has no terminal, so this stands in for the push"
      onclick={() => {
        open = false;
        onSimulatePush();
      }}>
      Simulate the push (prototype)
    </button>
    <Button variant="ghost" onclick={() => copy(all, "commands")}><Icon name="copy" /> Copy all</Button>
    <Button variant="secondary" onclick={() => (open = false)}>Done</Button>
  </div>
</dialog>
