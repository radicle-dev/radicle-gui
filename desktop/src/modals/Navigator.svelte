<script lang="ts">
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { SearchResult } from "@bindings/cob/SearchResult";
  import type { Config } from "@bindings/config/Config";
  import type { Commit } from "@bindings/repo/Commit";
  import type { RepoSummary } from "@bindings/repo/RepoSummary";
  import type { ComponentProps } from "svelte";

  import { open as shellOpen } from "@tauri-apps/plugin-shell";

  import {
    cachedConfig,
    cachedListReposSummary,
    invoke,
  } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import { hide } from "@app/lib/modal";
  import type { NavigatorTarget } from "@app/lib/navigatorTarget";
  import { parseNavigatorTarget } from "@app/lib/navigatorTarget";
  import type { Route } from "@app/lib/router";
  import { push } from "@app/lib/router";
  import {
    formatOid,
    formatRepositoryId,
    issueStatusColor,
    patchStatusColor,
    publicKeyFromDid,
    truncateDid,
  } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import { pinnedRepoOrder } from "@app/components/SidebarRepoList.svelte";

  type Section = "Go to" | "Repositories" | "Issues" | "Patches";

  type Result = {
    key: string;
    section: Section;
    title: string;
    subtitle: string;
    icon?: ComponentProps<typeof Icon>["name"];
    iconColor?: string;
    repo?: RepoSummary;
    action: (() => void) | undefined;
  };

  const SEARCH_TAKE = 6;
  const REPO_TAKE = 6;

  let query = $state("");
  let selected = $state(0);
  let repos: RepoSummary[] = $state([]);
  let config: Config | undefined = $state();
  let issues: SearchResult[] = $state([]);
  let patches: SearchResult[] = $state([]);
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();

  void cachedListReposSummary("all").then(r => (repos = r));
  void cachedConfig()
    .then(c => (config = c))
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    .catch(() => {});

  $effect(() => {
    requestAnimationFrame(() => input?.focus());
  });

  const target = $derived(parseNavigatorTarget(query));

  type TargetDetails =
    | { key: string; found: true; title: string; status?: string }
    | { key: string; found: false };

  let targetDetails: TargetDetails | undefined = $state();

  function objectKey(route: Route): string | undefined {
    if (route.resource === "repo.issue") return `issue:${route.issue}`;
    if (route.resource === "repo.patch") return `patch:${route.patch}`;
    if (route.resource === "repo.commit") return `commit:${route.commit}`;
  }

  async function fetchDetails(
    route: Route,
  ): Promise<{ title: string; status?: string } | undefined> {
    if (route.resource === "repo.issue") {
      const issue = await invoke<Issue | null>("issue_by_id", {
        rid: route.rid,
        id: route.issue,
      });
      return issue
        ? { title: issue.title, status: issue.state.status }
        : undefined;
    } else if (route.resource === "repo.patch") {
      const patch = await invoke<Patch | null>("patch_by_id", {
        rid: route.rid,
        id: route.patch,
      });
      return patch
        ? { title: patch.title, status: patch.state.status }
        : undefined;
    } else if (route.resource === "repo.commit") {
      const commit = await invoke<Commit>("repo_commit", {
        rid: route.rid,
        sha: route.commit,
      });
      return { title: commit.summary };
    }
  }

  $effect(() => {
    const route = target?.kind === "route" ? target.route : undefined;
    const key = route && objectKey(route);
    if (!route || !key || targetDetails?.key === key) {
      return;
    }
    let cancelled = false;
    fetchDetails(route)
      .then(details => {
        if (!cancelled) {
          targetDetails = details
            ? { key, found: true, ...details }
            : { key, found: false };
        }
      })
      .catch(() => {
        if (!cancelled) {
          targetDetails = { key, found: false };
        }
      });
    return () => {
      cancelled = true;
    };
  });
  const needle = $derived(query.trim());

  let searchSequence = 0;
  $effect(() => {
    const q = needle;
    const sequence = ++searchSequence;
    if (target || q.length < 2) {
      issues = [];
      patches = [];
      return;
    }
    const timeout = setTimeout(() => {
      void Promise.all([
        invoke<SearchResult[]>("search_issues", {
          query: q,
          take: SEARCH_TAKE,
        }),
        invoke<SearchResult[]>("search_patches", {
          query: q,
          take: SEARCH_TAKE,
        }),
      ])
        .then(([i, p]) => {
          if (sequence === searchSequence) {
            issues = i;
            patches = p;
          }
        })
        .catch(e => console.error("Search failed", e));
    }, 120);
    return () => clearTimeout(timeout);
  });

  function repoName(rid: string): string {
    return repos.find(r => r.rid === rid)?.name ?? formatRepositoryId(rid);
  }

  function go(route: Route) {
    return () => {
      hide();
      void push(route);
    };
  }

  function openExternal(url: string) {
    hide();
    if (window.__TAURI_INTERNALS__) {
      void shellOpen(url);
    } else {
      window.open(url, "_blank", "noreferrer");
    }
  }

  function targetResult(target: NavigatorTarget): Result {
    if (target.kind === "user") {
      const url =
        target.url ??
        (config
          ? entityUrl(
              { type: "node", nid: publicKeyFromDid(target.did) },
              config,
            )
          : undefined);
      return {
        key: "target",
        section: "Go to",
        icon: "open-external",
        title: "Open profile in browser",
        subtitle: truncateDid(target.did),
        action: url ? () => openExternal(url) : undefined,
      };
    }

    const route = target.route;
    const rid = "rid" in route ? route.rid : "";
    const repo = repos.find(r => r.rid === rid);
    const missing = repos.length > 0 && !repo;
    const base = {
      key: "target",
      section: "Go to" as const,
      subtitle: missing ? "Not in local storage" : repoName(rid),
      action: missing ? undefined : go(route),
    };

    const key = objectKey(route);
    if (key) {
      const [kind, id] = key.split(":");
      const label = `${kind[0].toUpperCase()}${kind.slice(1)} ${formatOid(id)}`;
      const details = targetDetails?.key === key ? targetDetails : undefined;
      const status = details?.found ? details.status : undefined;
      const notFound = details?.found === false;
      return {
        ...base,
        title: details?.found ? details.title : label,
        subtitle: missing
          ? base.subtitle
          : notFound
            ? `${label} not found in ${repoName(rid)}`
            : `${repoName(rid)} · ${label}`,
        action: notFound ? undefined : base.action,
        icon:
          kind === "issue"
            ? issueIcon(status ?? "open")
            : kind === "patch"
              ? patchIcon(status ?? "open")
              : "commit",
        iconColor:
          kind === "issue" && status
            ? issueStatusColor[status as Issue["state"]["status"]]
            : kind === "patch" && status
              ? patchStatusColor[status as Patch["state"]["status"]]
              : undefined,
      };
    } else if (route.resource === "repo.issues") {
      return { ...base, icon: "issue", title: "Issues" };
    } else if (route.resource === "repo.patches") {
      return { ...base, icon: "patch", title: "Patches" };
    } else if (route.resource === "repo.commits") {
      return { ...base, icon: "commit", title: "Commits" };
    }
    return {
      ...base,
      title: repoName(rid),
      subtitle: missing ? base.subtitle : formatRepositoryId(rid),
      repo,
      icon: repo ? undefined : "repository",
    };
  }

  // Pinned repos in their dragged order, then the rest as the backend already
  // sorts them, by name, which is how the sidebar lists them.
  function sidebarOrder(repos: RepoSummary[]): RepoSummary[] {
    const pinned = pinnedRepoOrder();
    const byRid = new Map(repos.map(r => [r.rid, r]));
    return [
      ...pinned
        .map(rid => byRid.get(rid))
        .filter((r): r is RepoSummary => r !== undefined),
      ...repos.filter(r => !pinned.includes(r.rid)),
    ];
  }

  function issueIcon(status: string): ComponentProps<typeof Icon>["name"] {
    return status === "open" ? "issue" : "issue-closed";
  }

  function patchIcon(status: string): ComponentProps<typeof Icon>["name"] {
    if (status === "draft") return "patch-draft";
    if (status === "archived") return "patch-archived";
    if (status === "merged") return "patch-merged";
    return "patch";
  }

  const results: Result[] = $derived.by(() => {
    if (target) {
      return [targetResult(target)];
    }

    const lower = needle.toLowerCase();
    const matchingRepos =
      lower === ""
        ? sidebarOrder(repos)
        : repos
            .filter(
              r =>
                r.name.toLowerCase().includes(lower) ||
                r.rid.toLowerCase().includes(lower),
            )
            .sort((a, b) => {
              const aPrefix = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
              const bPrefix = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
              return aPrefix - bPrefix || a.name.localeCompare(b.name);
            })
            .slice(0, REPO_TAKE);
    const repoResults: Result[] = matchingRepos.map(r => ({
      key: r.rid,
      section: "Repositories",
      title: r.name,
      subtitle: formatRepositoryId(r.rid),
      repo: r,
      action: go({ resource: "repo.home", rid: r.rid }),
    }));

    const issueResults: Result[] = issues.map(i => ({
      key: `issue:${i.rid}:${i.id}`,
      section: "Issues",
      title: i.title,
      subtitle: `${repoName(i.rid)} · ${formatOid(i.id)}`,
      icon: issueIcon(i.status),
      iconColor: issueStatusColor[i.status as Issue["state"]["status"]],
      action: go({
        resource: "repo.issue",
        rid: i.rid,
        issue: i.id,
        status: "all",
      }),
    }));

    const patchResults: Result[] = patches.map(p => ({
      key: `patch:${p.rid}:${p.id}`,
      section: "Patches",
      title: p.title,
      subtitle: `${repoName(p.rid)} · ${formatOid(p.id)}`,
      icon: patchIcon(p.status),
      iconColor: patchStatusColor[p.status as Patch["state"]["status"]],
      action: go({
        resource: "repo.patch",
        rid: p.rid,
        patch: p.id,
        status: undefined,
        reviewId: undefined,
      }),
    }));

    return [...repoResults, ...issueResults, ...patchResults];
  });

  $effect(() => {
    void query;
    selected = 0;
  });

  $effect(() => {
    list
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });

  // A pasted link has only one thing to do, so follow it straight away. It
  // stays in the field, showing why, when the target is not stored locally.
  async function handlePaste(e: ClipboardEvent) {
    const pasted = parseNavigatorTarget(e.clipboardData?.getData("text") ?? "");
    if (!pasted) {
      return;
    }
    e.preventDefault();
    query = e.clipboardData?.getData("text").trim() ?? "";

    if (pasted.kind === "user") {
      targetResult(pasted).action?.();
      return;
    }
    const route = pasted.route;
    const repos = await cachedListReposSummary("all");
    if (!("rid" in route) || !repos.some(r => r.rid === route.rid)) {
      return;
    }
    if (objectKey(route)) {
      const details = await fetchDetails(route).catch(() => undefined);
      if (!details) {
        return;
      }
    }
    go(route)();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(selected + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[selected]?.action?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  }
</script>

<style>
  .navigator {
    position: fixed;
    top: 20vh;
    left: 50%;
    transform: translateX(-50%);
    width: 36rem;
    max-width: calc(100vw - 2rem);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
    max-height: calc(80vh - 1rem);
  }
  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem;
    height: 3rem;
    color: var(--color-text-secondary);
  }
  .field input {
    flex: 1;
    border: none;
    outline: none;
    background: none;
    font: var(--txt-body-l-regular);
    color: var(--color-text-primary);
  }
  .field input::placeholder {
    color: var(--color-text-tertiary);
  }
  .results {
    display: flex;
    flex-direction: column;
    max-height: 24rem;
    min-height: 0;
    overflow-y: auto;
    padding: 0.25rem 0;
    border-top: 1px solid var(--color-border-subtle);
  }
  .section {
    padding: 0.5rem 1rem 0.25rem;
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .result {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    cursor: default;
    color: var(--color-text-primary);
  }
  .result.selected {
    background-color: var(--color-surface-subtle);
  }
  .result.disabled {
    color: var(--color-text-tertiary);
  }
  .icon {
    display: flex;
    flex-shrink: 0;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .title {
    font: var(--txt-body-m-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    padding: 0.75rem 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
</style>

<div class="navigator">
  <div class="field">
    <Icon name="search" />
    <input
      bind:this={input}
      bind:value={query}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
      spellcheck="false"
      autocomplete="off"
      data-mod-shortcuts
      placeholder="Search repos, issues and patches, or paste a link" />
  </div>
  {#if results.length > 0 || needle !== ""}
    <div class="results" bind:this={list}>
      {#each results as result, i (result.key)}
        {#if i === 0 || results[i - 1].section !== result.section}
          <div class="section">{result.section}</div>
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          role="option"
          tabindex="-1"
          aria-selected={i === selected}
          data-index={i}
          class="result"
          class:selected={i === selected}
          class:disabled={!result.action}
          onmousemove={() => (selected = i)}
          onclick={() => result.action?.()}>
          {#if result.repo}
            <RepoAvatar
              name={result.repo.name}
              rid={result.repo.rid}
              styleWidth="1.25rem" />
          {:else if result.icon}
            <span class="icon" style:color={result.iconColor}>
              <Icon name={result.icon} />
            </span>
          {/if}
          <div class="text">
            <span class="title">{result.title}</span>
            <span class="subtitle">{result.subtitle}</span>
          </div>
        </div>
      {:else}
        <div class="empty">No matches</div>
      {/each}
    </div>
  {/if}
</div>
