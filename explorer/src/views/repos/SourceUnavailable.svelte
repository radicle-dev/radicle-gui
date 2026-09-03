<script lang="ts">
  import type { BaseUrl, PeerRefs, Repo, SeedingPolicy } from "@http-client";

  import { getPeers } from "./Source/Header.svelte";
  import { defaultBranchName } from "@app/lib/utils";

  import Layout from "./Layout.svelte";
  import PeerBranchSelector from "./Source/PeerBranchSelector.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import RepoNameHeader from "./Source/RepoNameHeader.svelte";

  export let baseUrl: BaseUrl;
  export let repo: Repo;
  export let repoId: string;
  export let seedingPolicy: SeedingPolicy;
  export let peer: string | undefined = undefined;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  let peers: PeerRefs[] | undefined = undefined;

  function fetchPeers(node: BaseUrl, rid: string) {
    peers = undefined;
    void getPeers(node, rid)
      .then(result => {
        peers = result;
      })
      .catch(error => console.error("Failed to load repo remotes", error));
  }

  $: fetchPeers(baseUrl, repo.rid);
  $: branch = defaultBranchName(repo);
  $: reason = !branch
    ? "This repository has no default branch."
    : peer
      ? `This peer has not pushed the ${branch} branch.`
      : `The default branch ${branch} has no canonical commit.`;
  $: caption = `${reason} Select a branch or tag to browse.`;
</script>

<style>
  .subheader {
    display: flex;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .placeholder {
    display: flex;
    justify-content: center;
    padding: 4rem 1rem;
  }
</style>

<!-- A repository with no default branch, a default branch without a canonical
  commit, or a peer who hasn't pushed it has nothing to open at. Keep the shell
  so the issue and patch tabs stay reachable, and offer the peer branch
  selector. -->
<Layout {baseUrl} {repo} {repoId} {nodeId} {nodeAvatarUrl} activeTab="source">
  <RepoNameHeader {repo} {repoId} {baseUrl} {seedingPolicy} slot="header" />

  <div class="subheader" slot="subheader">
    <PeerBranchSelector
      baseRoute={{ resource: "repo.source", repo: repoId, node: baseUrl }}
      onCanonical={false}
      {peer}
      selectedBranch={undefined}
      {peers}
      {repo} />
  </div>

  <div class="placeholder">
    <Placeholder iconName="branch" {caption} />
  </div>
</Layout>
