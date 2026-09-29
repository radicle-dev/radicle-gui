<script lang="ts">
  import type { ActiveTab } from "./Header.svelte";
  import type { BaseUrl, Repo } from "@http-client";

  import { onMount } from "svelte";

  import { activeRouteStore } from "@app/lib/router";

  import Button from "@app/components/Button.svelte";
  import Header from "@app/components/Header.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import MobileFooter from "@app/App/MobileFooter.svelte";
  import RepoHeader from "./Header.svelte";
  import SeedPicker from "@app/views/explore/SeedPicker.svelte";
  import Separator from "./Separator.svelte";
  import NodeAvatar from "@app/components/NodeAvatar.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";

  export let activeTab: ActiveTab | undefined = undefined;
  export let baseUrl: BaseUrl;
  export let repo: Repo;
  export let repoId: string;
  export let stylePaddingBottom: string = "2.5rem";
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  $: route = $activeRouteStore;
  $: isRepoHome = route.resource === "repo.source" && route.params.path === "/";

  let trail: HTMLElement | undefined = undefined;
  let fadeLeft = false;
  let fadeRight = false;

  function updateFade() {
    if (!trail) {
      return;
    }
    const overflow = trail.scrollWidth - trail.clientWidth;
    const offset = Math.abs(trail.scrollLeft);
    fadeLeft = overflow > 1 && offset < overflow - 1;
    fadeRight = overflow > 1 && offset > 1;
  }

  onMount(() => {
    if (!trail) {
      return;
    }
    const observer = new ResizeObserver(updateFade);
    observer.observe(trail);
    for (const child of trail.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  });
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

  .breadcrumbs-scroller {
    position: relative;
    min-width: 0;
  }
  .breadcrumbs,
  .trail {
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
  .repo-crumb {
    gap: 0.375rem;
  }
  .node-crumb {
    margin-right: -0.5rem;
  }
  .repo-separator {
    display: flex;
  }
  .breadcrumb :global(a:hover) {
    color: var(--color-text-brand);
  }
  @media (max-width: 719.98px) {
    .tab-bar {
      display: none;
    }
    .breadcrumbs {
      direction: rtl;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .breadcrumbs::-webkit-scrollbar {
      display: none;
    }
    .hide-on-mobile {
      display: none;
    }
    .trail {
      direction: ltr;
      flex-shrink: 0;
      flex-wrap: nowrap;
      width: max-content;
      min-width: 100%;
    }
    .breadcrumbs-scroller::before,
    .breadcrumbs-scroller::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2rem;
      pointer-events: none;
      opacity: 0;
      z-index: 1;
    }
    .breadcrumbs-scroller::before {
      left: 0;
      background: linear-gradient(
        to right,
        var(--color-surface-base),
        transparent
      );
    }
    .breadcrumbs-scroller::after {
      right: 0;
      background: linear-gradient(
        to left,
        var(--color-surface-base),
        transparent
      );
    }
    .breadcrumbs-scroller.fade-left::before,
    .breadcrumbs-scroller.fade-right::after {
      opacity: 1;
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
        <div
          class="breadcrumbs-scroller"
          class:fade-left={fadeLeft}
          class:fade-right={fadeRight}>
          <nav
            class="breadcrumbs"
            aria-label="Breadcrumb"
            bind:this={trail}
            on:scroll={updateFade}>
            <div class="trail">
              <span class="breadcrumb node-crumb">
                <SeedPicker
                  {baseUrl}
                  mode="node"
                  variant="breadcrumb"
                  ariaLabel="Current node selector"
                  title="Switch the node serving this page">
                  <svelte:fragment slot="icon">
                    <NodeAvatar
                      {nodeId}
                      avatarUrl={nodeAvatarUrl}
                      styleWidth="1rem"
                      size={16} />
                  </svelte:fragment>
                </SeedPicker>
              </span>

              <span class="repo-separator" class:hide-on-mobile={isRepoHome}>
                <Separator />
              </span>

              <span
                class="breadcrumb"
                class:hide-on-mobile={isRepoHome}
                title={repo.rid}>
                <Link
                  route={{
                    resource: "repo.source",
                    repo: repoId,
                    node: baseUrl,
                  }}>
                  <div class="breadcrumb repo-crumb">
                    <RepoAvatar
                      name={repo.payloads["xyz.radicle.project"].data.name}
                      rid={repo.rid}
                      styleWidth="1rem" />
                    {repo.payloads["xyz.radicle.project"].data.name}
                  </div>
                </Link>
              </span>

              <div class="breadcrumb">
                <slot name="breadcrumb" />
              </div>
            </div>
          </nav>
        </div>
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
