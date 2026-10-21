<script lang="ts">
  import type {
    BaseUrl,
    CommitHeader,
    Repo,
    SeedingPolicy,
    Tree,
  } from "@http-client";
  import type { RepoRoute } from "./router";

  import config from "@app/lib/config";
  import { HttpdClient } from "@http-client";
  import {
    baseUrlToString,
    formatQualifiedRefname,
    safeDecodeURIComponent,
  } from "@app/lib/utils";
  import { groupCommits } from "@app/lib/commit";

  import Button from "@app/components/Button.svelte";
  import CloneButton from "@app/views/repos/Header/CloneButton.svelte";
  import CommitTeaser from "./Commit/CommitTeaser.svelte";
  import ErrorMessage from "@app/components/ErrorMessage.svelte";
  import Header from "./Source/Header.svelte";
  import Layout from "./Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import List from "@app/components/List.svelte";
  import Loading from "@app/components/Loading.svelte";
  import RepoNameHeader from "./Source/RepoNameHeader.svelte";
  import Separator from "./Separator.svelte";

  export let baseUrl: BaseUrl;
  export let seedingPolicy: SeedingPolicy;
  export let commit: string;
  export let commitHeaders: CommitHeader[];
  export let peer: string | undefined;
  export let repo: Repo;
  export let repoId: string;
  export let revision: string | undefined;
  export let tree: Tree;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  // The revision carries the encoded branch name after an in-app navigation,
  // and this refname reaches the user as part of the clone popover's archive
  // command.
  $: currentRefname = formatQualifiedRefname(
    revision
      ? safeDecodeURIComponent(revision)
      : repo.payloads["xyz.radicle.project"].data.defaultBranch,
    peer,
  );

  const api = new HttpdClient(baseUrl);
  let totalCommits: number | undefined = undefined;

  function fetchTotalCommits(rid: string, sha: string) {
    void api.repo.getCommitCountBySha(rid, sha).then(commits => {
      totalCommits = commits;
    });
  }

  $: fetchTotalCommits(repo.rid, commit);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any;
  let page = 0;
  let loading = false;
  let allCommitHeaders: CommitHeader[];

  $: baseRoute = {
    resource: "repo.history",
    node: baseUrl,
    repo: repoId,
  } as Extract<RepoRoute, { resource: "repo.history" }>;
  $: {
    allCommitHeaders = commitHeaders;
    page = 0;
  }

  async function loadMore() {
    loading = true;
    page += 1;
    try {
      const response = await api.repo.getAllCommits(repo.rid, {
        parent: allCommitHeaders[0].id,
        page,
        perPage: config.source.commitsPerPage,
      });
      allCommitHeaders = [...allCommitHeaders, ...response];
    } catch (e) {
      error = e;
    }
    loading = false;
  }
</script>

<style>
  .more {
    margin-top: 2rem;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .group-header {
    margin: 1rem 0 0.5rem 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
</style>

<Layout {nodeId} {nodeAvatarUrl} {baseUrl} {repo} {repoId} activeTab="source">
  <svelte:fragment slot="breadcrumb">
    <Separator />
    <Link
      route={{
        resource: "repo.history",
        repo: repoId,
        node: baseUrl,
      }}>
      Commits
    </Link>
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <CloneButton
      {baseUrl}
      {currentRefname}
      id={repo.rid}
      alias={repo.alias}
      name={repo.payloads["xyz.radicle.project"].data.name} />
  </svelte:fragment>
  <RepoNameHeader {repo} {repoId} {baseUrl} {seedingPolicy} slot="header" />

  <div
    style:padding="1rem"
    style:border-bottom="1px solid var(--color-border-subtle)"
    slot="subheader">
    <Header
      {baseRoute}
      {commit}
      {peer}
      {repo}
      {repoId}
      {revision}
      {tree}
      node={baseUrl}
      filesLinkActive={false}
      historyLinkActive={true} />
  </div>

  <div>
    {#each groupCommits(allCommitHeaders) as group (group.time)}
      <div class="group-header">{group.date}</div>
      <List items={group.commits}>
        <CommitTeaser slot="item" let:item {repoId} {baseUrl} commit={item} />
      </List>
    {/each}
  </div>

  {#if totalCommits === undefined || loading || allCommitHeaders.length < totalCommits}
    <div class="more">
      {#if totalCommits === undefined || loading}
        <Loading small={page !== 0} center />
      {:else if allCommitHeaders.length < totalCommits}
        <Button size="large" variant="outline" on:click={loadMore}>More</Button>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="message">
      <ErrorMessage
        title="Couldn’t load commits"
        description="Make sure you are able to connect to the seed:"
        seed={baseUrlToString(api.baseUrl)}
        {error} />
    </div>
  {/if}
</Layout>
