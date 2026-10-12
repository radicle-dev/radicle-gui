<script lang="ts">
  import type { Stats } from "@bindings/diff/Stats";

  interface Props {
    stats: Stats;
  }

  const { stats }: Props = $props();
</script>

<style>
  .diff-stat-badge {
    display: flex;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    height: 1.5rem;
    overflow: hidden;
  }

  .insertions {
    display: flex;
    padding: 0 0.5rem;
    align-items: center;
    color: var(--color-feedback-success-text);
  }
  .deletions {
    display: flex;
    padding: 0 0.5rem;
    align-items: center;
    color: var(--color-feedback-error-text);
    border-left: 1px solid var(--color-border-subtle);
  }
</style>

<div class="diff-stat-badge txt-code-regular">
  <div class="insertions">+{stats.insertions}</div>
  <div class="deletions">-{stats.deletions}</div>
</div>
