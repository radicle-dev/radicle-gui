<script lang="ts">
  import type { ActiveTab } from "./Header.svelte";
  import type { BaseUrl, Repo } from "@http-client";

  import Button from "@app/components/Button.svelte";
  import Header from "@app/components/Header.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import MobileFooter from "@app/App/MobileFooter.svelte";
  import RepoHeader from "./Header.svelte";
  import SeedPicker from "@app/views/explore/SeedPicker.svelte";
  import Separator from "./Separator.svelte";
  import NodeAvatar from "@app/components/NodeAvatar.svelte";

  export let activeTab: ActiveTab | undefined = undefined;
  export let baseUrl: BaseUrl;
  export let repo: Repo;
  export let repoId: string;
  export let stylePaddingBottom: string = "2.5rem";
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;
</script>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .content {
    overflow: scroll;
    flex: 1;
  }

  .tab-bar {
    display: block;
  }

  .mobile-footer {
    display: none;
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
  @media (max-width: 719.98px) {
    .tab-bar {
      display: none;
    }
    .breadcrumbs {
      display: none;
    }
    .content {
      overflow-y: scroll;
      overflow-x: hidden;
    }
    .mobile-footer {
      margin-top: auto;
      display: grid;
    }
  }
</style>

<div class="layout">
  <div class="app-header">
    <Header>
      <svelte:fragment slot="breadcrumbs">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
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

          <span class="breadcrumb" title={repo.rid}>
            <Link
              route={{
                resource: "repo.source",
                repo: repoId,
                node: baseUrl,
              }}>
              <div class="breadcrumb">
                {repo.payloads["xyz.radicle.project"].data.name}
              </div>
            </Link>
          </span>

          <div class="breadcrumb">
            <slot name="breadcrumb" />
          </div>
        </nav>
      </svelte:fragment>
    </Header>
  </div>

  <div class="tab-bar">
    <RepoHeader {activeTab} {baseUrl} {repo} {repoId}>
      <svelte:fragment slot="actions">
        <slot name="actions" />
      </svelte:fragment>
    </RepoHeader>
  </div>

  <div class="content" style:padding-bottom={stylePaddingBottom}>
    <slot name="header" />
    <slot name="subheader" />
    <slot />
  </div>

  <div class="mobile-footer">
    <MobileFooter>
      <div style:width="100%">
        <Link
          title="Home"
          route={{
            resource: "repo.source",
            repo: repoId,
            node: baseUrl,
            path: "/",
          }}>
          <Button
            variant={activeTab === "source" ? "secondary" : "secondary-mobile"}
            styleWidth="100%">
            <Icon name="chevron-left-right" />
          </Button>
        </Link>
      </div>

      <div style:width="100%">
        <Link
          title={`${repo.payloads["xyz.radicle.project"].meta.issues.open} Issues`}
          route={{
            resource: "repo.issues",
            repo: repoId,
            node: baseUrl,
          }}>
          <Button
            variant={activeTab === "issues" ? "secondary" : "secondary-mobile"}
            styleWidth="100%">
            <Icon name="issue" />
          </Button>
        </Link>
      </div>

      <div style:width="100%">
        <Link
          title={`${repo.payloads["xyz.radicle.project"].meta.patches.open} Patches`}
          route={{
            resource: "repo.patches",
            repo: repoId,
            node: baseUrl,
          }}>
          <Button
            variant={activeTab === "patches" ? "secondary" : "secondary-mobile"}
            styleWidth="100%">
            <Icon name="patch" />
          </Button>
        </Link>
      </div>

      {#if repo.payloads["xyz.radicle.project"].meta.releases !== undefined}
        <div style:width="100%">
          <Link
            title="Releases"
            route={{
              resource: "repo.releases",
              repo: repoId,
              node: baseUrl,
            }}>
            <Button
              variant={activeTab === "releases"
                ? "secondary"
                : "secondary-mobile"}
              styleWidth="100%">
              <Icon name="parcel" />
            </Button>
          </Link>
        </div>
      {/if}
    </MobileFooter>
  </div>
</div>
