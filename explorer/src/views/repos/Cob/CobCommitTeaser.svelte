<script lang="ts">
  import type { BaseUrl, CommitHeader } from "@http-client";
  import type { Snippet } from "svelte";

  import { twemoji } from "@app/lib/utils";
  import { renderCommitDescription } from "@app/lib/commit";

  import CompactCommitAuthorship from "@app/components/CompactCommitAuthorship.svelte";
  import ExpandButton from "@app/components/ExpandButton.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Link from "@app/components/Link.svelte";

  export let baseUrl: BaseUrl;
  export let commit: CommitHeader;
  export let repoId: string;
  export let children: Snippet | undefined = undefined;

  let commitMessageVisible = false;
</script>

<style>
  .teaser {
    display: flex;
    font: var(--txt-body-m-regular);
    align-items: start;
    padding: 0.125rem 0;
  }
  .message {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .left {
    display: flex;
    gap: 0.5rem;
    padding: 0 0.5rem;
    flex-direction: column;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-left: auto;
    height: 21px;
  }
  .authorship {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .summary:hover {
    text-decoration: underline;
  }
  .commit-message {
    margin: 0.5rem 0;
    font: var(--txt-body-s-regular);
  }
  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>

<div class="teaser" aria-label="commit-teaser">
  <div class="left">
    <div class="message">
      <Link
        route={{
          resource: "repo.commit",
          repo: repoId,
          node: baseUrl,
          commit: commit.id,
        }}>
        <div class="summary" use:twemoji>
          {#if !commit.summary}
            <span style:color="var(--color-text-tertiary)">
              No commit message
            </span>
          {:else}
            <InlineTitle fontSize="body-m-regular" content={commit.summary} />
          {/if}
        </div>
      </Link>
      {#if commit.description}
        <div style="height: 21px; display: flex; align-items: center;">
          <ExpandButton
            variant="inline"
            on:toggle={() => {
              commitMessageVisible = !commitMessageVisible;
            }} />
        </div>
      {/if}
    </div>
    {#if commitMessageVisible}
      <div class="commit-message" style:margin="0.5rem 0">
        <pre>{@html renderCommitDescription(commit.description)}</pre>
      </div>
    {/if}
    <div class="authorship global-hide-on-small-desktop-up">
      <CompactCommitAuthorship {commit}>
        <Id id={commit.id} />
      </CompactCommitAuthorship>
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
  <div class="right">
    <div style="display: flex; gap: 0.5rem; height: 21px; align-items: center;">
      <div class="authorship global-hide-on-mobile-down">
        {#if children}
          {@render children()}
        {/if}
        <CompactCommitAuthorship {commit}>
          <Id id={commit.id} />
        </CompactCommitAuthorship>
      </div>
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
