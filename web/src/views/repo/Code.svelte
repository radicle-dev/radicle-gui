<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { findReadme, isDir, lastCommitFor, listDir, splitRef } from "@app/lib/repo";
  import { copy, formatBytes, languageOf, plural, shortId, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import CodeView from "@app/components/CodeView.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import PeerSelector from "@app/components/PeerSelector.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";
  import IdentityEdit from "@app/components/IdentityEdit.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";

  interface Props {
    repo: Repo;
    rest: string;
    peer?: string;
  }

  const { repo, rest, peer }: Props = $props();

  const peerPerson = $derived(peer ? node.personByAlias(peer) : undefined);
  const peerBranches = $derived(
    peerPerson ? repo.remotes.find(r => r.person === peerPerson.id)?.branches : undefined,
  );
  const resolved = $derived(splitRef(repo, rest, peerBranches));
  const snapshot = $derived(repo.snapshots[resolved.commit] ?? {});
  const path = $derived(resolved.path);
  const dir = $derived(isDir(snapshot, path));
  const entries = $derived(dir ? listDir(snapshot, path) : []);
  const readme = $derived(dir ? findReadme(snapshot, path) : undefined);
  const file = $derived(!dir ? snapshot[path] : undefined);
  const base = $derived(node.repoPath(repo));
  const delegate = $derived(node.isDelegate(repo));
  const peerQuery = $derived(peerBranches && peer ? `?peer=${encodeURIComponent(peer)}` : "");
  const treeHref = (p: string) => `${base}/tree/${resolved.ref}${p ? `/${p}` : ""}${peerQuery}`;
  const latest = $derived(
    repo.commits[lastCommitFor(repo, resolved.commit, path) ?? resolved.commit],
  );
  const crumbs = $derived(
    path
      ? path.split("/").map((seg, i, all) => ({
          name: seg,
          path: all.slice(0, i + 1).join("/"),
        }))
      : [],
  );
  const commitCount = $derived(node.history(repo, resolved.commit).length);
  const isMarkdown = $derived(/\.md$/i.test(path));
  let mode = $state<"preview" | "code">("preview");

  const languages = $derived.by(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [p, c] of Object.entries(snapshot)) {
      const lang = languageOf(p) || "Other";
      counts[lang] = (counts[lang] ?? 0) + c.length;
      total += c.length;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lang, n]) => ({ lang, pct: (n / Math.max(total, 1)) * 100 }));
  });
  const palette = ["#886BF2", "#00D4DA", "#FFA5FF", "#009F67", "#CCFF38"];
  const release = $derived(repo.releases[repo.releases.length - 1]);
  const highlight = $derived.by(() => {
    const m = /^#L(\d+)(?:-L(\d+))?$/.exec(location.hash);
    return m ? { start: Number(m[1]), end: Number(m[2] ?? m[1]) } : undefined;
  });
</script>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    gap: 2rem;
  }
  .layout.full {
    grid-template-columns: minmax(0, 1fr);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-semibold);
    flex-wrap: wrap;
  }
  .crumbs .sep {
    color: var(--color-text-quaternary);
  }
  .latest {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-surface-base);
    font: var(--txt-body-m-regular);
    border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
  }
  .latest .msg {
    flex: 1;
    min-width: 0;
    color: var(--color-text-secondary);
  }
  .latest .meta {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
    white-space: nowrap;
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
    text-decoration: none;
    color: inherit;
  }
  .entry:last-child {
    border-bottom: none;
  }
  .entry:hover {
    background: var(--color-surface-base);
  }
  .entry .icon {
    color: var(--color-text-tertiary);
    display: flex;
  }
  .entry .when {
    margin-left: auto;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
    white-space: nowrap;
  }
  .entry .what {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
    flex: 1;
    min-width: 0;
    text-align: right;
  }
  .readme {
    margin-top: 1.5rem;
  }
  .readme-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-semibold);
  }
  .readme-body {
    padding: 1.5rem 2rem 2rem;
  }
  .file-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .file-head .grow {
    flex: 1;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }
  aside p {
    margin: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .facts .row {
    gap: 0.5rem;
  }
  .langbar {
    display: flex;
    height: 0.5rem;
    border-radius: var(--border-radius-full);
    overflow: hidden;
    margin-bottom: 0.625rem;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.875rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-secondary);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .rid {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
    word-break: break-all;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .editable-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .editable-row :global(.container) {
    margin-left: auto;
  }
  .inline-edit {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    padding: 0.125rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
    visibility: hidden;
  }
  .section-head .inline-edit,
  .editable-row:is(:hover, :focus-within) .inline-edit {
    visibility: visible;
  }
  .inline-edit:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .delegate {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  @media (max-width: 960px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

<div class="layout" class:full={path !== ""}>
  <div>
    <div class="toolbar">
      <PeerSelector {repo} peer={peerBranches ? peer : undefined} refName={resolved.ref} {path} />
      <div class="crumbs">
        <a class="link" href={treeHref("")}>{repo.name}</a>
        {#each crumbs as c (c.path)}
          <span class="sep">/</span>
          <a class="link" href={treeHref(c.path)}>{c.name}</a>
        {/each}
      </div>
      <span style="margin-left: auto;"></span>
      <a class="link muted txt-body-s-medium row" href={`${base}/commits`}>
        <Icon name="commit" />{plural(commitCount, "commit")}
      </a>
      <span class="muted txt-body-s-medium row">
        <Icon name="avatar-incognito" />{plural(repo.remotes.length, "peer")}
      </span>
    </div>

    {#if dir}
      <div class="card">
        {#if latest}
          <div class="latest">
            <Avatar person={latest.author} />
            <PersonLink person={latest.author} avatar={false} />
            <a class="msg link ellipsis" href={`${base}/commit/${latest.id}`}>{latest.summary}</a>
            <span class="meta">
              <a class="link mono" href={`${base}/commit/${latest.id}`}>{shortId(latest.id)}</a>
              {timeAgo(latest.time)}
            </span>
          </div>
        {/if}
        {#if path}
          <a class="entry" href={treeHref(path.split("/").slice(0, -1).join("/"))}>
            <span class="icon"><Icon name="folder" /></span>..
          </a>
        {/if}
        {#each entries as entry (entry.path)}
          {@const touched = repo.commits[lastCommitFor(repo, resolved.commit, entry.path) ?? ""]}
          <a class="entry" href={treeHref(entry.path)}>
            <span class="icon"><Icon name={entry.kind === "tree" ? "folder" : "document"} /></span>
            <span>{entry.name}</span>
            {#if touched}
              <span class="what ellipsis">{touched.summary}</span>
              <span class="when">{timeAgo(touched.time)}</span>
            {/if}
          </a>
        {/each}
      </div>

      {#if readme}
        <div class="card readme">
          <div class="readme-head"><Icon name="document" />{readme.split("/").pop()}</div>
          <div class="readme-body"><Markdown content={snapshot[readme]} /></div>
        </div>
      {/if}
    {:else if file !== undefined}
      <div class="card">
        {#if latest}
          <div class="latest">
            <Avatar person={latest.author} />
            <PersonLink person={latest.author} avatar={false} />
            <a class="msg link ellipsis" href={`${base}/commit/${latest.id}`}>{latest.summary}</a>
            <span class="meta">{timeAgo(latest.time)}</span>
          </div>
        {/if}
        <div class="file-head">
          <span>{file.split("\n").length} lines · {formatBytes(file.length)}</span>
          <span class="grow"></span>
          {#if isMarkdown}
            <SegmentedSwitch
              options={[
                { value: "preview", label: "Preview" },
                { value: "code", label: "Code" },
              ]}
              value={mode}
              onchange={v => (mode = v)} />
          {/if}
          <Button variant="naked" styleHeight="1.75rem" onclick={() => copy(file, "file contents")}>
            <Icon name="copy" /> Copy
          </Button>
        </div>
        {#if isMarkdown && mode === "preview"}
          <div class="readme-body"><Markdown content={file} /></div>
        {:else}
          <CodeView content={file} {highlight} />
        {/if}
      </div>
    {:else}
      <div class="card" style="padding: 2rem; text-align: center;">
        <span class="muted">There's no {path} at {resolved.ref}.</span>
      </div>
    {/if}
  </div>

  {#if path === ""}
    <aside>
      <div>
        <h2 class="section-title">About</h2>
        <p>{repo.description}</p>
      </div>
      <div class="facts">
        <span class="row"><Icon name="seed" />Seeded by {plural(repo.seedCount, "node")}</span>
        <span class="row editable-row">
          <Icon name="branch" />Default branch <span class="mono">{repo.defaultBranch}</span>
          {#if delegate}
            <IdentityEdit {repo} kind="setDefaultBranch" placement="bottom-end">
              {#snippet trigger(toggle)}
                <button class="inline-edit" onclick={toggle} title="Change default branch" aria-label="Change default branch">
                  <Icon name="edit" />
                </button>
              {/snippet}
            </IdentityEdit>
          {/if}
        </span>
        {#if release}
          <a class="row link" href={`${base}/releases`}>
            <Icon name="parcel" />Latest release {release.tag}
          </a>
        {/if}
      </div>
      <div>
        <div class="section-head">
          <h2 class="section-title">Maintainers</h2>
          {#if delegate}
            <IdentityEdit {repo} kind="addDelegate" placement="bottom-end">
              {#snippet trigger(toggle)}
                <button class="inline-edit" onclick={toggle} title="Add a maintainer" aria-label="Add a maintainer">
                  <Icon name="plus" />
                </button>
              {/snippet}
            </IdentityEdit>
          {/if}
        </div>
        <div class="stack">
          {#each repo.delegates as d (d)}
            <div class="delegate editable-row">
              <PersonLink person={d} size="1.25rem" />
              {#if delegate && repo.delegates.length > 1}
                <IdentityEdit {repo} kind="removeDelegate" person={d} placement="bottom-end">
                  {#snippet trigger(toggle)}
                    <button class="inline-edit" onclick={toggle} title="Remove maintainer" aria-label={`Remove ${node.person(d).alias}`}>
                      <Icon name="close" />
                    </button>
                  {/snippet}
                </IdentityEdit>
              {/if}
            </div>
          {/each}
        </div>
        <p class="muted txt-body-s-regular editable-row" style="margin-top: 0.625rem;">
          <span>
            {repo.threshold} of {repo.delegates.length} must agree for a change to
            {repo.defaultBranch} to count.
          </span>
          {#if delegate && repo.delegates.length > 1}
            <IdentityEdit {repo} kind="setThreshold" placement="bottom-end">
              {#snippet trigger(toggle)}
                <button class="inline-edit" onclick={toggle} title="Change approvals needed" aria-label="Change approvals needed">
                  <Icon name="edit" />
                </button>
              {/snippet}
            </IdentityEdit>
          {/if}
        </p>
        <a class="link txt-body-s-medium row" style="margin-top: 0.5rem;" href={`${node.repoPath(repo)}/identity`}>
          <Icon name="key" />Identity document
        </a>
      </div>
      <div>
        <h2 class="section-title">Languages</h2>
        <div class="langbar">
          {#each languages as l, i (l.lang)}
            <span style:width={`${l.pct}%`} style:background={palette[i % palette.length]}></span>
          {/each}
        </div>
        <div class="legend">
          {#each languages as l, i (l.lang)}
            <span>
              <span class="dot" style:background={palette[i % palette.length]}></span>
              {l.lang}
              <span class="muted">{l.pct.toFixed(0)}%</span>
            </span>
          {/each}
        </div>
      </div>
      <div>
        <h2 class="section-title">Repository ID</h2>
        <div class="row">
          <span class="rid">{repo.rid}</span>
          <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(repo.rid, "repository ID")}>
            <Icon name="copy" />
          </Button>
        </div>
      </div>
    </aside>
  {/if}
</div>
