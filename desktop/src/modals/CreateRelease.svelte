<script lang="ts">
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { ArtifactDigest } from "@bindings/cob/release/ArtifactDigest";
  import type { Commit } from "@bindings/repo/Commit";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";
  import type { Tag } from "@bindings/repo/Tag";

  import { untrack } from "svelte";

  import { pickFiles, pickFolder } from "@app/lib/artifactPickers";
  import { basename } from "@app/lib/embeds";
  import { artifactNodeRunning } from "@app/lib/events";
  import { invoke, InvokeError } from "@app/lib/invoke";
  import { disableHide, enableHide, forceHide } from "@app/lib/modal";
  import { isOid } from "@app/lib/radUri";
  import { sortedTags } from "@app/lib/refs";
  import { matchCommits } from "@app/lib/releases";
  import * as router from "@app/lib/router";
  import { duplicatePicks } from "@app/lib/stageArtifacts";
  import { formatBytes, formatOid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Checkbox from "@app/components/Checkbox.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    repo: RepoInfo;
  }

  const { repo }: Props = $props();

  interface NamedTag {
    name: string;
    tag: Tag;
  }

  interface PendingPick {
    path: string;
    name: string;
    hashing: boolean;
    digest?: ArtifactDigest;
    error?: string;
  }

  let tags: NamedTag[] = $state([]);
  let tagsError = $state(false);
  let selectedTag: NamedTag | undefined = $state();
  let commitInput = $state("");
  let commits: Commit[] = $state([]);
  let commitPickerExpanded = $state(false);
  // The commit the input names, once it is known to exist in the repo.
  let resolvedCommit: Commit | undefined = $state();
  let commitMissing = $state(false);
  let staged: PendingPick[] = $state([]);
  let submitting = $state(false);
  let submitError: string | undefined = $state();
  let seedFailures = $state(0);
  // Once set, the target is fixed and closing the modal opens the release.
  let createdId: string | undefined = $state();
  let popoverExpanded = $state(false);
  const nodeRunning = $derived($artifactNodeRunning === true);
  let seedAfterRegister = $state(true);
  const canSeed = $derived(nodeRunning && seedAfterRegister);

  // The store rejects lightweight tags, whose `tagOid` is absent.
  const target = $derived.by(() => {
    if (selectedTag) {
      return {
        oid: selectedTag.tag.oid,
        tag: selectedTag.tag.tagOid,
      };
    }
    const oid = commitInput.trim();
    return resolvedCommit?.id === oid ? { oid, tag: undefined } : undefined;
  });

  const commitQuery = $derived(commitInput.trim().toLowerCase());
  const commitItems = $derived(
    matchCommits(commits, commitQuery, resolvedCommit),
  );

  const duplicateOf = $derived(duplicatePicks(staged));
  const anyFolder = $derived(staged.some(a => a.digest?.directory));

  const ready = $derived(
    staged.length > 0 &&
      staged.every(a => a.digest !== undefined) &&
      target !== undefined,
  );

  $effect(() => {
    if (staged.length > 0 || selectedTag || commitInput.trim() !== "") {
      disableHide();
    } else {
      enableHide();
    }
  });

  // Only canonical tags: a peer's tag of the same name could point a release
  // at a commit the delegates never tagged.
  $effect(() => {
    void invoke<Record<string, Tag>>("list_canonical_tags", { rid: repo.rid })
      .then(result => {
        tags = sortedTags(result).map(([name, tag]) => ({ name, tag }));
      })
      .catch((error: unknown) => {
        console.error("Could not list tags:", error);
        tagsError = true;
      });
  });

  $effect(() => {
    void invoke<PaginatedQuery<Commit[]>>("list_repo_commits", {
      rid: repo.rid,
      take: 50,
    })
      .then(result => {
        commits = result.content;
      })
      .catch((error: unknown) => {
        console.error("Could not list commits:", error);
      });
  });

  function lookupCommit(oid: string) {
    resolvedCommit = undefined;
    commitMissing = false;
    if (!isOid(oid)) {
      return;
    }
    const known = commits.find(c => c.id === oid);
    if (known) {
      resolvedCommit = known;
      return;
    }
    let cancelled = false;
    void invoke<Commit>("repo_commit", { rid: repo.rid, sha: oid })
      .then(commit => {
        if (!cancelled) {
          resolvedCommit = commit;
        }
      })
      .catch(() => {
        if (!cancelled) {
          commitMissing = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }

  // Only the input drives the lookup: the modal store re-creates `repo`
  // whenever hiding is toggled, which would otherwise repeat it.
  $effect(() => {
    const oid = commitInput.trim();
    return untrack(() => lookupCommit(oid));
  });

  async function stage(paths: string[]) {
    const picked = paths
      .filter(path => !staged.some(a => a.path === path))
      .map(path => ({ path, name: basename(path), hashing: true }));
    if (picked.length === 0) {
      return;
    }
    staged = [...staged, ...picked];

    await Promise.all(
      picked.map(async entry => {
        try {
          const digest = await invoke<ArtifactDigest>("compute_artifact_cid", {
            path: entry.path,
          });
          staged = staged.map(a =>
            a.path === entry.path ? { ...a, digest, hashing: false } : a,
          );
        } catch {
          staged = staged.map(a =>
            a.path === entry.path
              ? { ...a, hashing: false, error: "Could not read file" }
              : a,
          );
        }
      }),
    );
  }

  async function chooseFiles() {
    const paths = await pickFiles();
    if (paths.length > 0) {
      await stage(paths);
    }
  }

  async function chooseFolder() {
    const path = await pickFolder();
    if (path) {
      await stage([path]);
    }
  }

  async function submit() {
    if (!target || !ready) {
      return;
    }
    submitting = true;
    submitError = undefined;
    seedFailures = 0;
    let releaseId: string | undefined;
    try {
      releaseId = await invoke<string>("create_or_open_release", {
        rid: repo.rid,
        oid: target.oid,
        tag: target.tag,
      });
      createdId = releaseId;
      for (const artifact of staged) {
        if (!artifact.digest || duplicateOf.has(artifact.path)) {
          continue;
        }
        await invoke("register_artifact", {
          rid: repo.rid,
          releaseId,
          cid: artifact.digest.cid,
          name: artifact.name,
          sizeBytes: artifact.digest.sizeBytes,
        });

        if (canSeed) {
          // A seed failure must not discard the release we just created.
          try {
            await invoke("seed_artifact", {
              rid: repo.rid,
              releaseId,
              cid: artifact.digest.cid,
              sourcePath: artifact.path,
            });
          } catch {
            seedFailures += 1;
          }
        }
      }
      // Creating and registering are idempotent, so a retry only re-seeds.
    } catch (error) {
      if (
        error instanceof InvokeError &&
        error.code === "RepoError.CommitNotFound"
      ) {
        submitError = `Commit ${formatOid(target.oid)} is not in this repo.`;
      } else if (releaseId === undefined) {
        submitError = "Could not create the release.";
      } else {
        submitError = "Could not register the artifacts.";
      }
      return;
    } finally {
      submitting = false;
    }
    if (seedFailures > 0 || releaseId === undefined) {
      return;
    }
    await close();
  }

  async function close() {
    if (createdId === undefined) {
      forceHide();
      return;
    }
    // Navigate before hiding: closing the modal drops its props.
    try {
      await router.push({
        resource: "repo.release",
        rid: repo.rid,
        release: createdId,
      });
    } finally {
      enableHide();
      forceHide();
    }
  }
</script>

<style>
  .modal {
    width: 44rem;
    font: var(--txt-body-m-regular);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    min-width: 0;
  }
  .repo-name {
    font: var(--txt-body-m-semibold);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .section-title {
    font: var(--txt-body-m-semibold);
    color: var(--color-text-secondary);
  }
  .hint {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .target-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .commit-summary {
    min-width: 0;
    max-width: 28rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text-secondary);
  }
  .artifact {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
  .artifact:last-child {
    border-bottom: none;
  }
  .artifact-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .artifact-meta {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .artifact-list {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .warning {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
  }
  .warning-icon {
    display: inline-flex;
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: var(--color-feedback-warning-text);
  }
  .error {
    font: var(--txt-body-m-regular);
    color: var(--color-foreground-red);
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }
</style>

<div class="modal">
  <div class="header">
    <div class="header-left">
      <RepoAvatar
        name={repo.payloads["xyz.radicle.project"]?.data.name ?? ""}
        rid={repo.rid}
        styleWidth="1rem" />
      <span class="repo-name">
        {repo.payloads["xyz.radicle.project"]?.data.name}
      </span>
      <Icon name="chevron-right" />
      <span class="title">New release</span>
    </div>
    <Button variant="naked" onclick={close}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>

  <div class="body">
    <div class="section">
      <span class="section-title">Target</span>
      <div class="target-row">
        <Popover
          popoverPadding="0"
          placement="bottom-start"
          styleZIndex="400"
          bind:expanded={popoverExpanded}>
          {#snippet toggle(onclick)}
            <Button
              variant="outline"
              {onclick}
              disabled={tags.length === 0 || createdId !== undefined}
              active={popoverExpanded}
              title={tagsError
                ? "Could not read this repo's tags"
                : tags.length === 0
                  ? "This repo has no canonical tags"
                  : undefined}>
              <Icon name="label" />
              <span>
                {selectedTag ? selectedTag.name : "Select a tag"}
              </span>
              <Icon name={popoverExpanded ? "chevron-up" : "chevron-down"} />
            </Button>
          {/snippet}
          {#snippet popover()}
            <div
              style:border="1px solid var(--color-border-subtle)"
              style:border-radius="var(--border-radius-sm)"
              style:background-color="var(--color-surface-canvas)">
              <DropdownList items={tags} styleDropdownMinWidth="16rem">
                {#snippet item(entry)}
                  <DropdownListItem
                    selected={selectedTag?.name === entry.name}
                    styleGap="0.5rem"
                    onclick={() => {
                      selectedTag = entry;
                      commitInput = "";
                      closeFocused();
                    }}>
                    <Icon name="label" />
                    <span style:color="var(--color-text-secondary)">
                      {entry.name}
                    </span>
                    <span class="artifact-meta">
                      {formatOid(entry.tag.oid)}
                    </span>
                  </DropdownListItem>
                {/snippet}
                {#snippet empty()}
                  <div class="hint" style:padding="0.5rem">No tags</div>
                {/snippet}
              </DropdownList>
            </div>
          {/snippet}
        </Popover>

        <span class="hint">or</span>

        <div style:flex="1">
          <Popover
            popoverPadding="0"
            placement="bottom-start"
            styleZIndex="400"
            bind:expanded={commitPickerExpanded}>
            {#snippet toggle(onclick)}
              <TextInput
                placeholder="Pick a commit or paste a SHA"
                disabled={createdId !== undefined}
                valid={!commitMissing}
                bind:value={commitInput}
                onFocus={() => {
                  if (!commitPickerExpanded) {
                    onclick();
                  }
                }}
                onDismiss={closeFocused}
                oninput={() => {
                  if (commitInput.trim() !== "") {
                    selectedTag = undefined;
                  }
                  if (!commitPickerExpanded) {
                    onclick();
                  }
                }} />
            {/snippet}
            {#snippet popover()}
              <div
                style:border="1px solid var(--color-border-subtle)"
                style:border-radius="var(--border-radius-sm)"
                style:background-color="var(--color-surface-canvas)">
                <DropdownList
                  items={commitItems}
                  styleDropdownMinWidth="24rem"
                  styleDropdownMaxHeight="20rem">
                  {#snippet item(commit)}
                    <DropdownListItem
                      selected={commitInput.trim() === commit.id}
                      styleGap="0.5rem"
                      onclick={() => {
                        commitInput = commit.id;
                        selectedTag = undefined;
                        closeFocused();
                      }}>
                      <Icon name="commit" />
                      <span class="artifact-meta">
                        {formatOid(commit.id)}
                      </span>
                      <span class="commit-summary">{commit.summary}</span>
                    </DropdownListItem>
                  {/snippet}
                  {#snippet empty()}
                    <div class="hint" style:padding="0.5rem">
                      {#if commitMissing}
                        No commit with this SHA
                      {:else if isOid(commitQuery)}
                        Looking up commit…
                      {:else}
                        No matching commits
                      {/if}
                    </div>
                  {/snippet}
                </DropdownList>
              </div>
            {/snippet}
          </Popover>
        </div>
      </div>
      {#if commitMissing}
        <span class="error">
          Commit {formatOid(commitInput.trim())} is not in this repo.
        </span>
      {:else if resolvedCommit && !selectedTag}
        <span class="hint">{resolvedCommit.summary}</span>
      {/if}
      {#if selectedTag && !selectedTag.tag.tagOid}
        <span class="hint">
          Lightweight tag: the release records the commit only.
        </span>
      {/if}
    </div>

    <div class="section">
      <span class="section-title">Artifacts</span>
      {#if staged.length > 0}
        <ScrollArea style="max-height: 16rem;">
          <div class="artifact-list">
            {#each staged as artifact (artifact.path)}
              <div class="artifact">
                <Icon name={artifact.error ? "warning" : "attach"} />
                <span class="artifact-name" title={artifact.path}>
                  {artifact.name}
                </span>
                {#if artifact.hashing}
                  <span class="artifact-meta">Hashing…</span>
                {:else if artifact.error}
                  <span class="error">{artifact.error}</span>
                {:else if duplicateOf.has(artifact.path)}
                  <span class="artifact-meta">
                    same as “{duplicateOf.get(artifact.path)}”
                  </span>
                {:else if artifact.digest}
                  <span class="artifact-meta">
                    {formatBytes(artifact.digest.sizeBytes)}
                  </span>
                {/if}
                <Button
                  variant="naked"
                  onclick={() => {
                    staged = staged.filter(a => a.path !== artifact.path);
                  }}>
                  <span style:color="var(--color-text-tertiary)">
                    <Icon name="close" />
                  </span>
                </Button>
              </div>
            {/each}
          </div>
        </ScrollArea>
      {:else}
        <span class="hint">
          Choose the files to register in this release. Each one is hashed
          locally to get its CID; seeding the bytes is a separate step.
        </span>
      {/if}
      {#if anyFolder}
        <div class="warning">
          <span class="warning-icon"><Icon name="warning" /></span>
          <span>A folder is registered whole, as one artifact.</span>
        </div>
      {/if}
      <div class="target-row">
        <Button variant="outline" onclick={chooseFiles}>
          <Icon name="plus" />Choose files
        </Button>
        <Button variant="outline" onclick={chooseFolder}>
          <Icon name="plus" />Choose folder
        </Button>
      </div>

      <div
        style:margin-top="0.25rem"
        style:width="fit-content"
        title={nodeRunning
          ? undefined
          : "The artifact node is not running, so the artifacts are registered but not seeded."}>
        <Checkbox bind:checked={seedAfterRegister} disabled={!nodeRunning}>
          Seed these artifacts so others can download them
        </Checkbox>
      </div>
    </div>
  </div>

  <div class="footer">
    {#if submitError}
      <span class="error">{submitError}</span>
    {:else if seedFailures > 0}
      <span class="error">
        Registered, but {seedFailures}
        {seedFailures === 1 ? "artifact" : "artifacts"} could not be seeded.
      </span>
    {/if}
    <div class="actions">
      <Button variant="outline" onclick={close}>
        {createdId ? "Open release" : "Cancel"}
      </Button>
      <Button
        variant="secondary"
        disabled={!ready || submitting}
        onclick={submit}>
        {#if submitting}
          {createdId ? "Retrying…" : "Creating…"}
        {:else}
          {createdId ? "Retry" : "Create release"}
        {/if}
      </Button>
    </div>
  </div>
</div>
