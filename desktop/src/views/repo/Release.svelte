<script lang="ts">
  import type { ArtifactDigest } from "@bindings/cob/release/ArtifactDigest";
  import type { Release } from "@bindings/cob/release/Release";
  import type { ReleaseScope } from "@bindings/cob/release/ReleaseScope";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { pickFiles, pickFolder } from "@app/lib/artifactPickers";
  import { basename } from "@app/lib/embeds";
  import { invoke } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import { artifactView, releaseWarning } from "@app/lib/releases";
  import * as router from "@app/lib/router";
  import type { Picked, StagedArtifact } from "@app/lib/stageArtifacts";
  import { effective, stageArtifacts } from "@app/lib/stageArtifacts";
  import { didFromPublicKey, shortenCids } from "@app/lib/utils";

  import ArtifactRow from "@app/components/ArtifactRow.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import ReleaseMetadata from "@app/components/ReleaseMetadata.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import UntrustedWarning from "@app/components/UntrustedWarning.svelte";
  import ConfirmDeleteRelease from "@app/modals/ConfirmDeleteRelease.svelte";
  import ConfirmRegisterArtifacts from "@app/modals/ConfirmRegisterArtifacts.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    config: Config;
    release: Release;
    scope?: ReleaseScope;
    artifactScope?: ReleaseScope;
  }

  /* eslint-disable prefer-const */
  let { repo, config, release, scope, artifactScope }: Props = $props();
  /* eslint-enable prefer-const */

  const ownDid = $derived(didFromPublicKey(config.publicKey));

  const title = $derived(release.title || release.tagName || release.id);
  const delegateIds = $derived(new Set(repo.delegates.map(d => d.did)));

  let showRedacted = $state(false);

  const view = $derived(
    artifactView(
      release.artifacts,
      delegateIds,
      artifactScope ?? "trusted",
      showRedacted,
    ),
  );

  const warning = $derived(
    releaseWarning(release.creator.did, delegateIds, view.scope),
  );
  const untrustedWarning = $derived(
    warning === "release"
      ? "Not from a delegate. Only download if you trust the author."
      : warning === "artifacts"
        ? "Not from delegates. Only download if you trust the authors."
        : undefined,
  );

  const cidLabels = $derived(shortenCids(view.shown.map(a => a.cid)));

  let registering = $state(false);
  let registerError: string | undefined = $state();

  // Hash and measure first, then ask: registering cannot be withdrawn.
  async function registerArtifacts(paths: string[]) {
    if (paths.length === 0) {
      return;
    }
    registering = true;
    registerError = undefined;

    let nodeRunning: boolean;
    try {
      nodeRunning = await invoke<boolean>("artifact_node_running");
    } catch {
      nodeRunning = false;
    }

    let picked: Picked[];
    try {
      [picked] = await Promise.all([
        Promise.all(
          paths.map(async path => ({
            path,
            name: basename(path),
            digest: await invoke<ArtifactDigest>("compute_artifact_cid", {
              path,
            }),
          })),
        ),
        refreshSeeded(),
      ]);
    } catch (error) {
      console.error("Reading the selection failed", error);
      registerError = "Could not read what you picked.";
      return;
    } finally {
      registering = false;
    }

    show({
      component: ConfirmRegisterArtifacts,
      props: {
        staged: stageArtifacts(picked, release.artifacts, {
          ownDid,
          delegates: delegateIds,
          nodeRunning,
          seeded: seededCids,
        }),
        confirm: registerStaged,
      },
    });
  }

  async function registerStaged(
    staged: StagedArtifact[],
    includeRedacted: boolean,
  ) {
    registering = true;
    registerError = undefined;

    let unseeded = 0;
    let seedFailures = 0;
    try {
      // One at a time, so a failure part way leaves the earlier ones registered.
      for (const item of staged) {
        const { register, seed } = effective(item, includeRedacted);
        if (register) {
          await invoke("register_artifact", {
            rid: repo.rid,
            releaseId: release.id,
            cid: item.digest.cid,
            name: item.name,
            sizeBytes: item.digest.sizeBytes,
          });
        }
        if (seed) {
          try {
            await invoke("seed_artifact", {
              rid: repo.rid,
              releaseId: release.id,
              cid: item.digest.cid,
              sourcePath: item.path,
            });
          } catch {
            seedFailures += 1;
          }
        } else if (register && !item.existing) {
          unseeded += 1;
        }
      }
      if (unseeded > 0) {
        registerError =
          "Registered, but your artifact node is not running, so they cannot be downloaded yet.";
      } else if (seedFailures > 0) {
        registerError = `Registered, but ${seedFailures} could not be seeded and cannot be downloaded yet.`;
      }
    } catch (error) {
      console.error("Registering artifacts failed", error);
      registerError = "Registering failed.";
    } finally {
      registering = false;
      await reload();
      await refreshSeeded();
    }
  }

  async function chooseFiles() {
    closeFocused();
    const paths = await pickFiles();
    if (paths.length > 0) {
      await registerArtifacts(paths);
    }
  }

  async function chooseFolder() {
    closeFocused();
    const path = await pickFolder();
    if (path) {
      await registerArtifacts([path]);
    }
  }

  function openDelete() {
    show({
      component: ConfirmDeleteRelease,
      props: {
        title,
        shared: release.artifacts.some(a => a.author.did !== ownDid),
        confirm: async () => {
          await invoke("delete_release", {
            rid: repo.rid,
            releaseId: release.id,
          });
          await router.push({ resource: "repo.releases", rid: repo.rid });
        },
      },
    });
  }

  let seededCids = $state<Set<string>>(new Set());

  async function refreshSeeded() {
    try {
      const cids = await invoke<string[]>("seeded_artifacts", {
        rid: repo.rid,
        releaseId: release.id,
      });
      seededCids = new Set(cids);
    } catch {
      // A node that is down seeds nothing we can confirm, so claim nothing.
      seededCids = new Set();
    }
  }

  async function refresh() {
    await reload();
    await refreshSeeded();
  }

  $effect(() => {
    // Re-ask when the route lands on another release.
    void release.id;
    void refreshSeeded();
  });

  // Callers reload after an action has already succeeded or failed, so a
  // failed refresh must not be reported as the action's outcome.
  async function reload() {
    try {
      const updated = await invoke<Release | null>("release_by_id", {
        rid: repo.rid,
        id: release.id,
      });
      if (updated) {
        release = updated;
      }
    } catch (error) {
      console.error("Refreshing the release failed", error);
    }
  }
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
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
  .main {
    padding: 1.5rem 6rem;
    min-width: 0;
    max-width: 80rem;
    margin: 0 auto;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .title-chip {
    padding: 0;
    height: 2rem;
    width: 2rem;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  .metadata-row {
    margin-bottom: 1.5rem;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .redacted-toggle {
    margin-left: auto;
  }
  .add-menu {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.25rem;
    min-width: 11rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
  }
  .untrusted-warning {
    margin-bottom: 1rem;
  }
  .register-error {
    margin-bottom: 1rem;
    color: var(--color-feedback-error-text);
    font: var(--txt-body-s-regular);
  }
  .empty-artifacts {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 4rem 1.25rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
</style>

<Layout>
  <div class="page">
    <Topbar>
      <div class="breadcrumb">
        <Icon name="parcel" />
        <button
          class="breadcrumb-link"
          onclick={() =>
            router.push({
              resource: "repo.releases",
              rid: repo.rid,
            })}>
          Releases
        </button>
        <Icon name="chevron-right" />
        {#if scope}
          <button
            class="breadcrumb-link"
            onclick={() =>
              router.push({
                resource: "repo.releases",
                rid: repo.rid,
                scope,
              })}>
            {scope === "trusted" ? "Delegates" : "Others"}
          </button>
          <Icon name="chevron-right" />
        {/if}
        <Id id={release.id} clipboard={release.id} label="release ID" />
      </div>
      <div style:margin-left="auto" style:display="flex" style:gap="0.5rem">
        {#if release.creator.did === ownDid}
          <Button styleHeight="2rem" variant="naked" onclick={openDelete}>
            <Icon name="trash" />Delete
          </Button>
        {/if}
        <ShareButton
          target={{
            type: "cob",
            kind: "release",
            rid: repo.rid,
            oid: release.id,
          }}
          id={release.id}
          idLabel="release"
          variant="naked"
          {config} />
        <Popover placement="bottom-end" popoverPadding="0">
          {#snippet toggle(onclick)}
            <Button
              styleHeight="2rem"
              variant="naked"
              disabled={registering}
              {onclick}>
              <Icon name="plus" />
              {registering ? "Registering…" : "Register artifacts"}
            </Button>
          {/snippet}
          {#snippet popover()}
            <div class="add-menu">
              <Button
                variant="naked"
                styleWidth="100%"
                styleJustifyContent="flex-start"
                onclick={chooseFiles}>
                <Icon name="attach" />Files…
              </Button>
              <Button
                variant="naked"
                styleWidth="100%"
                styleJustifyContent="flex-start"
                onclick={chooseFolder}>
                <Icon name="folder" />Folder…
              </Button>
            </div>
          {/snippet}
        </Popover>
      </div>
    </Topbar>

    <ScrollArea style="flex: 1; min-height: 0;">
      <div class="main">
        <div class="title">
          <div class="global-chip title-chip">
            <Icon name="parcel" />
          </div>
          <InlineTitle content={title} fontSize="large" />
        </div>

        <div class="metadata-row">
          <ReleaseMetadata {release} {repo} {delegateIds} />
        </div>

        {#if view.showFilters || view.redactedCount > 0}
          <div class="filter">
            {#if view.showFilters}
              <Button
                styleHeight="1.75rem"
                bordered
                flatRight
                active={view.scope === "trusted"}
                onclick={() =>
                  router.push({
                    resource: "repo.release",
                    rid: repo.rid,
                    release: release.id,
                    scope,
                  })}>
                <Icon name="badge" />Delegates
                <span class="global-counter-badge">{view.counts.trusted}</span>
              </Button>
              <Button
                styleHeight="1.75rem"
                bordered
                flatLeft
                active={view.scope === "untrusted"}
                title="Non-delegates"
                onclick={() =>
                  router.push({
                    resource: "repo.release",
                    rid: repo.rid,
                    release: release.id,
                    scope,
                    artifactScope: "untrusted",
                  })}>
                <Icon name="avatar-incognito" />Others
                <span class="global-counter-badge">
                  {view.counts.untrusted}
                </span>
              </Button>
            {/if}
            {#if view.redactedCount > 0}
              <div class="redacted-toggle">
                <Button
                  styleHeight="1.75rem"
                  variant="naked"
                  onclick={() => (showRedacted = !showRedacted)}>
                  {showRedacted ? "Hide redacted" : "Show redacted"}
                  <span class="global-counter-badge">{view.redactedCount}</span>
                </Button>
              </div>
            {/if}
          </div>
        {/if}

        {#if untrustedWarning}
          <div class="untrusted-warning">
            <UntrustedWarning text={untrustedWarning} />
          </div>
        {/if}

        {#if registerError}
          <div class="register-error">{registerError}</div>
        {/if}

        {#if view.shown.length === 0}
          <div class="empty-artifacts">
            <Icon name="attach" />
            No artifacts
          </div>
        {/if}

        <div class="artifact-list">
          {#each view.shown as artifact (artifact.cid)}
            <ArtifactRow
              {artifact}
              rid={repo.rid}
              releaseId={release.id}
              {ownDid}
              {delegateIds}
              cidLabel={cidLabels.get(artifact.cid) ?? artifact.cid}
              seeding={seededCids.has(artifact.cid)}
              onChange={refresh} />
          {/each}
        </div>
      </div>
    </ScrollArea>
  </div>
</Layout>
