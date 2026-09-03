<script lang="ts">
  import type { BaseUrl, Issue, IssueState, Repo } from "@http-client";

  import { HttpdClient } from "@http-client";
  import { ISSUES_PER_PAGE } from "./router";
  import { baseUrlToString } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import ErrorMessage from "@app/components/ErrorMessage.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueTeaser from "@app/views/repos/Issue/IssueTeaser.svelte";
  import Layout from "./Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import List from "@app/components/List.svelte";
  import Loading from "@app/components/Loading.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import Separator from "./Separator.svelte";

  export let baseUrl: BaseUrl;
  export let issues: Issue[];
  export let repo: Repo;
  export let repoId: string;
  export let status: IssueState["status"];
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  let loading = false;
  let page = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any;
  let allIssues: Issue[];

  $: {
    allIssues = issues;
    page = 0;
  }

  const api = new HttpdClient(baseUrl);

  async function loadIssues(status: IssueState["status"]): Promise<void> {
    loading = true;
    page += 1;
    try {
      const response = await api.repo.getAllIssues(repo.rid, {
        status,
        page,
        perPage: ISSUES_PER_PAGE,
      });
      allIssues = [...allIssues, ...response];
    } catch (e) {
      error = e;
    } finally {
      loading = false;
    }
  }

  // Without a count, offer more while every loaded page came back full.
  $: issueCount = repo.cobs?.issues?.[status];
  $: showMoreButton =
    !loading &&
    !error &&
    (issueCount === undefined
      ? allIssues.length === (page + 1) * ISSUES_PER_PAGE
      : allIssues.length < issueCount);
</script>

<style>
  .header {
    display: flex;
    gap: 0.25rem;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .more {
    margin-top: 2rem;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .counter {
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-tertiary);
    padding: 0 0.25rem;
    min-width: 1.5rem;
    text-align: center;
  }
  .selected {
    background-color: var(--color-surface-alpha-subtle);
    color: var(--color-text-primary);
  }
  .title-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .placeholder {
    height: calc(100% - 4rem);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @media (max-width: 719.98px) {
    .placeholder {
      height: calc(100vh - 10rem);
    }
  }
</style>

<Layout {nodeId} {nodeAvatarUrl} {baseUrl} {repo} {repoId} activeTab="issues">
  <svelte:fragment slot="breadcrumb">
    <Separator />
    <Link
      route={{
        resource: "repo.issues",
        repo: repoId,
        node: baseUrl,
      }}>
      Issues
    </Link>
  </svelte:fragment>
  <div slot="header" class="header">
    <Link
      route={{
        resource: "repo.issues",
        repo: repoId,
        node: baseUrl,
        status: "open",
      }}>
      <Button variant={status === "open" ? "gray" : "background"}>
        <Icon name="issue" />
        <div class="title-counter">
          Open
          {#if repo.cobs?.issues}
            <span class="counter" class:selected={status === "open"}>
              {repo.cobs.issues.open}
            </span>
          {/if}
        </div>
      </Button>
    </Link>
    <Link
      route={{
        resource: "repo.issues",
        repo: repoId,
        node: baseUrl,
        status: "closed",
      }}>
      <Button variant={status === "closed" ? "gray" : "background"}>
        <Icon name="issue-closed" />
        <div class="title-counter">
          Closed
          {#if repo.cobs?.issues}
            <span class="counter" class:selected={status === "closed"}>
              {repo.cobs.issues.closed}
            </span>
          {/if}
        </div>
      </Button>
    </Link>
  </div>

  <List items={allIssues}>
    <IssueTeaser slot="item" let:item {baseUrl} {repoId} issue={item} />
  </List>

  {#if error}
    <ErrorMessage
      title="Couldn’t load issues"
      description="Please make sure you are able to connect to the seed:"
      seed={baseUrlToString(api.baseUrl)}
      {error} />
  {/if}

  {#if repo.cobs?.issues?.[status] === 0}
    <div class="placeholder">
      <Placeholder iconName="no-issues" caption={`No ${status} issues`} />
    </div>
  {/if}

  {#if loading || showMoreButton}
    <div class="more">
      {#if loading}
        <Loading noDelay small={page !== 0} center />
      {/if}

      {#if showMoreButton}
        <Button
          size="large"
          variant="outline"
          on:click={() => loadIssues(status)}>
          More
        </Button>
      {/if}
    </div>
  {/if}
</Layout>
