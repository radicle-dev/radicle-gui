<script lang="ts">
  import type { BaseUrl, Tree } from "@http-client";

  import { createEventDispatcher } from "svelte";

  import File from "./Tree/File.svelte";
  import Folder from "./Tree/Folder.svelte";
  import Link from "@app/components/Link.svelte";
  import Submodule from "./Tree/Submodule.svelte";

  export let baseUrl: BaseUrl;
  export let fetchTree: (path: string) => Promise<Tree | undefined>;
  export let path: string;
  export let peer: string | undefined;
  export let repoId: string;
  export let revision: string | undefined;
  export let tree: Tree;

  const dispatch = createEventDispatcher<{ select: string }>();
  const onSelect = ({ detail: path }: { detail: string }): void => {
    dispatch("select", path);
  };
</script>

{#each tree.entries as entry (entry.path)}
  {#if entry.kind === "tree"}
    <Folder
      currentPath={path}
      name={entry.name}
      on:select={onSelect}
      prefix={`${entry.path}/`}
      {baseUrl}
      {fetchTree}
      {peer}
      {repoId}
      {revision} />
  {:else if entry.kind === "submodule"}
    <Submodule name={entry.name} oid={entry.oid} />
  {:else}
    <Link
      route={{
        resource: "repo.source",
        repo: repoId,
        node: baseUrl,
        path: entry.path,
        peer,
        revision,
      }}
      on:afterNavigate={() => onSelect({ detail: entry.path })}>
      <File active={entry.path === path} name={entry.name} />
    </Link>
  {/if}
{/each}
