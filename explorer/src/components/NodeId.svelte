<script lang="ts">
  import type { BaseUrl } from "@http-client";
  import { formatNodeId, parseNodeId, truncateId } from "@app/lib/utils";

  import UserAvatar from "./UserAvatar.svelte";
  import Link from "./Link.svelte";

  export let baseUrl: BaseUrl;
  export let nodeId: string;
  export let alias: string | undefined = undefined;
</script>

<style>
  .avatar-alias {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    height: 1rem;
    font: var(--txt-body-m-regular);
  }
  .avatar-container {
    width: 1rem;
    height: 1rem;
    overflow: hidden;
  }
  .avatar-container :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .no-alias {
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
</style>

<div class="avatar-alias">
  <Link
    styleHoverState
    style="display: flex; gap: 0.375rem; align-items: center;"
    route={{ resource: "users", did: nodeId, baseUrl }}>
    <div class="avatar-container">
      <UserAvatar {nodeId} styleWidth="1rem" />
    </div>
    {#if alias}
      <span class="txt-overflow">
        {alias}
      </span>
    {:else}
      <span class="no-alias global-hide-on-mobile-down">
        {formatNodeId(nodeId)}
      </span>
      <span class="no-alias global-hide-on-small-desktop-up">
        {truncateId(parseNodeId(nodeId)?.pubkey || "")}
      </span>
    {/if}
  </Link>
</div>
