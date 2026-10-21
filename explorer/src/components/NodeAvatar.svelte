<script lang="ts">
  import UserAvatar from "@app/components/UserAvatar.svelte";

  export let nodeId: string;
  export let avatarUrl: string | undefined = undefined;
  export let styleWidth: string = "1.5rem";
  export let size: number = 24;
</script>

<style>
  .avatar {
    border-radius: var(--border-radius-md);
  }
</style>

{#if avatarUrl}
  <img
    width={size}
    height={size}
    class="avatar"
    alt="Node avatar"
    src={avatarUrl} />
{:else}
  <UserAvatar {nodeId} {styleWidth} />
{/if}
