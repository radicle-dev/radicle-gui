<script lang="ts">
  import type { Diff } from "@bindings/diff/Diff";
  import type { Commit } from "@bindings/repo/Commit";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { diffOptions } from "@app/lib/diffOptions.svelte";
  import {
    fileMetaOf,
    fullFileLoader,
    gitStatusEntries,
  } from "@app/lib/diffText";
  import { getDiffText } from "@app/lib/invoke";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import {
    commitTimes,
    formatOid,
    formatTimestamp,
    identityKey,
    pluralize,
  } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CommitAuthors from "@app/components/CommitAuthors.svelte";
  import DiffActions from "@app/components/DiffActions.svelte";
  import DiffStatBadge from "@app/components/DiffStatBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import JobCob from "@app/components/JobCob.svelte";
  import PierreDiff from "@app/components/PierreDiff.svelte";
  import PierreTree from "@app/components/PierreTree.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";
  import Topbar from "@app/components/Topbar.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    commit: Commit;
    diff: Diff;
    // Unified patch text feeding the rendered diff (Pierre renders from this,
    // not from the structured `diff`).
    patch: string;
    sidebarData: SidebarData;
  }

  const { repo, commit, diff, patch, sidebarData }: Props = $props();

  let diffView = $state<{
    scrollToFile: (path: string) => void;
    setAllCollapsed: (collapsed: boolean) => void;
  }>();
  let allCollapsed = $state(false);

  const authorIsCommitter = $derived(
    identityKey(commit.author) === identityKey(commit.committer),
  );

  const changedFiles = $derived(gitStatusEntries(diff.files));
  const treePaths = $derived(changedFiles.map(file => file.path));

  const fileMeta = $derived(fileMetaOf(diff.files));
  const fileNotes = $derived(fileMeta.notes);
  const fileStatuses = $derived(fileMeta.statuses);

  // Pierre's context-expand markers hydrate a file lazily from these. The old
  // side comes from the commit's first parent, which a root commit does not
  // have.
  const loadFullFile = $derived(
    fullFileLoader(repo.rid, commit.parents[0], commit.id, () => diff.files),
  );
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .tree-col {
    width: 16.5rem;
    flex: none;
    min-height: 0;
    border-right: 1px solid var(--color-border-subtle);
    padding-top: 0.5rem;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .topbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
  }
  .breadcrumb-link {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .breadcrumb-link:hover {
    color: var(--color-text-primary);
  }
  .meta {
    padding: 1rem 1rem 0.5rem;
  }
  .meta-header {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0 0 1rem;
    flex-wrap: wrap;
  }
  .meta-title {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .summary {
    font: var(--txt-body-l-semibold);
    overflow-wrap: anywhere;
  }
  .summary-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    /* Reserve the JobCob widget's height (2rem) so the row doesn't shift when
       the job status loads in asynchronously. */
    min-height: 2rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
  }
  .summary-author {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .summary-timestamp {
    color: var(--color-text-quaternary);
  }
  .summary-message {
    white-space: pre-wrap;
    margin: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .summary-parents {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .summary-parents-label {
    font: inherit;
    color: inherit;
  }
  .parent-link {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
  }
  .parent-link:hover {
    color: var(--color-text-primary);
  }
  .chips {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    padding-top: 0.125rem;
  }
  .files-chip {
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    height: 1.5rem;
    display: flex;
    align-items: center;
    font: var(--txt-code-regular);
    color: var(--color-text-secondary);
  }
</style>

{#snippet commitMeta()}
  <section class="meta">
    <div class="meta-header">
      <div class="meta-title">
        <div class="summary txt-selectable">
          {#if !commit.summary}
            <span class="txt-missing">No commit message</span>
          {:else}
            {commit.summary}
          {/if}
        </div>
        <div class="summary-meta">
          <span class="summary-author">
            <CommitAuthors {commit} />
            <span class="txt-selectable">{commit.author.name}</span>
          </span>
          {authorIsCommitter ? "committed" : "authored"}
          <Id id={commit.id} clipboard={commit.id} label="commit hash" />
          <span class="summary-timestamp" title={commitTimes(commit)}>
            {formatTimestamp(commit.committer.time * 1000)}
          </span>
          <JobCob rid={repo.rid} commit={commit.id} />
        </div>
        <div class="summary-parents">
          <span class="summary-parents-label">
            {commit.parents.length === 1 ? "parent" : "parents"}
          </span>
          {#if commit.parents.length === 0}
            <span>Initial commit</span>
          {:else}
            {#each commit.parents as parent}
              <button
                class="parent-link txt-id"
                onclick={() => {
                  void router.push({
                    resource: "repo.commit",
                    rid: repo.rid,
                    commit: parent,
                  });
                }}>
                {formatOid(parent)}
              </button>
            {/each}
          {/if}
        </div>
        <pre class="summary-message txt-selectable">{commit.message
            .replace(commit.summary, "")
            .trim()}</pre>
      </div>
      <div class="chips">
        <div class="files-chip">
          {diff.stats.filesChanged}
          {pluralize("file", diff.stats.filesChanged)} changed
        </div>
        <DiffStatBadge stats={diff.stats} />
        <DiffActions
          text={() => Promise.resolve(patch)}
          fileName={`${formatOid(commit.id)}.diff`}
          title="Diff actions" />
      </div>
    </div>
  </section>
{/snippet}

<Layout selfScroll>
  <div class="page">
    <Topbar>
      <Button
        variant="naked"
        onclick={() => (diffOptions.showTree = !diffOptions.showTree)}
        title="Toggle file tree">
        <Icon
          name={diffOptions.showTree
            ? "sidebar-left-filled"
            : "sidebar-left"} />
      </Button>
      <div class="breadcrumb">
        <button
          class="breadcrumb-link"
          onclick={() =>
            router.push({
              resource: "repo.commits",
              rid: repo.rid,
            })}>
          All commits
        </button>
        <Icon name="chevron-right" />
        <Id id={commit.id} clipboard={commit.id} label="commit hash" />
      </div>
      <div class="topbar-right">
        <span style:display="inline-flex" style:margin-right="0.5rem">
          <ShareButton
            target={{ type: "commit", rid: repo.rid, oid: commit.id }}
            id={commit.id}
            idLabel="commit"
            config={sidebarData.config} />
        </span>
        <Button
          variant="naked"
          onclick={() => {
            allCollapsed = !allCollapsed;
            diffView?.setAllCollapsed(allCollapsed);
          }}
          title={allCollapsed ? "Expand all files" : "Collapse all files"}>
          <Icon name={allCollapsed ? "expand-vertical" : "collapse-vertical"} />
        </Button>
      </div>
    </Topbar>
    <div class="body">
      {#if diffOptions.showTree}
        <div class="tree-col">
          <PierreTree
            paths={treePaths}
            gitStatus={changedFiles}
            onSelect={path => diffView?.scrollToFile(path)} />
        </div>
      {/if}
      <!-- The metadata is passed as the header snippet so Pierre renders it
           inside its scroll container: it scrolls away, leaving only the
           sticky file headers pinned to the top. -->
      <PierreDiff
        bind:this={diffView}
        {patch}
        diffStyle={diffOptions.diffStyle}
        wordWrap={diffOptions.wordWrap}
        diffIndicators={diffOptions.indicators}
        lineDiffType={diffOptions.lineDiffType}
        {loadFullFile}
        {fileNotes}
        {fileStatuses}
        fileDiffText={path =>
          getDiffText(repo.rid, undefined, commit.id, 3, path)}
        cacheKeyPrefix={commit.id}
        header={commitMeta} />
    </div>
  </div>
</Layout>
