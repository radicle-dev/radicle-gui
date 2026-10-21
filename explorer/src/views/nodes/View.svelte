<script lang="ts">
  import type { BaseUrl, Node, NodeStats } from "@http-client";

  import dompurify from "dompurify";
  import { markdown, sanitizeConfig } from "@app/lib/markdown";

  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Layout from "@app/components/Layout.svelte";
  import Popover from "@app/components/Popover.svelte";
  import ReposView from "./ReposView.svelte";
  import NodeAvatar from "@app/components/NodeAvatar.svelte";
  import SeedPicker from "@app/views/explore/SeedPicker.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  import PolicyExplainer from "./PolicyExplainer.svelte";
  import Seeding from "./Seeding.svelte";
  import UserAgent from "./UserAgent.svelte";
  import NodeAddress from "./NodeAddress.svelte";

  export let baseUrl: BaseUrl;
  export let stats: NodeStats;
  export let node: Node;

  function render(content: string): string {
    return dompurify.sanitize(
      markdown({ linkify: true, emojis: true }).parse(content) as string,
      sanitizeConfig,
    ) as string;
  }
</script>

<style>
  .sidebar-wrapper {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .sidebar {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
  }

  .sidebar-content {
    gap: 1rem;
    display: flex;
    flex-direction: column;
  }

  .footer {
    margin-top: auto;
    padding-top: 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }

  .footer a {
    color: var(--color-text-tertiary);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .footer a:hover {
    text-decoration: underline;
  }

  .description {
    word-break: break-word;
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    height: 2rem;
  }

  .box {
    font: var(--txt-body-m-regular);
    line-height: 1.625rem;
    width: 17rem;
  }

  code {
    font: var(--txt-code-regular);
    background-color: var(--color-surface-mid);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.25rem;
  }
</style>

<Layout>
  <svelte:fragment slot="breadcrumbs">
    <SeedPicker
      {baseUrl}
      mode="node"
      variant="breadcrumb"
      ariaLabel="Current node selector"
      title="Switch the node serving this page">
      <svelte:fragment slot="icon">
        <NodeAvatar nodeId={node.id} avatarUrl={node.avatarUrl} />
      </svelte:fragment>
    </SeedPicker>
  </svelte:fragment>

  <div slot="sidebar" class="sidebar-wrapper">
    {#if node.bannerUrl}
      <img style:width="100%" alt="Node banner" src={node.bannerUrl} />
    {/if}

    <div class="sidebar">
      <div class="sidebar-content">
        <div style:display="flex" style:align-items="center" style:gap="1rem">
          {#if node.avatarUrl}
            <img
              style:border-radius="var(--border-radius-md)"
              style:min-width="64px"
              width="64"
              height="64"
              class="avatar"
              alt="Seed avatar"
              src={node.avatarUrl} />
          {:else}
            <UserAvatar nodeId={node.id} styleWidth="4rem" />
          {/if}
          <div style:width="100%">
            <div class="txt-body-m-semibold txt-overflow">
              {baseUrl.hostname}
            </div>
            <NodeAddress {node} />
          </div>
        </div>

        {#if node.description}
          <div class="description txt-body-m-regular">
            {@html render(node.description)}
          </div>
        {:else}
          <div
            class="global-flex-item txt-body-m-regular"
            style:align-items="center"
            style:justify-content="space-between"
            style:color="var(--color-text-tertiary)"
            style:gap="0.25rem">
            No description configured.
            <Popover popoverPositionTop="0" popoverPositionLeft="2.25rem">
              <IconButton slot="toggle" let:toggle on:click={toggle}>
                <Icon name="guide" />
              </IconButton>

              <div slot="popover" class="box">
                If you’re the owner of this node, you can customize this page by
                setting the
                <code>avatarUrl</code>
                ,
                <code>bannerUrl</code>
                and
                <code>description</code>
                fields under the
                <code>web</code>
                object in your node config.
                <div style:margin-top="1rem">
                  <Command command="rad config edit" fullWidth />
                </div>
              </div>
            </Popover>
          </div>
        {/if}

        <div style:display="flex" style:flex-direction="column">
          <PolicyExplainer seedingPolicy={node.config?.seedingPolicy} />
          <div class="sidebar-item">
            <Seeding count={stats.repos.total}>
              <div style:width="2rem"></div>
            </Seeding>
          </div>
          {#if node.agent}
            <div class="sidebar-item">
              <UserAgent agent={node.agent} />
            </div>
          {/if}
        </div>
      </div>

      <div class="footer">
        <a href="https://radicle.dev" target="_blank" rel="noreferrer">
          Learn more about Radicle
          <Icon name="open-external" />
        </a>
      </div>
    </div>
  </div>

  <div slot="center">
    <ReposView {baseUrl} {stats} />
  </div>
</Layout>
