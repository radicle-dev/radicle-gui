<script lang="ts">
  import type { BaseUrl, CommitHeader } from "@http-client";

  import { twemoji } from "@app/lib/utils";
  import { renderCommitDescription } from "@app/lib/commit";

  import CommitAuthorship from "./CommitAuthorship.svelte";
  import ExpandButton from "@app/components/ExpandButton.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Link from "@app/components/Link.svelte";
  import Id from "@app/components/Id.svelte";

  export let baseUrl: BaseUrl;
  export let commit: CommitHeader;
  export let repoId: string;

  let commitMessageVisible = false;
</script>

<style>
  .teaser {
    display: flex;
    padding: 1.25rem;
    background-color: var(--color-surface-canvas);
  }
  .teaser:hover {
    background-color: var(--color-surface-mid);
  }
  .message {
    align-items: center;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .right {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-left: auto;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .summary {
    font: var(--txt-body-m-regular);
  }
  .summary::after {
    content: "";
    position: absolute;
    top: -10px;
    right: 0px;
    bottom: -10px;
    left: -10px;
  }
  .summary:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .commit-message {
    margin: 0.5rem 0;
    font: var(--txt-body-m-regular);
  }
  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>

<div class="teaser">
  <div class="left">
    <div class="message">
      <Link
        route={{
          resource: "repo.commit",
          repo: repoId,
          node: baseUrl,
          commit: commit.id,
        }}>
        <div style="position: relative;">
          <div class="summary" use:twemoji>
            {#if !commit.summary}
              <span style:color="var(--color-text-tertiary)">
                No commit message
              </span>
            {:else}
              <InlineTitle fontSize="body-m-regular" content={commit.summary} />
            {/if}
          </div>
        </div>
      </Link>
      {#if commit.description}
        <ExpandButton
          variant="inline"
          on:toggle={() => {
            commitMessageVisible = !commitMessageVisible;
          }} />
      {/if}
    </div>
    {#if commitMessageVisible}
      <div class="commit-message">
        <pre>{@html renderCommitDescription(commit.description)}</pre>
      </div>
    {/if}
    <CommitAuthorship header={commit}>
      <Id id={commit.id} />
    </CommitAuthorship>
  </div>
  <div class="right">
    <div style:display="flex" style:gap="1rem" style:height="1.5rem">
      <IconButton title="Browse repo at this commit">
        <Link
          route={{
            resource: "repo.source",
            repo: repoId,
            node: baseUrl,
            revision: commit.id,
          }}>
          <Icon name="chevron-left-right" />
        </Link>
      </IconButton>
    </div>
  </div>
</div>
