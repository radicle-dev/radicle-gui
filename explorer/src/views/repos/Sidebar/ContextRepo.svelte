<script lang="ts">
  import type { BaseUrl, Repo, SeedingPolicy } from "@http-client";

  import capitalize from "lodash/capitalize";
  import HoverPopover from "@app/components/HoverPopover.svelte";
  import Link from "@app/components/Link.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  export let baseUrl: BaseUrl;

  export let repoThreshold: number;
  export let repoDelegates: Repo["delegates"];
  export let seedingPolicy: SeedingPolicy;
</script>

<style>
  .context-repo {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .label {
    color: var(--color-text-tertiary);
  }
  .value {
    color: var(--color-text-primary);
  }
  .avatars {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
  }
  .avatars :global(.popover) {
    padding: 0.25rem 0.5rem;
  }
  .avatar-popover {
    white-space: nowrap;
  }
  .description {
    font: var(--txt-body-s-medium);
    color: var(--color-text-quaternary);
  }
</style>

<div class="context-repo">
  <div class="row">
    <span class="label txt-body-m-medium">Delegates</span>
    <span class="value txt-body-m-medium">
      {repoThreshold}/{repoDelegates.length}
    </span>
    <div class="avatars">
      {#each repoDelegates as delegate}
        <HoverPopover>
          <Link
            slot="toggle"
            style="display: flex"
            route={{ resource: "users", did: delegate.id, baseUrl }}>
            <UserAvatar nodeId={delegate.id} styleWidth="1rem" />
          </Link>
          <div slot="popover" class="avatar-popover">
            <NodeId {baseUrl} nodeId={delegate.id} alias={delegate.alias} />
          </div>
        </HoverPopover>
      {/each}
    </div>
  </div>
  <div class="description">
    {#if repoDelegates.length === 1}
      Any changes accepted by the sole delegate will be included in the
      canonical branch.
    {:else}
      {repoThreshold} out of {repoDelegates.length} delegates have to accept changes
      to be included in the canonical branch.
    {/if}
  </div>
  <div class="row">
    <span class="label txt-body-m-medium">Seeding Scope</span>
    <span class="value txt-body-m-medium">
      {capitalize(
        "scope" in seedingPolicy ? seedingPolicy.scope : "not defined",
      )}
    </span>
  </div>
  <div class="description">
    {#if seedingPolicy.policy === "block"}
      Seeding scope only has an effect when a repository is seeded. This repo
      isn’t seeded by the seed node.
    {:else if seedingPolicy.scope === "all"}
      This repository tracks changes by any peer.
    {:else}
      This repository tracks only peers followed by the seed node.
    {/if}
  </div>
</div>
