<script lang="ts">
  import type { Revision } from "@bindings/cob/patch/Revision";
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { Diff } from "@bindings/diff/Diff";
  import type { Commit } from "@bindings/repo/Commit";
  import type { Snippet } from "svelte";

  import { tick, untrack } from "svelte";

  import type { CodeComments } from "@app/lib/codeComments";
  import {
    orderComments,
    stepCommitIndex,
    stepIndex,
  } from "@app/lib/commentNavigation";
  import { diffOptions } from "@app/lib/diffOptions.svelte";
  import {
    checkedPaths,
    fileDiffPath,
    fileMetaOf,
    fullFileLoader,
  } from "@app/lib/diffText";
  import { draftReviewStorage } from "@app/lib/draftReviewStorage";
  import {
    cachedDiffStats,
    cachedGetDiff,
    cachedGetDiffText,
    cachedListCommits,
    getDiffText,
  } from "@app/lib/invoke";
  import { anchorOf, commentCountsByPath } from "@app/lib/pierreComments";
  import { isCommitListDescription } from "@app/lib/revisionDescription";
  import { useShortcuts } from "@app/lib/shortcuts.svelte";
  import { pluralize } from "@app/lib/utils";

  import CobCommitTeaser from "@app/components/CobCommitTeaser.svelte";
  import CommitsContainer from "@app/components/CommitsContainer.svelte";
  import ExtendedTextarea from "@app/components/ExtendedTextarea.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import JobCob from "@app/components/JobCob.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import PierreDiff from "@app/components/PierreDiff.svelte";

  interface Props {
    patchId: string;
    revision: Revision;
    rid: string;
    codeComments?: CodeComments;
    draftReviewId?: string;
    // Reported upward so the review bar knows whether its per-file progress
    // applies to what's on screen.
    showingRevisionDiff?: boolean;
    filesExpanded?: boolean;
    canEditDescription?: boolean;
    onSaveDescription?: (body: string, embeds: Embed[]) => Promise<void>;
    // The patch view's own header (title, metadata, tabs). Rendered inside the
    // diff's scroll content, full width, so it scrolls away like the rest of the
    // top of the page.
    chrome?: Snippet;
    // The view switcher, stuck to the top of the diff's scroll port. It is the
    // last thing before the two columns, so the description sits above it.
    tabs?: Snippet;
    // Where the comment stepper stands, for the tab bar to render. An index of
    // `-1` means it has not been stepped yet.
    commentPosition?: { index: number; total: number };
  }

  /* eslint-disable prefer-const */
  let {
    patchId,
    revision,
    rid,
    codeComments,
    draftReviewId,
    showingRevisionDiff = $bindable(true),
    // An output binding: the tab bar renders the toggle and reads this, while
    // this component only resets it when the diff on screen changes.
    // eslint-disable-next-line no-useless-assignment
    filesExpanded = $bindable(true),
    canEditDescription = false,
    onSaveDescription,
    chrome,
    tabs,
    // Another output binding, like `filesExpanded`: the tab bar renders the
    // stepper and reads this, while the stepping itself happens here.
    commentPosition = $bindable({ index: -1, total: 0 }),
  }: Props = $props();
  /* eslint-enable prefer-const */

  let selectedCommit = $state<string>();
  let selectedCommitData = $state<Commit>();
  let editingDescription = $state(false);
  let commitsColumnEl = $state<HTMLElement>();
  let diffView = $state<ReturnType<typeof PierreDiff> | undefined>();
  // Parent reuses this component across patch revisions; a sibling $effect
  // resets base and head when patchId changes.
  // svelte-ignore state_referenced_locally
  let base = $state(revision.base);
  // svelte-ignore state_referenced_locally
  let head = $state(revision.head);

  // Guarded on the ids, not the `revision` prop: reloading after a comment or
  // reaction hands down a fresh object with the same contents, and resetting on
  // that would drop the selected commit and the reader's scroll position.
  // svelte-ignore state_referenced_locally
  let viewedKey = `${patchId}:${revision.id}`;
  $effect(() => {
    const key = `${patchId}:${revision.id}`;
    const nextBase = revision.base;
    const nextHead = revision.head;
    untrack(() => {
      if (key === viewedKey) return;
      viewedKey = key;
      filesExpanded = true;
      selectedCommit = undefined;
      selectedCommitData = undefined;
      editingDescription = false;
      base = nextBase;
      head = nextHead;
    });
  });

  function selectRevision({
    headId,
    baseId,
    commitId = undefined,
    commit = undefined,
    showFiles = true,
  }: {
    headId: string;
    baseId: string;
    commitId?: string;
    commit?: Commit;
    showFiles?: boolean;
  }) {
    head = headId;
    base = baseId;
    selectedCommit = commitId;
    selectedCommitData = commit;
    filesExpanded = showFiles;
  }

  // Whether the diff on screen is the revision's own changeset. Selecting a
  // commit normally narrows it, but a single-commit revision's commit diff is
  // the revision diff, so reviewing stays available there. This, rather than
  // "a commit is selected", is what the review affordances depend on.
  const isRevisionDiff = $derived(
    base === revision.base && head === revision.head,
  );
  $effect(() => {
    if (showingRevisionDiff !== isRevisionDiff) {
      showingRevisionDiff = isRevisionDiff;
    }
  });

  // A `CodeLocation` records the commit a comment was written against but not
  // the base it was diffed from, and placement matches on path and line alone,
  // so a narrowed view carries no comment layer at all.
  const diffCodeComments = $derived(isRevisionDiff ? codeComments : undefined);

  // Both halves of the diff, loaded together and published in one go: Pierre
  // renders from the patch text, while the structured diff supplies the stats,
  // per-file status and the binary/empty marks Pierre cannot derive from a
  // hunk-less file.
  //
  // `key` doubles as Pierre's `cacheKey` prefix, so it has to be published in
  // the same update as the text it belongs to: keying the shared highlight
  // cache by file path alone collides across diffs and renders files blank.
  let loadedDiff = $state.raw<
    { key: string; text: string; diff: Diff } | undefined
  >();
  let diffReady = $state.raw<Promise<unknown>>(Promise.resolve());
  let diffFailed = $state(false);
  $effect(() => {
    const ridLocal = rid;
    const baseLocal = base;
    const headLocal = head;
    const key = `${baseLocal}-${headLocal}`;
    if (untrack(() => loadedDiff?.key) === key) return;
    let cancelled = false;
    diffFailed = false;
    const request = Promise.all([
      cachedGetDiffText(ridLocal, baseLocal, headLocal, 3),
      cachedGetDiff(ridLocal, {
        base: baseLocal,
        head: headLocal,
      }),
    ])
      .then(([text, diff]) => {
        if (cancelled) return;
        loadedDiff = { key, text, diff };
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(
          `Changes: failed to load the diff for ${baseLocal}..${headLocal}`,
          error,
        );
        diffFailed = true;
      });
    diffReady = request;
    return () => {
      cancelled = true;
    };
  });

  const diffFiles = $derived(loadedDiff?.diff.files ?? []);
  const stats = $derived(loadedDiff?.diff.stats);

  const fileMeta = $derived(fileMetaOf(diffFiles));

  const reviewedPaths = $derived.by(() => {
    const id = draftReviewId;
    if (!id) return undefined;
    return checkedPaths(diffFiles, path =>
      draftReviewStorage.isFileChecked(id, path),
    );
  });

  // Lockfiles and generated manifests are noise in a review, and a file already
  // marked reviewed has been dealt with, so both start collapsed.
  const collapsedPaths = $derived(
    new Set([...fileMeta.ignored, ...(reviewedPaths ?? [])]),
  );

  const commentCounts = $derived.by(() => {
    const comments = diffCodeComments;
    if (!comments) return undefined;
    return commentCountsByPath(
      comments.threads,
      commentId => comments.canResolveComment?.(commentId) ?? true,
    );
  });

  // What the tab bar's stepper walks.
  const orderedComments = $derived(
    diffCodeComments
      ? orderComments(
          diffCodeComments.threads,
          diffFiles.map(fileDiffPath),
          path => fileMeta.statuses.get(path),
        )
      : [],
  );

  // Which comment the stepper is on, held by id rather than by position: the
  // list shifts as comments are written, deleted or filtered out, and a position
  // would quietly come to mean a different comment. One that goes away leaves
  // the stepper unset, which reads as `-1` and starts the walk over.
  let activeCommentId = $state<string | undefined>();
  const commentIndex = $derived(
    activeCommentId === undefined
      ? -1
      : orderedComments.findIndex(entry => entry.id === activeCommentId),
  );
  $effect(() => {
    const index = commentIndex;
    const total = orderedComments.length;
    if (commentPosition.index !== index || commentPosition.total !== total) {
      commentPosition = { index, total };
    }
  });

  // Rings the comment just stepped to and then lets it go, so the diff is not
  // left holding a stale mark.
  let highlightedCommentId = $state<string | undefined>();
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(highlightTimer));

  /// Walk to the next (`1`) or previous (`-1`) comment on the diff. Called from
  /// the tab bar, which sits outside this component.
  export function stepComment(delta: number) {
    const index = stepIndex(commentIndex, orderedComments.length, delta);
    if (index === undefined) return;
    const target = orderedComments[index];
    activeCommentId = target.id;
    clearTimeout(highlightTimer);
    highlightedCommentId = target.id;
    highlightTimer = setTimeout(() => {
      highlightedCommentId = undefined;
    }, 2400);
    diffView?.scrollToAnchor(target.anchor);
  }

  // Pierre's context-expand markers hydrate a file lazily from these, so
  // nothing is fetched until the reader expands something.
  const loadFullFile = $derived(
    fullFileLoader(rid, base, head, () => diffFiles),
  );

  const isActiveCommit = (commitId: string) => selectedCommit === commitId;
  const isTeaserDisabled = (commitId: string) =>
    selectedCommit ? selectedCommit !== commitId : false;

  let commitList = $state<Commit[]>([]);
  $effect(() => {
    const ridLocal = rid;
    const baseRev = revision.base;
    const headRev = revision.head;
    let cancelled = false;
    void cachedListCommits(ridLocal, baseRev, headRev).then(c => {
      if (!cancelled) commitList = c;
    });
    return () => {
      cancelled = true;
    };
  });

  // A single-commit revision has nothing to choose between, so select that
  // commit automatically to surface its message. The diff stays the
  // revision's own range: a merge commit's first parent is the side it merged
  // into, not the revision base, so narrowing to the commit diff there would
  // show the other branch's changes instead of the patch's.
  $effect(() => {
    if (commitList.length === 1 && !selectedCommit) {
      const only = commitList[0];
      selectRevision({
        headId: revision.head,
        baseId: revision.base,
        commitId: only.id,
        commit: only,
      });
    }
  });

  const revisionDescription = $derived(
    revision.description.slice(-1)[0]?.body?.trim() ?? "",
  );
  const showRevisionDescription = $derived(
    revisionDescription !== "" &&
      !isCommitListDescription(revisionDescription, commitList),
  );

  const DESCRIPTION_MAX_HEIGHT = 150;
  let descriptionExpanded = $state(false);
  let descriptionEl = $state<HTMLElement>();
  let descriptionOverflows = $state(false);
  const descriptionCollapsed = $derived(
    descriptionOverflows && !descriptionExpanded,
  );
  $effect(() => {
    const el = descriptionEl;
    if (!el) return;
    const measure = () => {
      descriptionOverflows = el.scrollHeight > DESCRIPTION_MAX_HEIGHT;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Bring the top of the diff into view after the reader changes what the diff
  // column shows; otherwise the old scroll position leaves you mid-diff and the
  // new commit message looks missing.
  //
  // Driven by the click that caused it rather than by watching `selectedCommit`.
  // That selection is also set programmatically — a single-commit revision
  // auto-selects its only commit — so an effect could not tell "the reader
  // picked a commit" from "the revision changed underneath them", and scrolled
  // on both.
  //
  // The tick comes first so that the selection has reached the effect that
  // loads the diff: `diffReady` is read the moment it is awaited, and reading
  // it any earlier gets the promise for the diff being navigated away from.
  async function scrollToDiff() {
    await tick();
    await diffReady;
    await tick();
    diffView?.scrollToFilesTop();
  }

  /// Collapse or expand every file. Driven from the tab bar, which the patch
  /// view renders.
  export function setAllFilesCollapsed(collapsed: boolean) {
    filesExpanded = !collapsed;
    diffView?.setAllCollapsed(collapsed);
  }

  /// Scroll to one of the draft review's code comments. Called from the review
  /// bar, which sits outside this component.
  export async function revealComment(location: CodeLocation) {
    // Code comments are only superimposed on the revision's own diff, so a view
    // narrowed to a single commit has none to scroll to. Widen back first.
    if (!isRevisionDiff) {
      selectRevision({ headId: revision.head, baseId: revision.base });
      await tick();
      await diffReady;
    }
    // Pierre holds the target until the widened patch has been parsed.
    diffView?.scrollToAnchor(anchorOf(location));
  }

  // Keep the selected commit inside the commit column's own scroll port,
  // without touching the diff's scroll position.
  function revealActiveCommit() {
    const column = commitsColumnEl;
    const active = column?.querySelector<HTMLElement>(".commit.active");
    if (!column || !active) return;
    const columnRect = column.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    if (rect.top < columnRect.top) {
      column.scrollTop -= columnRect.top - rect.top;
    } else if (rect.bottom > columnRect.bottom) {
      column.scrollTop += rect.bottom - columnRect.bottom;
    }
  }

  function selectCommitAt(index: number) {
    if (commitList.length <= 1) return;
    const commit = commitList[index];
    selectRevision({
      headId: commit.id,
      baseId: commit.parents[0],
      commitId: commit.id,
      commit,
    });
    void scrollToDiff();
    void tick().then(revealActiveCommit);
  }

  useShortcuts(
    {
      shortcut: "previousCommit",
      enabled: () => commitList.length > 1,
      run: () => {
        const current = commitList.findIndex(c => c.id === selectedCommit);
        selectCommitAt(stepCommitIndex(current, commitList.length, -1));
      },
    },
    {
      shortcut: "nextCommit",
      enabled: () => commitList.length > 1,
      run: () => {
        const current = commitList.findIndex(c => c.id === selectedCommit);
        selectCommitAt(stepCommitIndex(current, commitList.length, 1));
      },
    },
    {
      shortcut: "allCommits",
      enabled: () => selectedCommit !== undefined,
      run: () => {
        selectRevision({ headId: revision.head, baseId: revision.base });
        void scrollToDiff();
      },
    },
  );
</script>

<style>
  /* The chrome spans the whole width; everything below it shares the row with
     the commit column, so it carries the same inset as the file cards. */
  /* The patch header is the only thing that spans the full width; everything
     below the sticky tab bar lives in the files column, so the commit column can
     simply stick rather than being positioned against any of it. */
  /* The gap above the tab bar lives here rather than on the bar itself: the bar
     pins to the top of the scroll port, so a margin of its own would be pinned
     with it and the collapsed state could never be tighter than the resting one.
     Held by the chrome, it scrolls away like the rest of the chrome. */
  .diff-header {
    display: flex;
    flex-direction: column;
    padding: 0 1rem 0.5rem;
  }
  .revision-description {
    position: relative;
    margin-bottom: 1rem;
    /* Matches the change summary's inset below it, so the two read as one
       column of text — but with no border or fill of its own. */
    padding: 0.375rem 0.75rem;
    color: var(--color-text-primary);
  }
  .revision-description:has(.revision-description-actions)
    .revision-description-body {
    padding-right: 2.5rem;
  }
  .revision-description-actions {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
  }
  .revision-description-edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 0.25rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-tertiary);
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .revision-description:hover .revision-description-edit,
  .revision-description-edit:focus-visible {
    opacity: 1;
  }
  .revision-description-edit:hover,
  .revision-description-edit:focus-visible {
    color: var(--color-text-primary);
    background-color: var(--color-surface-subtle);
  }
  .revision-description.collapsed .revision-description-body {
    max-height: 150px;
    overflow: hidden;
  }
  .revision-description-toggle {
    display: flex;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .revision-description.collapsed .revision-description-toggle {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    align-items: flex-end;
    height: 3rem;
    margin: 0;
    padding-bottom: 0.25rem;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--color-surface-canvas)
    );
    pointer-events: none;
  }
  /* Identical to the "View all revision changes" button (.diff-tease-button). */
  .revision-description-button {
    pointer-events: auto;
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    cursor: pointer;
    box-shadow: var(--elevation-low);
  }
  .revision-description-button:hover,
  .revision-description-button:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  /* The card is the scroll port, not something inside one: its border then
     belongs to the frame the sticky list header pins against, instead of
     scrolling a fraction of a pixel out from under it. It is content-sized up to
     the height the diff hands the column. */
  .commits-column {
    /* Handed down by the diff. A percentage would resolve against an indefinite
       box and be dropped, and the list would grow past the port instead of
       scrolling within it. */
    max-height: var(--app-diff-overlay-height, 100%);
    overflow-y: auto;
    /* An outset ring, not a border: the file cards beside it are outlined the
       same way, and a real border would sit inside the box and leave the two a
       pixel out of line. */
    box-shadow: 0 0 0 1px var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .stats-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .stats {
    min-width: 0;
  }
  .selected-commit-message {
    margin-bottom: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .selected-commit-body {
    margin: 0.5rem 0 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
  }
  .commit-stats {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
  }
  .commit-stats .insertions {
    color: var(--color-feedback-success-text);
    margin-left: 0.5rem;
  }
  .commit-stats .deletions {
    color: var(--color-feedback-error-text);
  }
  .commits {
    display: flex;
    flex-direction: column;
    font: var(--txt-body-m-regular);
  }
  .commit {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.5rem 1rem;
  }
  .commit + .commit {
    border-top: 1px solid var(--color-border-subtle);
  }
  /* The last row sits flush against the container's bottom edge, so its hover
     and selected fill has to follow the rounded corners itself rather than
     relying on the scroll container to clip it. */
  .commit:last-child {
    border-bottom-left-radius: var(--border-radius-md);
    border-bottom-right-radius: var(--border-radius-md);
  }
  .commit > :global(.teaser) {
    flex: 1;
    min-width: 0;
  }
  .commit:hover {
    background-color: var(--color-surface-subtle);
  }
  /* Overlay the close button so showing it on selection doesn't shift the
     commit content, straddling the commit list's right edge as an outline
     button. */
  .commit-close {
    position: absolute;
    top: 0;
    right: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--color-border-default);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .commit-close:hover,
  .commit-close:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .commit.active {
    background-color: var(--color-surface-subtle);
  }
  .summary {
    padding: 0.25rem 0;
  }
</style>

{#snippet commitsColumn()}
  {#if commitList.length > 0}
    <div class="commits-column" bind:this={commitsColumnEl}>
      <CommitsContainer>
        {#snippet leftHeader()}
          <div class="global-flex txt-body-m-regular summary">
            {commitList.length}
            {pluralize("commit", commitList.length)} on base
            <Id
              id={revision.base}
              clipboard={revision.base}
              label="base commit" />
          </div>
        {/snippet}
        <div class="commits">
          {#each commitList as commit}
            {@const active = isActiveCommit(commit.id)}
            {@const toggle = () => {
              if (active) {
                // Keep the sole commit selected; there's nothing else to show.
                if (commitList.length === 1) return;
                selectRevision({
                  headId: revision.head,
                  baseId: revision.base,
                });
              } else {
                selectRevision({
                  headId: commit.id,
                  baseId: commit.parents[0],
                  commitId: commit.id,
                  commit,
                });
              }
              void scrollToDiff();
            }}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="commit" class:active onclick={toggle}>
              <CobCommitTeaser
                stacked
                hoverable
                disabled={isTeaserDisabled(commit.id)}
                {commit}>
                {#if commit.parents.length > 0}
                  <!-- Bound outside the `{#await}`; see `ReviewCodeThread`. -->
                  {@const statsPromise = cachedDiffStats(
                    rid,
                    commit.parents[0],
                    commit.id,
                  )}
                  {#await statsPromise then commitStats}
                    <span class="commit-stats">
                      <Icon name="document" />
                      {commitStats.filesChanged}
                      <span class="insertions">+{commitStats.insertions}</span>
                      <span class="deletions">-{commitStats.deletions}</span>
                    </span>
                  {/await}
                {/if}
                {#if commit.id === revision.head}
                  <JobCob {rid} commit={commit.id} />
                {/if}
              </CobCommitTeaser>
              {#if active && commitList.length > 1}
                <span class="commit-close" title="Show all changes">
                  <Icon name="close" />
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </CommitsContainer>
    </div>
  {/if}
{/snippet}

{#snippet diffHeader()}
  <div class="diff-header">
    {#if chrome}
      {@render chrome()}
    {/if}
  </div>
{/snippet}

{#snippet filesHeader()}
  {#if showRevisionDescription || canEditDescription}
    {#if editingDescription}
      <div class="revision-description">
        <ExtendedTextarea
          {rid}
          body={showRevisionDescription ? revisionDescription : ""}
          focus
          submitCaption="Save"
          submit={async ({ comment, embeds }) => {
            await onSaveDescription?.(comment, Array.from(embeds.values()));
            editingDescription = false;
          }}
          close={() => (editingDescription = false)} />
      </div>
    {:else}
      <div class="revision-description" class:collapsed={descriptionCollapsed}>
        <div
          class="revision-description-body txt-body-m-regular"
          bind:this={descriptionEl}>
          {#if showRevisionDescription}
            <Markdown
              {rid}
              breaks
              content={revision.description.slice(-1)[0]?.body ?? ""}
              toggleTaskItem={canEditDescription && onSaveDescription
                ? async content => {
                    await onSaveDescription(
                      content,
                      revision.description.slice(-1)[0]?.embeds ?? [],
                    );
                  }
                : undefined} />
          {:else}
            <span style:color="var(--color-text-tertiary)">No description</span>
          {/if}
        </div>
        {#if descriptionOverflows}
          <div class="revision-description-toggle">
            <button
              type="button"
              class="revision-description-button txt-body-m-medium"
              onclick={() => (descriptionExpanded = !descriptionExpanded)}>
              {descriptionExpanded ? "Show less" : "Show more"}
              <Icon
                name={descriptionExpanded
                  ? "collapse-vertical"
                  : "expand-vertical"} />
            </button>
          </div>
        {/if}
        {#if canEditDescription}
          <div class="revision-description-actions">
            <button
              type="button"
              class="revision-description-edit"
              title="Edit description"
              onclick={() => (editingDescription = true)}>
              <Icon name="edit" />
            </button>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
  <div class="stats-row txt-body-m-regular">
    <div class="stats" style:color="var(--color-text-secondary)">
      {#if diffFailed}
        <span style:color="var(--color-feedback-error-text)">
          Failed to load the changes.
        </span>
      {:else if stats}
        {stats.filesChanged}
        {pluralize("file", stats.filesChanged)} modified with
        <span style:color="var(--color-feedback-success-text)">
          {stats.insertions}
          {pluralize("insertion", stats.insertions)}
        </span>
        and
        <span style:color="var(--color-feedback-error-text)">
          {stats.deletions}
          {pluralize("deletion", stats.deletions)}
        </span>
      {:else}
        Loading…
      {/if}
    </div>
  </div>

  <div>
    {#if selectedCommitData}
      <div class="selected-commit-message txt-selectable">
        <div class="selected-commit-summary txt-body-m-medium">
          {selectedCommitData.summary}
        </div>
        {#if selectedCommitData.message.trim() !== selectedCommitData.summary.trim()}
          <pre class="selected-commit-body">{selectedCommitData.message
              .replace(selectedCommitData.summary, "")
              .trim()}</pre>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<PierreDiff
  bind:this={diffView}
  patch={loadedDiff?.text ?? ""}
  cacheKeyPrefix={loadedDiff?.key}
  diffStyle={diffOptions.diffStyle}
  wordWrap={diffOptions.wordWrap}
  diffIndicators={diffOptions.indicators}
  lineDiffType={diffOptions.lineDiffType}
  {loadFullFile}
  fileNotes={fileMeta.notes}
  fileStatuses={fileMeta.statuses}
  fileDiffText={path => getDiffText(rid, base, head, 3, path)}
  {collapsedPaths}
  {reviewedPaths}
  onToggleReviewed={draftReviewId
    ? path => draftReviewStorage.toggleCheckedFile(draftReviewId, path)
    : undefined}
  {commentCounts}
  {highlightedCommentId}
  codeComments={diffCodeComments}
  commentCommit={isRevisionDiff ? head : undefined}
  header={diffHeader}
  overlayLeft={commitsColumn}
  {filesHeader}
  stickyTop={tabs} />
