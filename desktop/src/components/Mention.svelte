<script lang="ts">
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { Release } from "@bindings/cob/release/Release";
  import type { Config } from "@bindings/config/Config";
  import type { ComponentProps } from "svelte";

  import {
    cachedConfig,
    cachedIssueById,
    cachedPatchById,
    cachedReleaseById,
    cachedRepoById,
    cachedRepoCommit,
  } from "@app/lib/invoke";
  import type { Entity } from "@app/lib/mentions";
  import {
    entityUri,
    entityUrl,
    referenceRoute,
    toRadReference,
  } from "@app/lib/mentions";
  import type { Route } from "@app/lib/router";
  import { push, routeToPath } from "@app/lib/router";
  import { fetchingRepos } from "@app/lib/seedRepo";
  import {
    formatOid,
    issueStatusColor,
    patchStatusColor,
    truncateId,
  } from "@app/lib/utils";

  import ExplorerMenu, {
    keepSelection,
    type MenuPosition,
    menuPosition,
  } from "@app/components/ExplorerMenu.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";

  type IconName = ComponentProps<typeof Icon>["name"];

  interface Props {
    target: Entity;
    fallback: string;
  }

  const { target, fallback }: Props = $props();

  let resolvedRepoName: string | undefined = $state(undefined);
  let issue: Issue | undefined = $state(undefined);
  let patch: Patch | undefined = $state(undefined);
  let release = $state<Release | undefined>(undefined);
  let commitSummary: string | undefined = $state(undefined);
  let missing = $state(false);
  let config: Config | undefined = $state(undefined);

  const explorerHref = $derived(config ? entityUrl(target, config) : undefined);

  $effect(() => {
    if (config) return;
    let cancelled = false;
    void cachedConfig()
      .then(result => {
        if (!cancelled) config = result;
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  });

  const repoName = $derived(resolvedRepoName ?? fallback);

  const fetching = $derived(
    target.type !== "node" && $fetchingRepos.includes(target.rid),
  );
  let repoLocal: boolean | undefined = $state(undefined);
  const seedRid = $derived(
    repoLocal === false && !fetching && target.type !== "node"
      ? target.rid
      : undefined,
  );

  $effect(() => {
    if (target.type === "node" || fetching) return;
    const isRepo = target.type === "repo";
    let cancelled = false;
    void cachedRepoById(target.rid)
      .then(result => {
        if (cancelled) return;
        repoLocal = result !== null;
        if (!isRepo) return;
        missing = !result;
        resolvedRepoName = result?.payloads["xyz.radicle.project"]?.data.name;
      })
      .catch(() => {
        if (cancelled) return;
        repoLocal = false;
        if (isRepo) missing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (target.type !== "cob" || target.kind !== "issue") return;
    let cancelled = false;
    void cachedIssueById(target.rid, target.oid)
      .then(result => {
        if (cancelled) return;
        if (result) issue = result;
        else missing = true;
      })
      .catch(() => {
        if (!cancelled) missing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (target.type !== "cob" || target.kind !== "patch") return;
    let cancelled = false;
    void cachedPatchById(target.rid, target.oid)
      .then(result => {
        if (cancelled) return;
        if (result) patch = result;
        else missing = true;
      })
      .catch(() => {
        if (!cancelled) missing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (target.type !== "cob" || target.kind !== "release") return;
    let cancelled = false;
    void cachedReleaseById(target.rid, target.oid)
      .then(result => {
        if (cancelled) return;
        if (result) release = result;
        else missing = true;
      })
      .catch(() => {
        if (!cancelled) missing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  const releaseTitle = $derived(
    release ? release.title || release.tagName : undefined,
  );

  $effect(() => {
    if (target.type !== "commit") return;
    let cancelled = false;
    void cachedRepoCommit(target.rid, target.oid)
      .then(result => {
        if (cancelled) return;
        if (result) commitSummary = result.summary;
        else missing = true;
      })
      .catch(() => {
        if (!cancelled) missing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  const issueIcon: Record<Issue["state"]["status"], IconName> = {
    open: "issue",
    closed: "issue-closed",
  };
  const patchIcon: Record<Patch["state"]["status"], IconName> = {
    draft: "patch-draft",
    open: "patch",
    archived: "patch-archived",
    merged: "patch-merged",
  };

  const route: Route | undefined = $derived(
    target.type === "node" ? undefined : referenceRoute(toRadReference(target)),
  );

  // An in-app path while the target is here, the explorer only once a lookup
  // has come back empty. The webview opens an external href itself, ahead of
  // any handler here, so a chip that should navigate in-app must never carry
  // one.
  const href = $derived(missing ? explorerHref : route && routeToPath(route));

  let menu: MenuPosition | undefined = $state(undefined);

  function openMenu(event: MouseEvent) {
    if (explorerHref || seedRid) menu = menuPosition(event);
  }

  function handleClick(event: MouseEvent) {
    if (missing || !route) return;

    event.preventDefault();

    if (isCurrentPage(route)) {
      scrollToTop(event.currentTarget as HTMLElement);
      return;
    }

    void push(route);
  }

  function scrollToTop(from: HTMLElement) {
    let node = from.parentElement;
    while (node) {
      const overflow = getComputedStyle(node).overflowY;
      if (
        /auto|scroll/.test(overflow) &&
        node.scrollHeight > node.clientHeight
      ) {
        node.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      node = node.parentElement;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function isCurrentPage(candidate: Route): boolean {
    return (
      new URL(routeToPath(candidate), window.origin).pathname ===
      window.location.pathname
    );
  }
</script>

<style>
  .mention {
    display: inline-flex;
    gap: 0.25rem;
    max-width: 20rem;
    padding: 0 0.25rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-base);
    color: var(--color-text-primary);
    font: inherit;
    font-weight: var(--font-weight-medium);
    text-decoration: none;
    align-items: baseline;
    vertical-align: baseline;
    white-space: nowrap;
    cursor: pointer;
  }
  .mention:hover,
  .mention:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .mention-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .mention.unresolved {
    background-color: transparent;
    outline: 1px dashed var(--color-border-mid);
    outline-offset: -1px;
    color: var(--color-text-secondary);
  }
  .mention.unresolved .mention-status {
    color: var(--color-text-tertiary);
  }
  .mention-oid {
    flex-shrink: 0;
    color: var(--color-text-secondary);
    font-family: var(--font-family-code);
    font-weight: var(--font-weight-regular);
  }
  .mention-node :global(.no-alias) {
    font-family: var(--font-family-code);
  }
  .mention-status {
    display: inline-flex;
    align-items: center;
    align-self: center;
    flex-shrink: 0;
  }
  .mention-node {
    display: inline-flex;
    align-items: baseline;
    vertical-align: baseline;
    gap: 0.25rem;
    padding: 0 0.25rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-base);
  }
  .mention-node:hover {
    background-color: var(--color-surface-subtle);
  }
  .mention-node :global(.avatar-alias) {
    align-items: baseline;
    line-height: inherit;
  }
  .mention-node :global(.avatar-container) {
    align-self: center;
  }
</style>

{#if target.type === "node"}
  <span class="mention-node">
    <NodeId publicKey={target.nid} inline />
  </span>
{:else if target.type === "repo"}
  <a
    class="mention"
    class:unresolved={missing}
    {href}
    target={missing ? "_blank" : undefined}
    rel={missing ? "noopener noreferrer" : undefined}
    onclick={handleClick}
    onmousedown={keepSelection}
    oncontextmenu={openMenu}
    title={missing ? `${target.rid} — not replicated locally` : target.rid}>
    <span class="mention-status">
      {#if resolvedRepoName}
        <RepoAvatar
          rid={target.rid}
          name={resolvedRepoName}
          styleWidth="1rem" />
      {:else}
        <Icon name="repository" />
      {/if}
    </span>
    <span class="mention-label">{repoName}</span>
    {#if missing}
      <span class="mention-oid">
        {truncateId(target.rid.replace("rad:", ""))}
      </span>
    {/if}
  </a>
{:else if target.type === "commit"}
  <a
    class="mention"
    class:unresolved={missing}
    {href}
    target={missing ? "_blank" : undefined}
    rel={missing ? "noopener noreferrer" : undefined}
    onclick={handleClick}
    onmousedown={keepSelection}
    oncontextmenu={openMenu}
    title={missing
      ? `${target.oid} — not replicated locally`
      : (commitSummary ?? target.oid)}>
    <span class="mention-status">
      <Icon name="commit" />
    </span>
    <span class="mention-label">{commitSummary ?? fallback}</span>
    {#if commitSummary || missing}
      <span class="mention-oid">{formatOid(target.oid)}</span>
    {/if}
  </a>
{:else if target.kind === "issue"}
  <a
    class="mention"
    class:unresolved={missing}
    {href}
    target={missing ? "_blank" : undefined}
    rel={missing ? "noopener noreferrer" : undefined}
    onclick={handleClick}
    onmousedown={keepSelection}
    oncontextmenu={openMenu}
    title={missing
      ? `${fallback} · ${target.oid} — not replicated locally`
      : `${issue?.title ?? fallback} · ${target.oid}`}>
    <span
      class="mention-status"
      style:color={issue ? issueStatusColor[issue.state.status] : undefined}>
      <Icon name={issue ? issueIcon[issue.state.status] : "issue"} />
    </span>
    <span class="mention-label">{issue?.title ?? fallback}</span>
    {#if missing}
      <span class="mention-oid">{formatOid(target.oid)}</span>
    {/if}
  </a>
{:else if target.kind === "release"}
  <a
    class="mention"
    class:unresolved={missing}
    {href}
    target={missing ? "_blank" : undefined}
    rel={missing ? "noopener noreferrer" : undefined}
    onclick={handleClick}
    onmousedown={keepSelection}
    oncontextmenu={openMenu}
    title={missing
      ? `${fallback} · ${target.oid} — not replicated locally`
      : `${releaseTitle ?? fallback} · ${target.oid}`}>
    <span class="mention-status">
      <Icon name="parcel" />
    </span>
    <span class="mention-label">{releaseTitle ?? fallback}</span>
    {#if missing || (release && !releaseTitle)}
      <span class="mention-oid">{formatOid(target.oid)}</span>
    {/if}
  </a>
{:else}
  <a
    class="mention"
    class:unresolved={missing}
    {href}
    target={missing ? "_blank" : undefined}
    rel={missing ? "noopener noreferrer" : undefined}
    onclick={handleClick}
    onmousedown={keepSelection}
    oncontextmenu={openMenu}
    title={missing
      ? `${fallback} · ${target.oid} — not replicated locally`
      : `${patch?.title ?? fallback} · ${target.oid}`}>
    <span
      class="mention-status"
      style:color={patch ? patchStatusColor[patch.state.status] : undefined}>
      <Icon name={patch ? patchIcon[patch.state.status] : "patch"} />
    </span>
    <span class="mention-label">{patch?.title ?? fallback}</span>
    {#if missing}
      <span class="mention-oid">{formatOid(target.oid)}</span>
    {/if}
  </a>
{/if}

{#if menu && config}
  <ExplorerMenu
    x={menu.x}
    y={menu.y}
    target={menu.target}
    url={explorerHref}
    uri={entityUri(target)}
    {seedRid}
    {config}
    onclose={() => (menu = undefined)} />
{/if}
