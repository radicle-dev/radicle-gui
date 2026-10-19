<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";
  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  interface Props {
    repo: Repo;
    kind: "issue" | "patch";
    // Posts the `/ryph …` command as a comment on the thread.
    onSummon: (body: string) => void;
    busy?: boolean;
  }

  const { repo, kind, onSummon, busy = false }: Props = $props();

  const conn = $derived(node.ryphFor(repo));
  const agents = $derived(conn ? conn.agents.map(id => node.world.ryph.agents[id]) : []);
  let agent = $state("mender");
  let instruction = $state("");

  const suggestion = $derived(
    agent === "mender"
      ? kind === "issue"
        ? "fix this"
        : "address the review"
      : agent === "scout"
        ? "find where this happens and explain it"
        : "label this and check for duplicates",
  );

  function send() {
    onSummon(`/ryph ${agent} ${instruction.trim() || suggestion}`);
    instruction = "";
    closeFocused();
  }
</script>

<style>
  .panel {
    width: 22rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .title {
    font: var(--txt-body-m-semibold);
  }
  .agents {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .agent {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid transparent;
  }
  .agent:hover {
    background: var(--color-surface-subtle);
  }
  .agent.selected {
    border-color: var(--color-border-brand);
  }
  .agent .name {
    font: var(--txt-body-m-medium);
  }
  .agent .does {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .preview {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>

{#if conn && node.canSummon(repo)}
  <Popover placement="bottom-end">
    {#snippet toggle(onclick)}
      <Button variant="naked" {onclick} disabled={busy} title={busy ? "An agent is already working on this" : "Ask a Ryph agent"}>
        <Icon name="lightbulb" />{busy ? "Agent working…" : "Ask Ryph"}
      </Button>
    {/snippet}
    {#snippet popover()}
      <div class="popover-panel panel">
        <span class="title">Ask a Ryph agent</span>
        <div class="agents">
          {#each agents as a (a.id)}
            <button class="agent" class:selected={agent === a.handle} onclick={() => (agent = a.handle)}>
              <Avatar person={a.id} size="1.25rem" />
              <div>
                <div class="name">{a.name}</div>
                <div class="does">{a.does}</div>
              </div>
            </button>
          {/each}
        </div>
        <input
          class="input"
          bind:value={instruction}
          placeholder={suggestion}
          onkeydown={e => e.key === "Enter" && send()} />
        <span class="preview">Posts: /ryph {agent} {instruction.trim() || suggestion}</span>
        <div class="actions">
          <Button variant="secondary" onclick={send}>Start run</Button>
        </div>
      </div>
    {/snippet}
  </Popover>
{/if}
