<script lang="ts" context="module">
  import type { BaseUrl, PeerRefs } from "@http-client";

  import { HttpdClient } from "@http-client";
  import { cached } from "@app/lib/cache";
  import { peerHasBranches, remoteToPeerRefs } from "../router";

  // Cache commit counts across component remounts (tab navigation).
  const commitCountCache: Record<string, number> = {};

  // The remote listing behind the peer selector is expensive on repositories
  // with many peers. Going through `cached` shares a single request across
  // every Header instance for the same repo, including instances that mount
  // while the request is still in flight.
  const getPeers = cached(
    async (baseUrl: BaseUrl, rid: string) => {
      const remotes = await new HttpdClient(baseUrl).repo.getAllRemotes(rid);
      return remotes.map(remoteToPeerRefs).filter(peerHasBranches);
    },
    (...args) => JSON.stringify(args),
  );
</script>

<script lang="ts">
  import type { RepoRoute } from "../router";
  import type { Repo, Tree } from "@http-client";
  import type { ComponentProps } from "svelte";

  import Button from "@app/components/Button.svelte";
  import CommitButton from "../components/CommitButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import JobCob from "@app/components/JobCob.svelte";
  import Link from "@app/components/Link.svelte";

  import PeerBranchSelector from "./PeerBranchSelector.svelte";

  export let commit: string;
  export let filesLinkActive: boolean;
  export let historyLinkActive: boolean;
  export let node: BaseUrl;
  export let peer: string | undefined;
  export let repo: Repo;
  export let repoId: string;
  export let baseRoute: Extract<
    RepoRoute,
    { resource: "repo.source" } | { resource: "repo.history" }
  >;
  export let revision: string | undefined;
  export let tree: Tree;

  const api = new HttpdClient(node);
  let commitCount: number | undefined = commitCountCache[commit];

  function fetchCommitCount(rid: string, sha: string) {
    const cached = commitCountCache[sha];
    if (cached !== undefined) {
      commitCount = cached;
    } else {
      void api.repo.getCommitCountBySha(rid, sha).then(commits => {
        commitCountCache[sha] = commits;
        commitCount = commits;
      });
    }
  }

  $: fetchCommitCount(repo.rid, commit);

  // Enumerating remotes requires reading and verifying signed refs for every
  // peer, which is slow on large repositories. It only feeds the peer selector
  // dropdown, so it loads after render instead of blocking navigation.
  let peers: PeerRefs[] | undefined = undefined;
  let peersRid: string | undefined;

  function fetchPeers(rid: string) {
    if (peersRid === rid) {
      return;
    }
    peersRid = rid;
    peers = undefined;
    void getPeers(node, rid)
      .then(result => {
        if (peersRid === rid) {
          peers = result;
        }
      })
      .catch(error => {
        if (peersRid === rid) {
          peersRid = undefined;
        }
        console.error("Failed to load repo remotes", error);
      });
  }

  $: fetchPeers(repo.rid);

  let selectedBranch: string | undefined;
  let commitButtonVariant: ComponentProps<CommitButton>["variant"] | undefined;

  // Revision may be a commit ID, a branch name or `undefined` which means the
  // default branch. We assign `selectedBranch` accordingly.
  $: if (revision === lastCommit.id) {
    selectedBranch = undefined;
  } else {
    selectedBranch =
      revision || repo.payloads["xyz.radicle.project"].data.defaultBranch;
  }

  $: lastCommit = tree.lastCommit;
  $: onCanonical = Boolean(
    !peer &&
    selectedBranch === repo.payloads["xyz.radicle.project"].data.defaultBranch,
  );
  $: if (onCanonical) {
    commitButtonVariant = "right";
  } else if (!selectedBranch) {
    commitButtonVariant = "left";
  } else {
    commitButtonVariant = "center";
  }
</script>

<style>
  .header {
    font: var(--txt-body-s-regular);
    display: flex;
    gap: 0.375rem;
    align-items: center;
    justify-content: left;
    flex-wrap: wrap;
  }
  .branch-commit {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }
  .mobile-branch {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .counter {
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-tertiary);
    padding: 0 0.25rem;
    min-width: 1.5rem;
    text-align: center;
  }

  .title-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .selected {
    background-color: var(--color-surface-mid);
    color: var(--color-text-primary);
  }
</style>

<div class="mobile-branch global-hide-on-small-desktop-up" style:gap="1px">
  {#if selectedBranch}
    <PeerBranchSelector
      {peers}
      {peer}
      {baseRoute}
      {onCanonical}
      {repo}
      {selectedBranch} />
  {/if}
  <div class="global-flex-item" style:gap="1px">
    <CommitButton
      variant={commitButtonVariant}
      styleMinWidth="0"
      hideSummaryOnMobile
      {repoId}
      commit={lastCommit}
      baseUrl={node} />
    {#if !onCanonical}
      <Link route={baseRoute}>
        <Button
          variant="not-selected"
          styleBorderRadius="0 var(--border-radius-sm) var(--border-radius-sm) 0">
          <Icon name="close" />
        </Button>
      </Link>
    {/if}
    <div style:margin-left="0.5rem">
      <JobCob baseUrl={node} rid={repo.rid} commit={lastCommit.id} />
    </div>
  </div>
</div>

<div class="header">
  <div style="display: flex; gap: 0.375rem;">
    <Link
      route={{
        resource: "repo.source",
        repo: repoId,
        node: node,
        peer,
        revision,
      }}>
      <Button variant={filesLinkActive ? "gray" : "background"}>
        <Icon name="document" />Files
      </Button>
    </Link>

    <Link
      route={{
        resource: "repo.history",
        repo: repoId,
        node: node,
        peer,
        revision,
      }}>
      <Button variant={historyLinkActive ? "gray" : "background"}>
        <Icon name="commit" />
        <div class="title-counter">
          Commits
          {#if commitCount !== undefined}
            <div class="counter" class:selected={historyLinkActive}>
              {commitCount}
            </div>
          {/if}
        </div>
      </Button>
    </Link>
  </div>

  <div class="branch-commit global-hide-on-mobile-down" style:gap="1px">
    {#if selectedBranch}
      <PeerBranchSelector
        {peers}
        {peer}
        {baseRoute}
        {onCanonical}
        {repo}
        {selectedBranch} />
    {/if}
    <CommitButton
      variant={commitButtonVariant}
      styleMinWidth="0"
      hideSummaryOnMobile
      {repoId}
      commit={lastCommit}
      baseUrl={node} />
    {#if !onCanonical}
      <Link route={baseRoute}>
        <Button
          variant="not-selected"
          styleBorderRadius="0 var(--border-radius-sm) var(--border-radius-sm) 0">
          <Icon name="close" />
        </Button>
      </Link>
    {/if}
    <div style:margin-left="0.5rem">
      <JobCob baseUrl={node} rid={repo.rid} commit={lastCommit.id} />
    </div>
  </div>
</div>
