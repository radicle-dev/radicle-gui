<script lang="ts">
  import type { BaseUrl, Repo, SeedingPolicy } from "@http-client";

  import dompurify from "dompurify";
  import { markdown, sanitizeConfig } from "@app/lib/markdown";
  import { formatRepositoryId, twemoji } from "@app/lib/utils";

  import Badge from "@app/components/Badge.svelte";
  import ContextRepo from "@app/views/repos/Sidebar/ContextRepo.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Link from "@app/components/Link.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";

  export let repo: Repo;
  export let repoId: string;
  export let baseUrl: BaseUrl;
  export let seedingPolicy: SeedingPolicy;

  function render(content: string): string {
    return dompurify.sanitize(
      markdown({ linkify: true, emojis: true }).parseInline(content) as string,
      sanitizeConfig,
    ) as string;
  }

  $: project = repo.payloads["xyz.radicle.project"];
</script>

<style>
  .header-layout {
    display: flex;
    gap: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .avatar {
    flex-shrink: 0;
    line-height: 0;
  }
  .meta {
    flex: 1;
    min-width: 0;
    padding: 1rem 0;
  }
  .info {
    flex: 1;
    min-width: 0;
    padding: 1rem;
    border-left: 1px solid var(--color-border-subtle);
    display: flex;
    align-items: center;
  }
  .title {
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-primary);
    display: flex;
    font: var(--txt-heading-l);
    justify-content: left;
    text-align: left;
    text-overflow: ellipsis;
  }
  .repo-name:hover {
    color: inherit;
  }
  .description {
    margin-top: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .description :global(a) {
    border-bottom: 1px solid var(--color-text-tertiary);
  }
  .description :global(a:hover) {
    border-bottom: 1px solid var(--color-text-primary);
  }

  @media (max-width: 719.98px) {
    .header-layout {
      flex-wrap: wrap;
      padding: 1rem;
    }
    .avatar :global(img) {
      width: 4rem !important;
    }
    .meta {
      flex-basis: 0;
      padding: 0;
    }
    .info {
      flex-basis: 100%;
      padding: 0;
      border-left: none;
      border-top: 1px solid var(--color-border-subtle);
      padding-top: 0.5rem;
    }
    .mobile-description {
      flex-basis: 100%;
    }
  }
</style>

<div class="header-layout">
  <div class="avatar">
    <RepoAvatar name={project.data.name} rid={repo.rid} styleWidth="10rem" />
  </div>
  <div class="meta">
    <div class="title">
      <span class="txt-overflow">
        <Link
          route={{
            resource: "repo.source",
            repo: repoId,
            node: baseUrl,
          }}>
          <span class="repo-name">
            {project.data.name}
          </span>
        </Link>
      </span>
      {#if repo.visibility.type === "private"}
        <Badge variant="private" size="tiny">
          <Icon name="lock" />
          Private
        </Badge>
      {/if}
    </div>
    <div>
      <Id shorten={false} id={repo.rid} ariaLabel="repo-id">
        {formatRepositoryId(repo.rid)}
      </Id>
    </div>
    <div
      class="description global-hide-on-mobile-down"
      title={project.data.description}
      use:twemoji>
      {@html render(project.data.description)}
    </div>
  </div>
  <div
    class="description mobile-description global-hide-on-small-desktop-up"
    title={project.data.description}
    use:twemoji>
    {@html render(project.data.description)}
  </div>
  <div class="info">
    <ContextRepo
      {baseUrl}
      repoThreshold={repo.threshold}
      repoDelegates={repo.delegates}
      {seedingPolicy} />
  </div>
</div>
