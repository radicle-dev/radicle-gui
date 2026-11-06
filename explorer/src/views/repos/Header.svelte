<script lang="ts" context="module">
  export type ActiveTab =
    "source" | "issues" | "patches" | "releases" | undefined;
</script>

<script lang="ts">
  import type { BaseUrl, Repo } from "@http-client";
  import type { RepoNode } from "./router";

  import { routeToPath } from "@app/lib/router";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import SeedButton from "@app/views/repos/Header/SeedButton.svelte";
  import Share from "@app/views/repos/Share.svelte";

  export let baseUrl: BaseUrl;
  export let activeTab: ActiveTab = undefined;
  export let repo: Repo;
  export let repoId: string;
  export let node: RepoNode;

  // Undefined when the node cannot count the releases.
  $: releaseCount = repo.releaseCount;

  function tabRoute(): string {
    if (activeTab === "issues") {
      return routeToPath({
        resource: "repo.issues",
        repo: repoId,
        node: baseUrl,
      });
    } else if (activeTab === "patches") {
      return routeToPath({
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
      });
    } else if (activeTab === "releases") {
      return routeToPath({
        resource: "repo.releases",
        repo: repoId,
        node: baseUrl,
      });
    } else {
      return routeToPath({
        resource: "repo.source",
        repo: repoId,
        node: baseUrl,
        path: "/",
      });
    }
  }
</script>

<style>
  .container {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .counter {
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-tertiary);
    padding: 0 0.25rem;
  }

  .selected {
    background-color: var(--color-surface-alpha-subtle);
    color: var(--color-text-primary);
  }

  .hover {
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
  }

  .title-counter {
    display: flex;
    gap: 0.5rem;
  }

  .spacer {
    flex: 1;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>

<div class="container">
  <Link
    route={{
      resource: "repo.source",
      repo: repoId,
      node: baseUrl,
      path: "/",
    }}>
    <Button variant={activeTab === "source" ? "gray" : "background"}>
      <Icon name="chevron-left-right" />
      Source
    </Button>
  </Link>
  <Link
    route={{
      resource: "repo.issues",
      repo: repoId,
      node: baseUrl,
    }}>
    <Button let:hover variant={activeTab === "issues" ? "gray" : "background"}>
      <Icon name="issue" />
      <div class="title-counter">
        Issues
        {#if repo.cobs?.issues}
          <span
            class="counter"
            class:selected={activeTab === "issues"}
            class:hover={hover && activeTab !== "issues"}>
            {repo.cobs.issues.open}
          </span>
        {/if}
      </div>
    </Button>
  </Link>

  <Link
    route={{
      resource: "repo.patches",
      repo: repoId,
      node: baseUrl,
    }}>
    <Button let:hover variant={activeTab === "patches" ? "gray" : "background"}>
      <Icon name="patch" />
      <div class="title-counter">
        Patches
        {#if repo.cobs?.patches}
          <span
            class="counter"
            class:hover={hover && activeTab !== "patches"}
            class:selected={activeTab === "patches"}>
            {repo.cobs.patches.open}
          </span>
        {/if}
      </div>
    </Button>
  </Link>

  {#if node.releases}
    <Link
      route={{
        resource: "repo.releases",
        repo: repoId,
        node: baseUrl,
      }}>
      <Button
        let:hover
        variant={activeTab === "releases" ? "gray" : "background"}>
        <Icon name="parcel" />
        <div class="title-counter">
          Releases
          {#if releaseCount !== undefined}
            <span
              class="counter"
              class:hover={hover && activeTab !== "releases"}
              class:selected={activeTab === "releases"}>
              {releaseCount}
            </span>
          {/if}
        </div>
      </Button>
    </Link>
  {/if}

  <div class="spacer"></div>

  <div class="actions">
    {#if activeTab !== "issues" && activeTab !== "patches" && activeTab !== "releases"}
      <Share {repoId} id={repo.rid} idLabel="repository" path={tabRoute()} />
    {/if}
    <slot name="actions" />
    <SeedButton seedCount={repo.seeding} repoId={repo.rid} />
  </div>
</div>
