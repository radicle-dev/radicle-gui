<script lang="ts">
  import type { BaseUrl, Repo, SeedingPolicy } from "@http-client";

  import Layout from "./Layout.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import RepoNameHeader from "./Source/RepoNameHeader.svelte";

  export let baseUrl: BaseUrl;
  export let repo: Repo;
  export let repoId: string;
  export let seedingPolicy: SeedingPolicy;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;
</script>

<style>
  .placeholder {
    display: flex;
    justify-content: center;
    padding: 4rem 1rem;
  }
</style>

<!-- A repository with no default branch has nothing to open at, but its COBs
are still there. Keep the shell so the issue and patch tabs stay reachable. -->
<Layout {baseUrl} {repo} {repoId} {nodeId} {nodeAvatarUrl} activeTab="source">
  <RepoNameHeader {repo} {repoId} {baseUrl} {seedingPolicy} slot="header" />

  <div class="placeholder">
    <Placeholder
      iconName="desert"
      caption="This repository has no default branch to browse." />
  </div>
</Layout>
