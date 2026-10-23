<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { formatBytes, fullDate, shortId, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Button from "@app/components/Button.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";

  interface Props {
    repo: Repo;
  }

  const { repo }: Props = $props();
  const base = $derived(node.repoPath(repo));
  const releases = $derived([...repo.releases].sort((a, b) => b.time - a.time));
  let downloading = $state<Record<string, number>>({});

  function download(cid: string) {
    downloading[cid] = 0;
    const tick = setInterval(() => {
      downloading[cid] = Math.min(100, (downloading[cid] ?? 0) + 7 + Math.random() * 15);
      if (downloading[cid] >= 100) {
        clearInterval(tick);
        setTimeout(() => delete downloading[cid], 1200);
      }
    }, 120);
  }
</script>

<style>
  .release {
    display: grid;
    grid-template-columns: 12rem minmax(0, 1fr);
    gap: 2rem;
    padding: 2rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .release:first-child {
    padding-top: 0;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .tag {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }
  .latest {
    font: var(--txt-body-s-semibold);
    color: var(--color-feedback-success-text);
  }
  h2 {
    font: var(--txt-heading-l);
    margin: 0 0 1rem;
  }
  .artifacts {
    margin-top: 1.5rem;
  }
  .artifact {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
  .artifact:last-child {
    border-bottom: none;
  }
  .artifact .name {
    flex: 1;
    min-width: 0;
  }
  .cid {
    font: var(--txt-code-small);
    color: var(--color-text-quaternary);
  }
  .progress {
    width: 6rem;
    height: 0.375rem;
    border-radius: var(--border-radius-full);
    background: var(--color-surface-subtle);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--color-surface-brand-primary);
  }
  @media (max-width: 760px) {
    .release {
      grid-template-columns: minmax(0, 1fr);
      gap: 1rem;
    }
  }
</style>

{#each releases as release, i (release.id)}
  <div class="release">
    <div class="side">
      <span class="tag"><Icon name="label" />{release.tag}</span>
      {#if i === 0}<span class="latest">Latest</span>{/if}
      <span title={fullDate(release.time)}>{timeAgo(release.time)}</span>
      <PersonLink person={release.author} />
      <a class="link mono txt-body-s-regular" href={`${base}/commit/${release.commit}`}>
        {shortId(release.commit)}
      </a>
    </div>
    <div>
      <h2>{release.title}</h2>
      <Markdown content={release.notes} compact />
      {#if release.artifacts.length > 0}
        <div class="artifacts">
          <h3 class="section-title">Artifacts</h3>
          <div class="card">
            {#each release.artifacts as a (a.cid)}
              <div class="artifact">
                <Icon name="parcel" />
                <div class="name">
                  <div class="ellipsis">{a.name}</div>
                  <div class="cid ellipsis">{a.cid}</div>
                </div>
                <span class="muted txt-body-s-regular">{formatBytes(a.sizeBytes)}</span>
                {#if downloading[a.cid] !== undefined}
                  <span class="progress"><span style:width={`${downloading[a.cid]}%`}></span></span>
                {:else}
                  <Button variant="ghost" styleHeight="1.75rem" onclick={() => download(a.cid)}>
                    <Icon name="download" /> Download
                  </Button>
                {/if}
              </div>
            {/each}
          </div>
          <p class="muted txt-body-s-regular">
            Artifacts are fetched from peers by content ID and verified on your device.
          </p>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <Empty icon="parcel" title="No releases yet">Releases bundle a tag with notes and downloadable artifacts.</Empty>
{/each}
