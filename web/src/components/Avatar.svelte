<script lang="ts">
  import { node } from "@app/node/node.svelte";

  import RepoAvatar from "./RepoAvatar.svelte";
  import UserAvatar from "./UserAvatar.svelte";

  interface Props {
    person?: string;
    org?: string;
    size?: string;
  }

  const { person, org, size = "1.25rem" }: Props = $props();

  const orgInfo = $derived(org ? node.org(org) : undefined);
</script>

<style>
  .avatar {
    display: inline-flex;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--color-surface-subtle);
  }
  .person {
    border-radius: 50%;
  }
  .org {
    border-radius: var(--border-radius-md);
  }
  .avatar :global(img),
  .avatar :global(div) {
    display: block;
  }
</style>

{#if person}
  <span
    class="avatar person"
    style:width={size}
    style:height={size}
    title={node.person(person).alias}>
    <UserAvatar nodeId={node.person(person).nid} styleWidth={size} />
  </span>
{:else if orgInfo}
  <span
    class="avatar org"
    style:width={size}
    style:height={size}
    title={orgInfo.name}>
    <RepoAvatar name={orgInfo.handle} rid={orgInfo.rid} styleWidth={size} />
  </span>
{/if}
