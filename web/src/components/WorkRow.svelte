<script lang="ts">
  import type { IssueState, PatchState } from "@app/node/model";

  import StateIcon from "./StateIcon.svelte";

  interface Props {
    kind: "issue" | "patch";
    state: IssueState | PatchState;
    title: string;
    meta: string;
    href: string;
    status?: { label: string; tone?: "good" | "bad" | "brand" };
  }

  const { kind, state, title, meta, href, status }: Props = $props();
</script>

<style>
  a {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    color: inherit;
    text-decoration: none;
  }
  a:last-child {
    border-bottom: none;
  }
  a:hover {
    background: var(--color-surface-subtle);
  }
  .state {
    display: inline-flex;
    padding-top: 0.125rem;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .title {
    font: var(--txt-body-m-semibold);
  }
  .meta {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    height: 1.25rem;
    padding: 0 0.4375rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-medium);
    color: var(--color-text-secondary);
    background: var(--color-surface-subtle);
    white-space: nowrap;
  }
  .status.good {
    color: var(--color-feedback-success-text);
    background: color-mix(in srgb, var(--color-feedback-success-text) 12%, transparent);
  }
  .status.bad {
    color: var(--color-feedback-error-text);
    background: color-mix(in srgb, var(--color-feedback-error-text) 10%, transparent);
  }
  .status.brand {
    color: var(--color-text-brand);
    background: color-mix(in srgb, var(--color-surface-brand-primary) 12%, transparent);
  }
  @media (max-width: 600px) {
    a {
      flex-wrap: wrap;
      row-gap: 0.375rem;
    }
    .status {
      order: 3;
      margin-left: 1.75rem;
    }
  }
</style>

<a {href}>
  <span class="state"><StateIcon {kind} {state} /></span>
  <span class="body">
    <span class="title">{title}</span>
    <span class="meta">{meta}</span>
  </span>
  {#if status}
    <span class="status" class:good={status.tone === "good"} class:bad={status.tone === "bad"} class:brand={status.tone === "brand"}>
      {status.label}
    </span>
  {/if}
</a>
