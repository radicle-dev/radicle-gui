<script lang="ts" module>
  export interface MentionInsertion {
    start: number;
    end: number;
    markdown: string;
  }
</script>

<script lang="ts">
  import type { AliasSuggestion } from "@bindings/cob/AliasSuggestion";
  import type { Author } from "@bindings/cob/Author";
  import type { Release } from "@bindings/cob/release/Release";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";
  import type { ComponentProps } from "svelte";

  import {
    autoUpdate,
    computePosition,
    flip,
    hide,
    shift,
    size,
  } from "@floating-ui/dom";
  import fuzzysort from "fuzzysort";
  import debounce from "lodash/debounce";
  import { useOverlayScrollbars } from "overlayscrollbars-svelte";

  import {
    cachedAlias,
    cachedIssueById,
    cachedListIssueCandidates,
    cachedListPatchCandidates,
    cachedListReleaseCandidates,
    cachedListReposSummary,
    cachedPatchById,
    cachedReleaseById,
    cachedRepoById,
    cachedRepoCommit,
    cachedRepoCommitsByPrefix,
    cachedRepoSplitTreePath,
    cachedSearchAliases,
  } from "@app/lib/invoke";
  import type { Entity } from "@app/lib/mentions";
  import {
    describeLink,
    entityMarkdown,
    entityUri,
    referenceMarkdown,
  } from "@app/lib/mentions";
  import type { MentionTrigger } from "@app/lib/mentionTrigger";
  import { findMentionTrigger } from "@app/lib/mentionTrigger";
  import { portal } from "@app/lib/portal";
  import type { RadReference } from "@app/lib/radUri";
  import { fileReference, formatReference, isOid } from "@app/lib/radUri";
  import { repoListScope } from "@app/lib/repoListScope";
  import { caretCoordinates } from "@app/lib/textareaCaret";
  import { formatOid, publicKeyFromDid, truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  type IconName = ComponentProps<typeof Icon>["name"];

  interface Suggestion {
    key: string;
    target: Entity;
    link?: RadReference;
    label: string;
    primary: string;
    secondary?: string;
    mono?: boolean;
    icon?: IconName;
    avatar?: string;
    badge?: "delegate" | "following" | "you";
    haystack: string;
  }

  interface Props {
    rid: string;
    textarea: HTMLTextAreaElement | undefined;
    value: string;
    caret: number;
    onselect: (insertion: MentionInsertion) => void;
    registerKeydown: (handler: (event: KeyboardEvent) => boolean) => void;
  }

  const maxSuggestions = 50;

  const oidPrefixPattern = /^[0-9a-fA-F]{7,39}$/;

  const maxUnvouchedPeople = 10;

  const maxDropdownHeight = 384;

  const minDropdownHeight = 160;

  const { rid, textarea, value, caret, onselect, registerKeydown }: Props =
    $props();

  let focused = $state(false);
  let dismissedAt: number | undefined = $state(undefined);
  let activeIndex = $state(0);
  let suggestions: Suggestion[] = $state([]);
  let floatingEl: HTMLDivElement | undefined = $state();
  let scrollEl: HTMLDivElement | undefined = $state();
  const rowElements: (HTMLButtonElement | undefined)[] = [];

  const trigger = $derived(findMentionTrigger(value, caret));
  const active = $derived(
    trigger !== undefined && trigger.start !== dismissedAt,
  );
  const open = $derived(focused && active && suggestions.length > 0);

  $effect(() => {
    if (!textarea) return;
    const element = textarea;
    focused = document.activeElement === element;

    const onFocus = () => (focused = true);
    const onBlur = () => (focused = false);
    element.addEventListener("focus", onFocus);
    element.addEventListener("blur", onBlur);

    return () => {
      element.removeEventListener("focus", onFocus);
      element.removeEventListener("blur", onBlur);
    };
  });

  const loadSuggestions = debounce((requested: MentionTrigger) => {
    const token = triggerToken(requested);
    void collect(requested)
      .then(collected => {
        if (trigger === undefined || triggerToken(trigger) !== token) return;
        suggestions = collected;
        activeIndex = 0;
      })
      .catch(error => {
        console.warn("Not able to load mention suggestions", error);
        suggestions = [];
      });
  }, 80);

  function triggerToken(value: MentionTrigger): string {
    switch (value.kind) {
      case "query":
        return `query:${value.scope}:${value.query}`;
      case "identifier":
        return `identifier:${entityUri(value.target)}`;
      case "oid":
        return `oid:${value.oid}`;
      case "tree":
        return `tree:${value.rid}:${value.namespace}:${value.path}#${value.fragment}`;
      case "link":
        return `link:${formatReference(value.reference)}`;
    }
  }

  $effect(() => {
    if (!active || !trigger) {
      suggestions = [];
      loadSuggestions.cancel();
      return;
    }
    loadSuggestions(trigger);
  });

  $effect(() => {
    if (!open || !floatingEl || !textarea) return;
    const element = textarea;
    const position = trigger?.start ?? caret;
    const virtual = {
      contextElement: element,
      getBoundingClientRect: () => {
        const rect = element.getBoundingClientRect();
        const { top, left, height } = caretCoordinates(element, position);

        return new DOMRect(
          rect.left + left - element.scrollLeft,
          rect.top + top - element.scrollTop,
          0,
          height,
        );
      },
    };

    return autoUpdate(virtual, floatingEl, () => {
      void computePosition(virtual, floatingEl!, {
        placement: "bottom-start",
        middleware: [
          flip(),
          shift({ padding: 8 }),
          hide({ padding: 8 }),
          size({
            padding: 8,
            apply({ availableHeight, elements }) {
              elements.floating.style.maxHeight = `${Math.max(
                minDropdownHeight,
                Math.min(availableHeight, maxDropdownHeight),
              )}px`;
            },
          }),
        ],
      }).then(({ x, y, middlewareData }) => {
        if (!floatingEl) return;
        floatingEl.style.left = `${x}px`;
        floatingEl.style.top = `${y}px`;
        floatingEl.style.visibility = middlewareData.hide?.referenceHidden
          ? "hidden"
          : "visible";
      });
    });
  });

  async function collect(requested: MentionTrigger): Promise<Suggestion[]> {
    if (requested.kind === "identifier") {
      return [await resolveIdentifier(requested.target)];
    }

    if (requested.kind === "oid") {
      return await resolveOid(requested.oid);
    }

    if (requested.kind === "tree") {
      return await resolveTree(requested);
    }

    if (requested.kind === "link") {
      return await resolveLink(requested.reference);
    }

    if (isOid(requested.query)) {
      const resolved = await resolveOid(requested.query.toLowerCase());
      if (resolved.length > 0) return resolved;
    } else if (oidPrefixPattern.test(requested.query)) {
      const resolved = await resolvePrefix(requested.query.toLowerCase());
      if (resolved.length > 0) return resolved;
    }

    const collected: Suggestion[] = [];
    if (requested.scope === "all") {
      collected.push(...(await collectPeople(requested.query)));
    }
    collected.push(...(await collectCobs()));

    if (requested.scope === "all" && requested.query !== "") {
      collected.push(...(await collectRepos()));
    }

    return rank(collected, requested.query);
  }

  async function resolveIdentifier(target: Entity): Promise<Suggestion> {
    const key = `identifier:${entityUri(target)}`;

    if (target.type === "node") {
      const alias = await cachedAlias(target.nid).catch(() => undefined);
      const [repo, suggestions] = await Promise.all([
        cachedRepoById(rid).catch(() => undefined),
        cachedSearchAliases(alias ?? "").catch(() => []),
      ]);
      const label = alias ?? truncateId(target.nid);

      return {
        key,
        target,
        label: `@${label}`,
        primary: label,
        secondary: truncateId(target.nid),
        mono: alias === undefined,
        avatar: target.nid,
        badge: badgeFor(target.nid, repo?.delegates ?? [], suggestions),
        haystack: label,
      };
    }

    if (target.type === "repo") {
      const repo = await cachedRepoById(target.rid).catch(() => undefined);
      const name = repo?.payloads["xyz.radicle.project"]?.data.name;
      const label = name ?? target.rid;

      return {
        key,
        target,
        label,
        primary: label,
        secondary: truncateId(target.rid.replace("rad:", "")),
        icon: "repository",
        haystack: label,
      };
    }

    if (target.type === "commit") {
      const commit = await cachedRepoCommit(target.rid, target.oid).catch(
        () => undefined,
      );
      const label = commit?.summary ?? `commit ${formatOid(target.oid)}`;

      return {
        key,
        target,
        label,
        primary: label,
        secondary: formatOid(target.oid),
        icon: "commit",
        haystack: label,
      };
    }

    if (target.kind === "issue") {
      const issue = await cachedIssueById(target.rid, target.oid).catch(
        () => undefined,
      );
      const label = issue?.title ?? `issue ${formatOid(target.oid)}`;

      return {
        key,
        target,
        label,
        primary: label,
        secondary: formatOid(target.oid),
        icon: issue?.state.status === "closed" ? "issue-closed" : "issue",
        haystack: label,
      };
    }

    if (target.kind === "release") {
      const release = await cachedReleaseById(target.rid, target.oid).catch(
        () => undefined,
      );
      const label = release
        ? releaseTitle(release)
        : `release ${formatOid(target.oid)}`;

      return {
        key,
        target,
        label,
        primary: label,
        secondary: formatOid(target.oid),
        icon: "parcel",
        haystack: label,
      };
    }

    const patch = await cachedPatchById(target.rid, target.oid).catch(
      () => undefined,
    );
    const label = patch?.title ?? `patch ${formatOid(target.oid)}`;

    return {
      key,
      target,
      label,
      primary: label,
      secondary: formatOid(target.oid),
      icon: patch ? patchIcon[patch.state.status] : "patch",
      haystack: label,
    };
  }

  async function resolvePrefix(prefix: string): Promise<Suggestion[]> {
    const [cobs, commits] = await Promise.all([
      collectCobs(),
      cachedRepoCommitsByPrefix(rid, prefix).catch(() => []),
    ]);
    const matched = cobs.filter(
      row => row.target.type === "cob" && row.target.oid.startsWith(prefix),
    );
    const cobIds = new Set(
      matched.map(row => (row.target.type === "cob" ? row.target.oid : "")),
    );

    return [
      ...matched,
      ...commits
        .filter(commit => !cobIds.has(commit.id))
        .map(commit => ({
          key: `commit:${commit.id}`,
          target: {
            type: "commit",
            rid,
            oid: commit.id,
          } satisfies Entity,
          label: commit.summary,
          primary: commit.summary,
          secondary: formatOid(commit.id),
          icon: "commit" as IconName,
          haystack: commit.summary,
        })),
    ];
  }

  async function resolveTree(
    tree: Extract<MentionTrigger, { kind: "tree" }>,
  ): Promise<Suggestion[]> {
    const [split, repo] = await Promise.all([
      cachedRepoSplitTreePath(tree.rid, tree.namespace, tree.path).catch(
        () => undefined,
      ),
      cachedRepoById(tree.rid).catch(() => undefined),
    ]);
    if (!split) return [];

    const location = {
      repo: tree.rid.replace(/^rad:/, ""),
      namespace: tree.namespace,
    };
    const link = fileReference(
      location,
      split.revision,
      split.path,
      tree.fragment,
    );
    if (!link) return [];

    return linkRows(tree.rid, repo, link);
  }

  async function resolveLink(link: RadReference): Promise<Suggestion[]> {
    if (link.type !== "uri") return [];
    const linkRid = `rad:${link.uri.repo}`;
    const { namespace } = link.uri;
    const [repo, peerAlias] = await Promise.all([
      cachedRepoById(linkRid).catch(() => undefined),
      namespace ? cachedAlias(namespace).catch(() => undefined) : undefined,
    ]);
    return linkRows(linkRid, repo, link, peerAlias ?? undefined);
  }

  function linkRows(
    linkRid: string,
    repo: RepoInfo | null | undefined,
    link: RadReference,
    peerName?: string,
  ): Suggestion[] {
    const name = repo?.payloads["xyz.radicle.project"]?.data.name ?? linkRid;
    const description = describeLink(link, name, peerName);
    if (!description) return [];

    return [
      {
        key: `link:${formatReference(link)}`,
        target: { type: "repo", rid: linkRid },
        link,
        label: description.label,
        primary: description.primary,
        secondary: description.secondary,
        icon: description.icon,
        haystack: description.label,
      },
    ];
  }

  async function resolveOid(oid: string): Promise<Suggestion[]> {
    const [issue, patch, release, commit] = await Promise.all([
      cachedIssueById(rid, oid).catch(() => undefined),
      cachedPatchById(rid, oid).catch(() => undefined),
      cachedReleaseById(rid, oid).catch(() => undefined),
      cachedRepoCommit(rid, oid).catch(() => undefined),
    ]);
    const rows: Suggestion[] = [];

    if (issue) {
      rows.push({
        key: `issue:${issue.id}`,
        target: { type: "cob", kind: "issue", rid, oid },
        label: issue.title,
        primary: issue.title,
        secondary: formatOid(oid),
        icon: issue.state.status === "closed" ? "issue-closed" : "issue",
        haystack: issue.title,
      });
    }
    if (patch) {
      rows.push({
        key: `patch:${patch.id}`,
        target: { type: "cob", kind: "patch", rid, oid },
        label: patch.title,
        primary: patch.title,
        secondary: formatOid(oid),
        icon: patchIcon[patch.state.status],
        haystack: patch.title,
      });
    }
    if (release) {
      rows.push(releaseRow(release));
    }
    if (commit && rows.length === 0) {
      rows.push({
        key: `commit:${oid}`,
        target: { type: "commit", rid, oid },
        label: commit.summary,
        primary: commit.summary,
        secondary: formatOid(oid),
        icon: "commit",
        haystack: commit.summary,
      });
    }

    return rows;
  }

  function badgeFor(
    nid: string,
    delegates: Author[],
    suggestions: AliasSuggestion[],
  ): Suggestion["badge"] {
    const match = suggestions.find(s => publicKeyFromDid(s.did) === nid);
    if (match?.isSelf) return "you";
    if (delegates.some(d => publicKeyFromDid(d.did) === nid)) return "delegate";
    if (match?.followed) return "following";

    return undefined;
  }

  async function collectPeople(query: string): Promise<Suggestion[]> {
    const [aliases, repo] = await Promise.all([
      cachedSearchAliases(query),
      cachedRepoById(rid).catch(() => undefined),
    ]);
    const delegates = repo?.delegates ?? [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local dedupe, never rendered reactively
    const seen = new Set<string>();

    const rows = [
      ...delegates.map(author => ({
        ...author,
        followed: false,
        isSelf: false,
      })),
      ...aliases,
    ].flatMap(author => {
      const nid = publicKeyFromDid(author.did);
      if (seen.has(nid)) return [];
      seen.add(nid);
      const label = author.alias ?? truncateId(nid);

      return [
        {
          key: `node:${nid}`,
          target: { type: "node", nid } satisfies Entity,
          label: `@${label}`,
          primary: label,
          secondary: truncateId(nid),
          avatar: nid,
          badge: badgeFor(nid, delegates, aliases),
          mono: author.alias === undefined,
          named: author.alias !== undefined,
          haystack: `${author.alias ?? ""} ${nid}`,
        },
      ];
    });

    const group = (badge: Suggestion["badge"]) =>
      rows
        .filter(row => row.badge === badge && row.badge !== "you")
        .sort((a, b) => Number(b.named) - Number(a.named));

    const unvouched = group(undefined).slice(0, maxUnvouchedPeople);
    const self = rows.filter(row => row.badge === "you");

    return [
      ...group("delegate"),
      ...group("following"),
      ...unvouched,
      ...self,
    ].map(({ named: _named, ...row }) => row);
  }

  async function collectRepos(): Promise<Suggestion[]> {
    const repos = await cachedListReposSummary(repoListScope.value).catch(
      () => [],
    );
    const ordered = [...repos].sort(
      (a, b) =>
        Number(b.rid === rid) - Number(a.rid === rid) ||
        a.name.localeCompare(b.name),
    );

    return ordered.map(repo => ({
      key: `repo:${repo.rid}`,
      target: { type: "repo", rid: repo.rid } satisfies Entity,
      label: repo.name,
      primary: repo.name,
      secondary: truncateId(repo.rid.replace("rad:", "")),
      icon: "repository" as IconName,
      haystack: `${repo.name} ${repo.rid}`,
    }));
  }

  async function collectCobs(): Promise<Suggestion[]> {
    const [allIssues, allPatches, allReleases] = await Promise.all([
      cachedListIssueCandidates(rid).catch(() => []),
      cachedListPatchCandidates(rid).catch(() => []),
      cachedListReleaseCandidates(rid).catch(() => []),
    ]);
    const rows = [
      ...allIssues.map(issue => ({
        timestamp: issue.timestamp,
        key: `issue:${issue.id}`,
        target: {
          type: "cob",
          kind: "issue",
          rid,
          oid: issue.id,
        } satisfies Entity,
        label: issue.title,
        primary: issue.title,
        secondary: formatOid(issue.id),
        icon: (issue.state.status === "open"
          ? "issue"
          : "issue-closed") as IconName,
        haystack: `${issue.title} ${issue.id}`,
      })),
      ...allPatches.map(patch => ({
        timestamp: patch.timestamp,
        key: `patch:${patch.id}`,
        target: {
          type: "cob",
          kind: "patch",
          rid,
          oid: patch.id,
        } satisfies Entity,
        label: patch.title,
        primary: patch.title,
        secondary: formatOid(patch.id),
        icon: patchIcon[patch.state.status],
        haystack: `${patch.title} ${patch.id}`,
      })),
      ...allReleases.map(release => ({
        timestamp: release.createdAt,
        ...releaseRow(release),
      })),
    ];

    return rows
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(({ timestamp: _timestamp, ...row }) => row);
  }

  function releaseTitle(release: Release): string {
    return (
      release.title || release.tagName || `release ${formatOid(release.id)}`
    );
  }

  function releaseRow(release: Release): Suggestion {
    const label = releaseTitle(release);

    return {
      key: `release:${release.id}`,
      target: { type: "cob", kind: "release", rid, oid: release.id },
      label,
      primary: label,
      secondary: formatOid(release.id),
      icon: "parcel",
      haystack: `${label} ${release.tagName ?? ""} ${release.id}`,
    };
  }

  const patchIcon: Record<string, IconName> = {
    draft: "patch-draft",
    open: "patch",
    archived: "patch-archived",
    merged: "patch-merged",
  };

  function rank(collected: Suggestion[], query: string): Suggestion[] {
    if (query === "") return collected.slice(0, maxSuggestions);

    const order = new Map(collected.map((row, index) => [row.key, index]));

    const ranked = fuzzysort
      .go(query, collected, { key: "haystack", threshold: 0.4 })
      .map(result => ({ row: result.obj, score: result.score }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (order.get(a.row.key) ?? 0) - (order.get(b.row.key) ?? 0),
      )
      .map(result => result.row);

    return [
      ...ranked.filter(row => row.badge === "you"),
      ...ranked.filter(row => row.badge !== "you"),
    ].slice(0, maxSuggestions);
  }

  function select(suggestion: Suggestion) {
    if (!trigger) return;
    onselect({
      start: trigger.start,
      end: trigger.end,
      markdown: `${
        suggestion.link
          ? referenceMarkdown(suggestion.link, suggestion.label)
          : entityMarkdown(suggestion.target, suggestion.label)
      } `,
    });
    suggestions = [];
  }

  $effect(() => {
    registerKeydown(handleKeydown);
  });

  $effect(() => {
    if (!scrollEl) return;
    const [initialize] = useOverlayScrollbars({
      options: () => ({
        scrollbars: {
          theme: "global-os-theme-radicle",
          autoHide: "scroll",
        },
      }),
      defer: true,
    });

    initialize({ target: scrollEl });
  });

  $effect(() => {
    if (!open) return;
    rowElements[activeIndex]?.scrollIntoView({ block: "nearest" });
  });

  function handleKeydown(event: KeyboardEvent): boolean {
    if (!open) return false;

    switch (event.key) {
      case "ArrowDown":
        activeIndex = (activeIndex + 1) % suggestions.length;
        return true;
      case "ArrowUp":
        activeIndex =
          (activeIndex - 1 + suggestions.length) % suggestions.length;
        return true;
      case "Enter":
      case "Tab": {
        const suggestion = suggestions[activeIndex];
        if (!suggestion) return false;
        select(suggestion);
        return true;
      }
      case "Escape":
        dismissedAt = trigger?.start;
        return true;
      default:
        return false;
    }
  }
</script>

<style>
  .suggestions {
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    z-index: 400;
    display: flex;
    flex-direction: column;
    min-width: 16rem;
    max-width: 28rem;
    padding: 0.25rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .suggestions-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .suggestion {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-align: left;
    cursor: pointer;
  }
  .suggestion.selected {
    background-color: var(--color-surface-subtle);
  }
  .suggestion-primary {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .suggestion-secondary {
    margin-left: auto;
    padding-left: 0.5rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
    font-family: var(--font-family-code);
  }
  .suggestion-primary.mono {
    font-family: var(--font-family-code);
  }
  .suggestion-icon {
    display: flex;
    align-items: center;
    color: var(--color-text-secondary);
  }
  .suggestion-badge {
    flex-shrink: 0;
    padding: 0 0.25rem;
    border-radius: var(--border-radius-tiny);
    background-color: var(--color-fill-ghost);
    color: var(--color-text-secondary);
  }
</style>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="suggestions"
    bind:this={floatingEl}
    use:portal
    onmousedown={event => {
      event.preventDefault();
    }}>
    <div class="suggestions-scroll" bind:this={scrollEl}>
      {#each suggestions as suggestion, index (suggestion.key)}
        <button
          type="button"
          bind:this={rowElements[index]}
          class="suggestion"
          class:selected={index === activeIndex}
          onmouseenter={() => (activeIndex = index)}
          onmousedown={event => {
            event.preventDefault();
            select(suggestion);
          }}>
          {#if suggestion.avatar}
            <UserAvatar nodeId={suggestion.avatar} styleWidth="1rem" />
          {:else if suggestion.icon}
            <span class="suggestion-icon">
              <Icon name={suggestion.icon} />
            </span>
          {/if}
          <span class="suggestion-primary" class:mono={suggestion.mono}>
            {suggestion.primary}
          </span>
          {#if suggestion.badge}
            <span class="suggestion-badge txt-body-s-medium">
              {suggestion.badge}
            </span>
          {/if}
          {#if suggestion.secondary}
            <span class="suggestion-secondary">{suggestion.secondary}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}
