<script lang="ts">
  import type { RepoInfo } from "./RepoCard";
  import type { BaseUrl } from "@http-client";

  import { HttpdClient } from "@http-client";

  import {
    absoluteTimestamp,
    formatTimestamp,
    formatRepositoryId,
    repoSegment,
    twemoji,
  } from "@app/lib/utils";

  import ActivityDiagram from "@app/components/ActivityDiagram.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Link from "@app/components/Link.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";

  export let compact = false;
  export let repoInfo: RepoInfo;
  export let baseUrl: BaseUrl;

  const api = new HttpdClient(baseUrl);

  $: repo = repoInfo.repo;
  $: project = repoInfo.repo.payloads["xyz.radicle.project"];
  $: baseUrl = repoInfo.baseUrl;
  $: isPrivate = repo.visibility.type === "private";
</script>

<style>
  .repo-card {
    container-type: inline-size;
    height: 10rem;
    background-color: var(--color-surface-canvas);
    padding: 1rem;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid var(--color-border-subtle);
    margin-top: -1px;
    margin-left: -1px;
  }

  .repo-card.compact {
    height: 8rem;
  }

  .repo-card:hover {
    background-color: var(--color-surface-subtle);
  }

  .content-and-activity {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .content {
    flex: 1;
    min-width: 0;
  }

  .activity {
    flex: 1;
    max-width: 9rem;
    align-self: flex-end;
  }

  .activity-shimmer {
    width: 100%;
    min-width: 130px;
    aspect-ratio: 493 / 116;
    background: linear-gradient(
      90deg,
      var(--color-surface-base) 0%,
      var(--color-surface-subtle) 50%,
      var(--color-surface-base) 100%
    );
    background-size: 200% 100%;
    animation:
      shimmer 1.8s ease-in-out infinite,
      shimmer-fade-in 200ms ease-out 500ms both;
  }

  @keyframes shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }

  @keyframes shimmer-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .headline-and-badges {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .badges {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    overflow: hidden;
    position: relative;
    padding: 0.25rem;
  }

  .stats-row {
    position: relative;
    display: flex;
    gap: 0.25rem;
    height: 1.5rem;
    align-items: center;
    white-space: nowrap;
  }

  .icon {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-brand-bg);
    color: var(--color-text-on-brand);
  }

  @container (max-width: 22rem) {
    .activity {
      display: none;
    }
  }
</style>

<Link
  route={{
    resource: "repo.source",
    repo: repoSegment(repo),
    node: baseUrl,
  }}>
  <div class="repo-card" class:compact>
    <div class="headline-and-badges txt-overflow">
      <div class="icon">
        <RepoAvatar
          rid={repoInfo.repo.rid}
          name={project.data.name}
          styleWidth="1.5rem" />
      </div>
      <div class="txt-body-l-semibold" use:twemoji>{project.data.name}</div>
      <div class="badges" style:margin-left="auto">
        {#if isPrivate}
          <div
            title="Private"
            class="badge"
            style="background-color: var(--color-feedback-warning-bg); color: var(--color-feedback-warning-text)">
            <Icon name="lock" />
          </div>
        {/if}
        <slot name="delegate" />
      </div>
    </div>
    <div class="content-and-activity">
      <div class="content">
        <div class="txt-body-m-regular txt-overflow" use:twemoji>
          {project.data.description}
        </div>
        <span style:text-overflow="ellipsis">
          <Id id={repo.rid} title={repo.rid}>
            {formatRepositoryId(repo.rid)}
          </Id>
        </span>
      </div>
      <div class="activity">
        {#await repoInfo.activity}
          <div class="activity-shimmer"></div>
        {:then activity}
          <ActivityDiagram
            id={repo.rid}
            viewBoxHeight={100}
            styleColor="var(--color-text-brand)"
            {activity} />
        {/await}
      </div>
    </div>
    <div>
      <div
        class="stats-row txt-code-regular"
        style:color="var(--color-text-tertiary)">
        <Icon name="seed" />
        {repoInfo.repo.seeding} ·
        <Icon name="issue" />
        {project.meta.issues.open} ·
        <Icon name="patch" />
        {project.meta.patches.open}
        {#await api.repo.getCommitBySha(repo.rid, project.meta.head) then { commit }}
          <span
            class="txt-body-m-regular"
            style:margin-left="auto"
            style:overflow="hidden"
            style:text-overflow="ellipsis"
            title={absoluteTimestamp(commit.committer.time)}>
            Updated {formatTimestamp(commit.committer.time)}
          </span>
        {/await}
      </div>
    </div>
  </div>
</Link>
