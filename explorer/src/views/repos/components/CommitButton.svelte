<script lang="ts">
  import type { BaseUrl, Commit } from "@http-client";

  import Button from "@app/components/Button.svelte";
  import Link from "@app/components/Link.svelte";
  import { formatCommit, unreachable } from "@app/lib/utils";

  export let variant: "standalone" | "right" | "center" | "left" = "standalone";
  export let styleMinWidth: string | undefined = undefined;
  export let styleWidth: "100%" | undefined = undefined;
  export let repoId: string;
  export let baseUrl: BaseUrl;
  export let hideSummaryOnMobile: boolean = true;
  export let commit: Commit["commit"];

  let styleBorderRadius: string | undefined = undefined;

  $: commitShortId = formatCommit(commit.id);
  $: if (variant === "right") {
    styleBorderRadius = "0 var(--border-radius-sm) var(--border-radius-sm) 0";
  } else if (variant === "standalone") {
    styleBorderRadius = "var(--border-radius-sm)";
  } else if (variant === "left") {
    styleBorderRadius = "var(--border-radius-sm) 0 0 var(--border-radius-sm)";
  } else if (variant === "center") {
    styleBorderRadius = "0";
  } else {
    unreachable(variant);
  }
</script>

<style>
  .commit {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .identifier {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>

<Link
  styleTextOverflow
  route={{
    resource: "repo.commit",
    repo: repoId,
    node: baseUrl,
    commit: commit.id,
  }}>
  <Button
    title="Current HEAD"
    variant="not-selected"
    {styleWidth}
    {styleMinWidth}
    {styleBorderRadius}>
    <div class="txt-overflow commit">
      <div class="identifier txt-id">
        {commitShortId}
      </div>
      <span
        class="txt-overflow"
        class:global-hide-on-small-desktop-down={hideSummaryOnMobile}>
        {commit.summary}
      </span>
    </div>
  </Button>
</Link>
