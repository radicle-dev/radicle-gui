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
        ? { icon: "issue" as const, color: "var(--color-text-open)" }
        : { icon: "issue-closed" as const, color: "var(--color-text-closed)" };
    }
    switch (state) {
      case "merged":
        return { icon: "patch-merged" as const, color: "var(--color-text-merged)" };
      case "draft":
        return { icon: "patch-draft" as const, color: "var(--color-text-draft)" };
      case "archived":
        return { icon: "patch-archived" as const, color: "var(--color-text-archived)" };
      default:
        return { icon: "patch" as const, color: "var(--color-text-open)" };
    }
  });
</script>

<span style:color={look.color} style:display="inline-flex">
  <Icon name={look.icon} />
</span>
