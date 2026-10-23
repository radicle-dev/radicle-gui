<script lang="ts">
  import { fly } from "svelte/transition";

  import { motion } from "@app/lib/motion";
  import { dismiss, pause, resume, toasts } from "@app/lib/toast.svelte";

  import Icon from "./Icon.svelte";

  let now = $state(Date.now());
  const counting = $derived(toasts.some(t => t.countdown));

  $effect(() => {
    if (!counting) return;
    const interval = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(interval);
  });

  function secondsLeft(t: (typeof toasts)[number]) {
    return Math.max(1, Math.ceil((t.paused ? t.remaining : t.deadline - now) / 1000));
  }
</script>

<style>
  .toasts {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: max-content;
    max-width: calc(100vw - 2rem);
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.5rem;
    padding: 0 0.5rem 0 0.75rem;
    max-width: 100%;
    background: var(--color-surface-base);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
  }
  .message {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  button {
    background: none;
    border: 0;
    cursor: pointer;
  }
  .action {
    font: var(--txt-body-m-semibold);
    color: var(--color-text-brand);
    padding: 0.25rem 0.375rem;
    border-radius: var(--border-radius-sm);
    white-space: nowrap;
  }
  .seconds {
    font: var(--txt-body-m-regular);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-tertiary);
    margin-left: 0.25rem;
  }
  .action:hover,
  .close:hover {
    background: var(--color-surface-subtle);
  }
  .close {
    display: flex;
    padding: 0.25rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
  }
</style>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as t (t.id)}
    <div
      class="toast"
      role="presentation"
      transition:fly={motion({ y: 16, duration: 160 })}
      onmouseenter={() => pause(t.id)}
      onmouseleave={() => resume(t.id)}>
      {#if t.icon}
        <Icon name={t.icon} />
      {/if}
      <span class="message">{t.message}</span>
      {#if t.action}
        <button
          class="action"
          onclick={() => {
            t.action?.run();
            dismiss(t.id);
          }}>
          {t.action.label}
          {#if t.countdown}<span class="seconds">{secondsLeft(t)}s</span>{/if}
        </button>
      {/if}
      <button class="close" aria-label="Dismiss" onclick={() => dismiss(t.id)}>
        <Icon name="close" />
      </button>
    </div>
  {/each}
</div>
