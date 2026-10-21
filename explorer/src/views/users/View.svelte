<script lang="ts">
  import type { BaseUrl, NodeIdentity, NodeStats } from "@http-client";

  import * as utils from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Layout from "@app/components/Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import Popover from "@app/components/Popover.svelte";
  import NodeAvatar from "@app/components/NodeAvatar.svelte";
  import SeedPicker from "@app/views/explore/SeedPicker.svelte";
  import Separator from "@app/views/repos/Separator.svelte";
  import UserAddress from "@app/views/users/UserAddress.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";
  import UserReposView from "./UserReposView.svelte";

  export let baseUrl: BaseUrl;
  export let node: NodeIdentity;
  export let did: { prefix: string; pubkey: string };
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;
  export let stats: NodeStats;
</script>

<style>
  .sidebar {
    padding: 1rem;
  }

  .sidebar-content {
    gap: 1rem;
    display: flex;
    flex-direction: column;
  }

  .node-address {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    min-width: 0;
    max-width: 100%;
  }

  .node-alias {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    border: 1px solid var(--color-border-alpha-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.25rem 0.5rem;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .follow-label {
    display: block;
    font: var(--txt-body-m-regular);
    margin-bottom: 0.75rem;
  }

  .breadcrumbs {
    display: flex;
    align-items: center;
    column-gap: 0.25rem;
    font: var(--txt-body-m-regular);
    white-space: nowrap;
    flex-wrap: wrap;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .breadcrumb :global(a:hover) {
    color: var(--color-text-brand);
  }
</style>

<Layout>
  <svelte:fragment slot="breadcrumbs">
    <div class="breadcrumbs">
      <span class="breadcrumb">
        <SeedPicker
          {baseUrl}
          mode="node"
          variant="breadcrumb"
          ariaLabel="Current node selector"
          title="Switch the node serving this page">
          <svelte:fragment slot="icon">
            <NodeAvatar {nodeId} avatarUrl={nodeAvatarUrl} />
          </svelte:fragment>
        </SeedPicker>
      </span>

      <Separator />

      <span class="breadcrumb">
        <Link
          ariaLabel="Home"
          route={{
            resource: "users",
            baseUrl: baseUrl,
            did: utils.formatDid(did),
          }}>
          {node.alias || utils.formatNodeId(did.pubkey)}
        </Link>
      </span>
    </div>
  </svelte:fragment>

  <div slot="sidebar">
    <!-- Banner/Avatar at top -->
    <UserAvatar nodeId={did.pubkey} styleWidth="100%" />

    <div class="sidebar">
      <div class="sidebar-content">
        <!-- User Alias -->
        <div
          class="global-flex-item"
          style:width="100%"
          style:justify-content="space-between">
          <div
            class="txt-heading-s txt-overflow"
            style:flex="1"
            style:min-width="0">
            {node.alias || utils.formatNodeId(did.pubkey)}
          </div>
          <Popover popoverPositionTop="2.5rem" popoverPositionRight="0">
            <Button
              slot="toggle"
              let:toggle
              on:click={toggle}
              variant="outline">
              <div class="global-flex-item">
                <Icon name="plus" />
                <span>Follow</span>
              </div>
            </Button>
            <div slot="popover" style:width="16rem">
              <span class="follow-label">
                Use the <ExternalLink href="https://radicle.dev">
                  Radicle CLI
                </ExternalLink> to start following this user.
              </span>
              <span class="follow-label">
                Following a user ensures that their contributions are fetched
                onto your device.
              </span>
              <Command command={`rad follow ${did.pubkey}`} />
            </div>
          </Popover>
        </div>

        <div
          style:flex-direction="column"
          style:align-items="flex-start"
          style:overflow="visible"
          style:width="100%">
          <div
            style:flex-direction="column"
            style:align-items="flex-start"
            style:width="100%">
            <div class="node-address">
              <div class="node-alias">
                <Icon name="key" />{node.alias || "user"}
              </div>
              <UserAddress {did} />
            </div>
          </div>
          <div class="node-address">
            <div class="node-alias">
              <Icon name="key" />SSH Key
            </div>
            <Id styleWidth="fit-content" id={node.ssh.full}>
              <div class="txt-overflow">
                {node.ssh.full.substring(0, 10)}…{node.ssh.full.slice(-10)}
              </div>
            </Id>
          </div>
          <div class="node-address">
            <div class="node-alias">
              <Icon name="key" />SSH Hash
            </div>
            <Id styleWidth="fit-content" id={node.ssh.hash}>
              <div class="txt-overflow">
                {node.ssh.hash.substring(0, 10)}…{node.ssh.hash.slice(-10)}
              </div>
            </Id>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div slot="center">
    <UserReposView {baseUrl} {stats} user={node} {did} />
  </div>
</Layout>
