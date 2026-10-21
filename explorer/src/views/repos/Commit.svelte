<script lang="ts">
  import type { BaseUrl, Commit, Repo } from "@http-client";

  import {
    archiveDownloadSupported,
    archiveUnsupportedMessage,
  } from "@app/lib/archive";
  import { baseUrlToString, formatObjectId } from "@app/lib/utils";
  import { renderCommitDescription } from "@app/lib/commit";

  import Button from "@app/components/Button.svelte";
  import Changeset from "@app/views/repos/Changeset.svelte";
  import CommitAuthorship from "@app/views/repos/Commit/CommitAuthorship.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import JobCob from "@app/components/JobCob.svelte";
  import Layout from "./Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import Popover from "@app/components/Popover.svelte";
  import Separator from "./Separator.svelte";

  export let baseUrl: BaseUrl;
  export let commit: Commit;
  export let repo: Repo;
  export let repoId: string;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  let downloading = false;

  async function downloadArchive(): Promise<boolean> {
    const url = `${baseUrlToString(baseUrl)}/raw/${repo.rid}/${commit.commit.id}.tar.gz`;
    try {
      if (await archiveDownloadSupported(url)) {
        window.location.href = url;
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  $: header = commit.commit;
</script>

<style>
  .commit {
    background-color: var(--color-surface-subtle);
  }
  .header {
    padding: 1rem;
    background-color: var(--color-surface-canvas);
    border-radius: var(--border-radius-md);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    display: flex;
    align-items: center;
  }
  .description {
    font: var(--txt-code-regular);
    white-space: pre-wrap;
    margin-top: 1.5rem;
  }
  .button-container {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
  }
  .download-error {
    font: var(--txt-body-m-regular);
    width: 18rem;
  }
</style>

<Layout {nodeId} {nodeAvatarUrl} {baseUrl} {repo} {repoId}>
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
    <Separator />
    <span class="txt-id">
      <div class="global-hide-on-small-desktop-down">
        {commit.commit.id}
      </div>
      <div class="global-hide-on-medium-desktop-up">
        {formatObjectId(commit.commit.id)}
      </div>
    </span>
  </svelte:fragment>
  <div class="commit">
    <div class="header">
      <div style="display:flex; flex-direction: column; gap: 0.5rem;">
        <span class="title">
          {#if !header.summary}
            <span
              class="txt-heading-l"
              style:color="var(--color-text-tertiary)">
              No commit message
            </span>
          {:else}
            <InlineTitle fontSize="heading-l" content={header.summary} />
          {/if}
          <div class="button-container">
            <Link
              route={{
                resource: "repo.source",
                repo: repoId,
                node: baseUrl,
                path: "/",
                revision: commit.commit.id,
              }}>
              <Button variant="outline" title="Browse repo at this commit">
                <Icon name="chevron-left-right" />
              </Button>
            </Link>
            <Popover popoverPositionTop="2.5rem" popoverPositionRight="0">
              <Button
                slot="toggle"
                let:toggle
                let:expanded
                on:click={async () => {
                  if (expanded) {
                    toggle();
                  } else if (!downloading) {
                    downloading = true;
                    const ok = await downloadArchive();
                    downloading = false;
                    if (!ok) {
                      toggle();
                    }
                  }
                }}
                variant="outline">
                <Icon name="archive" />Download
              </Button>
              <div slot="popover" class="download-error">
                {archiveUnsupportedMessage}
              </div>
            </Popover>
          </div>
        </span>
        <CommitAuthorship {header}>
          <Id id={header.id} ariaLabel="commit-id" />
          <JobCob
            slot="after-timestamp"
            {baseUrl}
            rid={repo.rid}
            commit={header.id} />
        </CommitAuthorship>
        <span class="txt-body-m-regular">
          {header.parents.length === 1 ? "Parent" : "Parents"}:
          {#each header.parents as parent, i}
            {i > 0 ? " + " : ""}
            <Link
              styleHoverState
              route={{
                resource: "repo.commit",
                repo: repoId,
                node: baseUrl,
                commit: parent,
              }}>
              <span class="txt-id">{formatObjectId(parent)}</span>
            </Link>
          {/each}
        </span>
      </div>
      {#if header.description}
        <pre class="description">{@html renderCommitDescription(
            header.description,
          )}</pre>
      {/if}
    </div>
    <Changeset
      {baseUrl}
      {repoId}
      files={commit?.files}
      diff={commit?.diff}
      revision={commit?.commit?.id} />
  </div>
</Layout>
