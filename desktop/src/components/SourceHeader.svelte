<script lang="ts">
  import type { SourceBaseRoute } from "@app/views/repo/router";
  import type { Commit } from "@bindings/repo/Commit";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";
  import type { RepoRefs } from "@bindings/repo/RepoRefs";
  import type { Snippet } from "svelte";

  import { cachedRepoCommitCount, invoke } from "@app/lib/invoke";
  import * as router from "@app/lib/router";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import JobCob from "@app/components/JobCob.svelte";
  import PeerSelector from "@app/components/PeerSelector/PeerSelector.svelte";

  interface Props {
    repo: RepoInfo;
    peer?: string;
    revision?: string;
    oid: string;
    commit?: Commit;
    baseRoute: SourceBaseRoute;
    active: "files" | "commits";
    extra?: Snippet;
  }

  const { repo, peer, revision, oid, commit, baseRoute, active, extra }: Props =
    $props();

  // The commit count requires a full history walk on the backend, so it is
  // fetched after render instead of blocking navigation. The key guard keeps
  // navigations that only swap object identity (e.g. picking a branch in the
  // same repo) from clearing already-loaded state.
  let commitCount: number | undefined = $state();
  let commitCountKey: string | undefined;

  $effect(() => {
    const requested = `${repo.rid}:${oid}`;
    if (commitCountKey === requested) {
      return;
    }
    commitCountKey = requested;
    commitCount = undefined;
    void cachedRepoCommitCount(repo.rid, oid)
      .then(count => {
        if (commitCountKey === requested) {
          commitCount = count;
        }
      })
      .catch(error => {
        if (commitCountKey === requested) {
          commitCountKey = undefined;
        }
        console.error("Failed to load commit count", error);
      });
  });

  // Enumerating refs requires loading and verifying sigrefs for every remote,
  // which takes hundreds of milliseconds on repos with many peers. The result
  // only feeds the peer selector dropdown, so it loads after render and is
  // kept across navigations within the same repo.
  let refs: RepoRefs | undefined = $state();
  let refsRid: string | undefined;

  $effect(() => {
    const requested = repo.rid;
    if (refsRid === requested) {
      return;
    }
    refsRid = requested;
    refs = undefined;
    void invoke<RepoRefs>("list_repo_refs", { rid: requested })
      .then(result => {
        if (refsRid === requested) {
          refs = result;
        }
      })
      .catch(error => {
        if (refsRid === requested) {
          refsRid = undefined;
        }
        console.error("Failed to load repo refs", error);
      });
  });
</script>

<style>
  .section {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .tab:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .tab.active {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .tab .global-counter-badge {
    margin-left: 0.25rem;
  }
  .selector-group {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }
  .commit-summary {
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 10rem;
  }
</style>

<div class="section">
  <div class="tabs">
    <a
      class="tab"
      class:active={active === "files"}
      href={router.routeToPath({
        resource: "repo.home",
        rid: repo.rid,
        peer,
        revision,
      })}>
      <Icon name="document" />Files
    </a>
    <a
      class="tab"
      class:active={active === "commits"}
      href={router.routeToPath({
        resource: "repo.commits",
        rid: repo.rid,
        peer,
        revision,
      })}>
      <Icon name="commit" />Commits
      {#if commitCount !== undefined}
        <span class="global-counter-badge">{commitCount}</span>
      {/if}
    </a>
  </div>

  {#if extra}
    {@render extra()}
  {/if}

  <div class="selector-group">
    <PeerSelector {baseRoute} {repo} {refs} {peer} {revision} />
    <Button
      variant="ghost"
      styleHeight="1.75rem"
      title={commit?.summary}
      onclick={() => {
        void router.push({
          resource: "repo.commit",
          rid: repo.rid,
          commit: oid,
        });
      }}>
      <span class="txt-id">{oid.slice(0, 7)}</span>
      {#if commit}
        <span class="commit-summary">
          {commit.summary}
        </span>
      {/if}
    </Button>
    {#if peer !== undefined || revision !== undefined}
      <Button
        variant="outline"
        styleHeight="1.75rem"
        title="Reset to canonical default branch"
        onclick={() => {
          void router.push({
            ...baseRoute,
            peer: undefined,
            revision: undefined,
          });
        }}>
        <Icon name="close" />
      </Button>
    {/if}
  </div>
  <JobCob rid={repo.rid} commit={oid} styleHeight="1.75rem" />
</div>
