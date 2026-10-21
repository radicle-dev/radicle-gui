<script lang="ts">
  import type { Artifact, BaseUrl, Release, Repo } from "@http-client";

  import * as utils from "@app/lib/utils";

  import Badge from "@app/components/Badge.svelte";
  import Button from "@app/components/Button.svelte";
  import CobHeader from "@app/views/repos/Cob/CobHeader.svelte";
  import DelegateBadge from "./Release/DelegateBadge.svelte";
  import DownloadButton from "./Release/DownloadButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Layout from "./Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Separator from "./Separator.svelte";

  export let baseUrl: BaseUrl;
  export let release: Release;
  export let repo: Repo;
  export let repoId: string;
  export let allAuthors: boolean;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  const SIZE_KEY = "sizeBytes";

  $: title = release.title || release.tagName || release.id;

  // An artifact redacted by its own author or a delegate is hidden by default.
  let showRedacted = false;

  $: delegateIds = new Set(repo.delegates.map(d => d.id));

  // Whether the artifact was redacted by a trusted party (its author or a
  // delegate), mirroring the backend's default-hidden rule.
  function redactedByTrusted(artifact: Artifact, delegates: Set<string>) {
    return artifact.redactions.some(
      r => r.user.id === artifact.author.id || delegates.has(r.user.id),
    );
  }

  // Label for the redacted badge. Delegate takes precedence over author,
  // since the author may also be a delegate.
  function redactedByLabel(artifact: Artifact, delegates: Set<string>): string {
    const byDelegate = artifact.redactions.some(r => delegates.has(r.user.id));
    return byDelegate ? "Redacted by delegate" : "Redacted by author";
  }

  // Artifacts visible under the given redaction toggle.
  function visible(
    list: Artifact[],
    show: boolean,
    delegates: Set<string>,
  ): Artifact[] {
    return show ? list : list.filter(a => !redactedByTrusted(a, delegates));
  }

  $: delegateArtifacts = release.artifacts.filter(a =>
    delegateIds.has(a.author.id),
  );
  // Artifacts are scoped to delegate authors by default; the endpoint returns
  // all of them, so filtering happens client-side. With no delegate artifact
  // at all, fall back to every author.
  $: authorArtifacts =
    allAuthors || delegateArtifacts.length === 0
      ? release.artifacts
      : delegateArtifacts;
  $: shownArtifacts = visible(authorArtifacts, showRedacted, delegateIds);
  // The redacted count is the hidden set within the current author scope.
  $: redactedCount = authorArtifacts.filter(a =>
    redactedByTrusted(a, delegateIds),
  ).length;

  // Segment counts reflect what each choice would actually show, so an
  // artifact hidden as redacted never counts towards a scope. They label the
  // segments only: the author scope and the filter visibility come from the
  // unfiltered sets, so toggling redacted artifacts never moves them.
  $: delegateCount = visible(
    delegateArtifacts,
    showRedacted,
    delegateIds,
  ).length;
  $: allCount = visible(release.artifacts, showRedacted, delegateIds).length;

  // Filter only when both scopes hold something.
  $: showFilters =
    delegateArtifacts.length > 0 &&
    delegateArtifacts.length !== release.artifacts.length;

  // Format a byte count as a human-readable size (mirrors the CLI display).
  function formatBytes(bytes: number): string {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
  }

  function artifactSize(artifact: Artifact): string | undefined {
    const size = artifact.metadata[SIZE_KEY];
    return typeof size === "number" ? formatBytes(size) : undefined;
  }

  // Group an artifact's locations by the contributing node, preserving order.
  function locationsByNode(artifact: Artifact) {
    const order: string[] = [];
    const groups: Record<
      string,
      { user: Artifact["locations"][number]["user"]; urls: string[] }
    > = {};
    for (const { user, url } of artifact.locations) {
      if (!groups[user.id]) {
        groups[user.id] = { user, urls: [] };
        order.push(user.id);
      }
      groups[user.id].urls.push(url);
    }
    return order.map(id => groups[id]);
  }

  // Order a node-keyed list so delegates come first. The backend returns
  // these sorted by DID (arbitrary to a reader); sort is stable, so the
  // original order is preserved within each group.
  function delegatesFirst<T>(
    items: T[],
    id: (item: T) => string,
    delegates: Set<string>,
  ): T[] {
    return [...items].sort(
      (a, b) => Number(delegates.has(id(b))) - Number(delegates.has(id(a))),
    );
  }

  // Metadata entries other than the size hint, shown as raw key/value pairs.
  function otherMetadata(artifact: Artifact): [string, unknown][] {
    return Object.entries(artifact.metadata).filter(
      ([key]) => key !== SIZE_KEY,
    );
  }

  // Whether the browser can fetch the location itself, as opposed to it being
  // served over the radicle-artifact protocol.
  function isWebUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }
</script>

<style>
  .release {
    display: flex;
    flex: 1;
    min-height: 100%;
  }
  .main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    background-color: var(--color-surface-base);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-heading-l);
    word-break: break-word;
  }
  .artifacts {
    display: flex;
    flex-direction: column;
  }
  .filter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .redacted-toggle {
    margin-left: auto;
  }
  .filter-divider {
    border-bottom: 1px solid var(--color-border-subtle);
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
    text-align: center;
  }
  .empty-artifacts :global(svg) {
    width: 2rem;
    height: 2rem;
  }
  .segmented {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .title-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .counter {
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-tertiary);
    padding: 0 0.25rem;
    min-width: 1.5rem;
    text-align: center;
  }
  .selected {
    background-color: var(--color-surface-alpha-subtle);
    color: var(--color-text-primary);
  }
  .hover {
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
  }
  .artifact {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem;
    background-color: var(--color-surface-canvas);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .artifact-name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    word-break: break-word;
  }
  .cid {
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
  }
  .provenance {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .attested {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .attestor {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .metadata {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
    font: var(--txt-body-m-regular);
  }
  .meta-item {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .meta-key {
    color: var(--color-text-secondary);
  }
  .meta-value {
    color: var(--color-text-tertiary);
  }
  .artifact-actions {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .size {
    color: var(--color-text-tertiary);
  }
  .divider {
    width: 100%;
    height: 0;
    margin: 0.25rem 0;
    border: none;
  }
  .field-label {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .accordion summary {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    width: fit-content;
    list-style: none;
  }
  .accordion summary::-webkit-details-marker {
    display: none;
  }
  .chevron {
    display: inline-flex;
    color: var(--color-text-tertiary);
    transition: transform 0.1s ease;
  }
  .accordion[open] .chevron {
    transform: rotate(90deg);
  }
  .locations {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  .redactions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
    font: var(--txt-body-m-regular);
  }
  .location-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .location-node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .location-url {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .redaction {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--color-feedback-error-text);
  }
  .reason {
    color: var(--color-text-tertiary);
    word-break: break-word;
  }
</style>

<Layout {baseUrl} {nodeId} {nodeAvatarUrl} {repo} {repoId} activeTab="releases">
  <svelte:fragment slot="breadcrumb">
    <Separator />
    <Link
      route={{
        resource: "repo.releases",
        repo: repoId,
        node: baseUrl,
        allAuthors,
      }}>
      Releases
    </Link>
    <Separator />
    <span class="txt-id">
      <div class="global-hide-on-small-desktop-down">{release.id}</div>
      <div class="global-hide-on-medium-desktop-up">
        {utils.formatObjectId(release.id)}
      </div>
    </span>
  </svelte:fragment>

  <div class="release">
    <div class="main">
      <CobHeader>
        <svelte:fragment slot="title">
          <div class="title">
            <Icon name="parcel" />
            <InlineTitle fontSize="heading-l" content={title} />
          </div>
        </svelte:fragment>
        <svelte:fragment slot="state">
          {#if release.tagName}
            <Badge size="tiny" variant="neutral">{release.tagName}</Badge>
          {/if}
          <span class="row">
            commit
            <Link
              route={{
                resource: "repo.commit",
                repo: repoId,
                node: baseUrl,
                commit: release.oid,
              }}>
              <Id id={release.oid} />
            </Link>
          </span>
          <NodeId
            {baseUrl}
            nodeId={release.creator.id}
            alias={release.creator.alias} />
          {#if delegateIds.has(release.creator.id)}
            <DelegateBadge />
          {/if}
          released
          <Id id={release.id} />
          <span title={utils.absoluteTimestamp(release.createdAt)}>
            {utils.formatTimestamp(release.createdAt)}
          </span>
        </svelte:fragment>
      </CobHeader>

      <div class="artifacts">
        {#if showFilters || redactedCount > 0}
          <div class="filter">
            {#if showFilters}
              <div class="segmented">
                <Link
                  route={{
                    resource: "repo.release",
                    repo: repoId,
                    node: baseUrl,
                    release: release.id,
                  }}>
                  <Button
                    let:hover
                    variant={!allAuthors ? "gray" : "background"}>
                    <Icon name="badge" />
                    <div class="title-counter">
                      Delegates
                      <span
                        class="counter"
                        class:selected={!allAuthors}
                        class:hover={hover && allAuthors}>
                        {delegateCount}
                      </span>
                    </div>
                  </Button>
                </Link>
                <Link
                  route={{
                    resource: "repo.release",
                    repo: repoId,
                    node: baseUrl,
                    release: release.id,
                    allAuthors: true,
                  }}>
                  <Button
                    let:hover
                    variant={allAuthors ? "gray" : "background"}>
                    <Icon name="avatar-incognito" />
                    <div class="title-counter">
                      All
                      <span
                        class="counter"
                        class:selected={allAuthors}
                        class:hover={hover && !allAuthors}>
                        {allCount}
                      </span>
                    </div>
                  </Button>
                </Link>
              </div>
            {/if}
            {#if redactedCount > 0}
              <div class="redacted-toggle">
                <Button
                  variant="background"
                  on:click={() => (showRedacted = !showRedacted)}>
                  {showRedacted ? "Hide redacted" : "Show redacted"}
                  <span class="counter">{redactedCount}</span>
                </Button>
              </div>
            {/if}
          </div>
        {:else}
          <div class="filter-divider"></div>
        {/if}

        {#if shownArtifacts.length === 0}
          <div class="empty-artifacts">
            <Icon name="attach" />
            No artifacts
          </div>
        {/if}

        {#each shownArtifacts as artifact (artifact.cid)}
          {@const size = artifactSize(artifact)}
          {@const locations = delegatesFirst(
            locationsByNode(artifact),
            g => g.user.id,
            delegateIds,
          )}
          {@const metadata = otherMetadata(artifact)}
          {@const locationCount = artifact.locations.length}
          {@const cliOnly =
            locationCount > 0 && !artifact.locations.some(l => isWebUrl(l.url))}
          {@const redactions = delegatesFirst(
            artifact.redactions,
            r => r.user.id,
            delegateIds,
          )}
          <div class="artifact">
            <div class="artifact-name">
              <span>{artifact.name}</span>
              {#if redactedByTrusted(artifact, delegateIds)}
                <Badge size="tiny" variant="negative">
                  <Icon name="warning" />
                  {redactedByLabel(artifact, delegateIds)}
                </Badge>
              {/if}
              <div class="artifact-actions">
                {#if size}
                  <span class="size">{size}</span>
                {/if}
                <DownloadButton {artifact} rid={repo.rid} {delegateIds} />
              </div>
            </div>

            <div class="cid">
              <Id id={artifact.cid}>{utils.truncateId(artifact.cid)}</Id>
            </div>

            <div class="provenance">
              <NodeId
                {baseUrl}
                nodeId={artifact.author.id}
                alias={artifact.author.alias} />
              {#if delegateIds.has(artifact.author.id)}
                <DelegateBadge />
              {/if}
              {#if artifact.attestations.length > 0}
                <span class="attested">
                  attested by
                  {#each delegatesFirst(artifact.attestations, n => n.id, delegateIds) as node, i (i)}
                    <span class="attestor">
                      <NodeId {baseUrl} nodeId={node.id} alias={node.alias} />
                      {#if delegateIds.has(node.id)}
                        <DelegateBadge />
                      {/if}{#if i < artifact.attestations.length - 1},{/if}
                    </span>
                  {/each}
                </span>
              {/if}
            </div>

            {#if metadata.length > 0}
              <div class="metadata">
                {#each metadata as [key, value] (key)}
                  <span class="meta-item">
                    <span class="meta-key">{key}</span>
                    <span class="meta-value">
                      {typeof value === "string"
                        ? value
                        : JSON.stringify(value)}
                    </span>
                  </span>
                {/each}
              </div>
            {/if}

            {#if locationCount > 0}
              <hr class="divider" />
              <details class="accordion" open={cliOnly}>
                <summary>
                  <span class="field-label">
                    {locationCount} location{locationCount === 1 ? "" : "s"}
                  </span>
                  <span class="chevron"><Icon name="chevron-right" /></span>
                </summary>
                <div class="locations">
                  {#each locations as group (group.user.id)}
                    <div class="location-group">
                      <div class="location-node">
                        <NodeId
                          {baseUrl}
                          nodeId={group.user.id}
                          alias={group.user.alias} />
                        {#if delegateIds.has(group.user.id)}
                          <DelegateBadge
                            tooltip="Location added by a delegate" />
                        {/if}
                      </div>
                      {#each group.urls as url (url)}
                        <div class="location-url">
                          <Id id={url} truncate>{url}</Id>
                        </div>
                      {/each}
                    </div>
                  {/each}
                </div>
              </details>
            {/if}

            {#if redactions.length > 0}
              <details class="accordion">
                <summary>
                  <span class="field-label">
                    {redactions.length} redaction{redactions.length === 1
                      ? ""
                      : "s"}
                  </span>
                  <span class="chevron"><Icon name="chevron-right" /></span>
                </summary>
                <div class="redactions">
                  {#each redactions as redaction (redaction.user.id)}
                    <div class="redaction">
                      <Icon name="warning" />
                      Redacted by
                      <NodeId
                        {baseUrl}
                        nodeId={redaction.user.id}
                        alias={redaction.user.alias} />
                      {#if delegateIds.has(redaction.user.id)}
                        <DelegateBadge />
                      {/if}
                      <span class="reason">
                        {redaction.reason || "No reason"}
                      </span>
                    </div>
                  {/each}
                </div>
              </details>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</Layout>
