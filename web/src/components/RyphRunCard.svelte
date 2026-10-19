<script lang="ts">
  import type { Check, Repo, RyphRun } from "@app/node/model";

  import { fullDate, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    repo: Repo;
    run: RyphRun;
    stepsDone: number;
    finished: boolean;
    checks: Check[];
    compact?: boolean;
  }

  const { repo, run, stepsDone, finished, checks, compact = false }: Props = $props();

  const agent = $derived(node.world.ryph.agents[run.agent]);
  const conn = $derived(node.ryphFor(repo));
  const patch = $derived(run.patch ? repo.patches.find(p => p.id === run.patch) : undefined);
  const current = $derived(run.plan[stepsDone]);
  let expanded = $state(false);
  const showSteps = $derived(!finished || expanded);
</script>

<style>
  .run {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    overflow: hidden;
  }
  .run.live {
    border-color: var(--color-border-brand);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    font: var(--txt-body-m-regular);
    flex-wrap: wrap;
  }
  .who {
    font: var(--txt-body-m-medium);
  }
  .id {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.0625rem 0.375rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-medium);
  }
  .status.running {
    background: var(--color-surface-brand-subtle, var(--color-surface-subtle));
    color: var(--color-text-brand);
  }
  .status.done {
    background: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .spinner {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .toggle {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
    padding: 0.125rem 0.25rem;
    border-radius: var(--border-radius-sm);
  }
  .toggle:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .instruction {
    padding: 0 0.75rem 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .steps {
    border-top: 1px solid var(--color-border-subtle);
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--color-surface-base);
  }
  .step {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-quaternary);
  }
  .step.done {
    color: var(--color-text-secondary);
  }
  .step.current {
    color: var(--color-text-primary);
  }
  .mark {
    width: 1rem;
    display: inline-flex;
    justify-content: center;
  }
  .ok {
    color: var(--color-feedback-success-text);
    display: inline-flex;
  }
  .checks {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.375rem;
    height: 1.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    font: var(--txt-code-small);
    color: var(--color-text-secondary);
  }
  .check.passed {
    color: var(--color-feedback-success-text);
  }
  .check.queued {
    color: var(--color-text-quaternary);
  }
  .result {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
</style>

<div class="run" class:live={!finished}>
  <div class="head">
    <Avatar person={run.agent} size="1.125rem" />
    <span class="who">{agent?.name ?? "Agent"}</span>
    <span class="caption">
      {#if compact}
        run for
      {:else}
        run requested by
      {/if}
    </span>
    {#if compact}
      <a class="link" href={`${node.repoPath(repo)}/${run.thread.kind === "issue" ? "issues" : "patches"}/${run.thread.id}`}>
        {run.thread.title}
      </a>
    {:else}
      <span>{node.person(run.requestedBy).alias}</span>
    {/if}
    <span class="id">run {run.id}</span>
    <div class="right">
      {#if finished}
        <span class="status done"><Icon name="checkmark" />Done</span>
      {:else}
        <span class="status running"><span class="spinner"></span>{current?.label ?? "Queued"}…</span>
      {/if}
      <span class="caption txt-body-s-regular" title={fullDate(run.startedAt)}>{timeAgo(run.startedAt, node.now)}</span>
      {#if finished}
        <button class="toggle" onclick={() => (expanded = !expanded)}>
          {expanded ? "Hide steps" : "Steps"}<Icon name={expanded ? "chevron-up" : "chevron-down"} />
        </button>
      {/if}
    </div>
  </div>
  {#if run.instruction && !compact}
    <div class="instruction">“{run.instruction}”</div>
  {/if}
  {#if showSteps}
    <div class="steps">
      {#each run.plan as step, i (i)}
        <div class="step" class:done={i < stepsDone} class:current={i === stepsDone && !finished}>
          <span class="mark">
            {#if i < stepsDone}
              <span class="ok"><Icon name="checkmark" /></span>
            {:else if i === stepsDone && !finished}
              <span class="spinner"></span>
            {:else}
              ·
            {/if}
          </span>
          {step.label}
        </div>
      {/each}
    </div>
  {/if}
  {#if checks.length > 0}
    <div class="checks">
      {#each checks as check (check.name)}
        <span class={`check ${check.status}`}>
          {#if check.status === "passed"}<Icon name="checkmark" />{:else if check.status === "running"}<span class="spinner"></span>{:else}<Icon name="clock" />{/if}
          ryph / {check.name}
        </span>
      {/each}
    </div>
  {/if}
  {#if finished && (patch || run.summary)}
    <div class="result">
      {#if patch}
        <Icon name="patch" />
        <a class="link" href={`${node.repoPath(repo)}/patches/${patch.id}`}>{patch.title}</a>
        <span class="caption">{run.kind === "review" ? "updated" : "opened"} on {conn?.instance ?? "Ryph"}</span>
      {:else}
        <span class="caption">{run.summary}</span>
      {/if}
    </div>
  {/if}
</div>
