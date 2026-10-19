<script lang="ts">
  import type { IssueState, PatchState } from "@app/node/model";

  import Icon from "./Icon.svelte";

  interface Props {
    kind: "issue" | "patch";
    state: IssueState | PatchState;
  }

  const { kind, state }: Props = $props();

  const look = $derived.by(() => {
    if (kind === "issue") {
      return state === "open"
        ? { icon: "issue" as const, label: "Open", tone: "open" }
        : {
            icon: "issue-closed" as const,
            label: state === "solved" ? "Solved" : "Closed",
            tone: "closed",
          };
    }
    switch (state) {
      case "merged":
        return { icon: "patch-merged" as const, label: "Merged", tone: "merged" };
      case "draft":
        return { icon: "patch-draft" as const, label: "Draft", tone: "draft" };
      case "archived":
        return { icon: "patch-archived" as const, label: "Archived", tone: "archived" };
      default:
        return { icon: "patch" as const, label: "Open", tone: "open" };
    }
  });
</script>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.5rem;
    padding: 0 0.5rem 0 0.375rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-semibold);
    white-space: nowrap;
  }
  .open {
    background: var(--color-surface-open);
    color: var(--color-text-open);
  }
  .merged {
    background: var(--color-surface-merged);
    color: var(--color-text-merged);
  }
  .closed {
    background: var(--color-surface-closed);
    color: var(--color-text-closed);
  }
  .draft {
    background: var(--color-surface-draft);
    color: var(--color-text-draft);
  }
  .archived {
    background: var(--color-surface-archived);
    color: var(--color-text-archived);
  }
</style>

<span class={`badge ${look.tone}`}>
  <Icon name={look.icon} />
  {look.label}
</span>
