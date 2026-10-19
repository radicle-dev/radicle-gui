<script lang="ts">
  import type { CobEvent, Comment, PatchState, Repo, Review, Revision } from "@app/node/model";

  import { diffSnapshots, diffStats } from "@app/node/diff";
  import { navigate } from "@app/lib/router.svelte";
  import { copy, fullDate, plural, shortId, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import CobStateButton from "@app/components/CobStateButton.svelte";
  import CommentView from "@app/components/CommentView.svelte";
  import Composer from "@app/components/Composer.svelte";
  import DiffView from "@app/components/DiffView.svelte";
  import EditableTitle from "@app/components/EditableTitle.svelte";
  import Empty from "@app/components/Empty.svelte";
  import EventRow from "@app/components/EventRow.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IdChip from "@app/components/IdChip.svelte";
  import LabelsChip from "@app/components/LabelsChip.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import ReviewItem from "@app/components/ReviewItem.svelte";
  import RyphRunCard from "@app/components/RyphRunCard.svelte";
  import SummonButton from "@app/components/SummonButton.svelte";
  import Thread from "@app/components/Thread.svelte";
  import Timeline from "@app/components/Timeline.svelte";
  import TimelineRow from "@app/components/TimelineRow.svelte";

  interface Props {
    repo: Repo;
    id: string;
    view: string;
  }

  const { repo, id, view }: Props = $props();

  const patch = $derived(repo.patches.find(p => p.id === id));
  const base = $derived(node.repoPath(repo));
  const href = $derived(`${base}/patches/${id}`);
  const latest = $derived(patch ? node.latestRevision(patch) : undefined);
  const tab = $derived(view === "changes" ? "changes" : "activity");

  let revIndex = $state<number | undefined>(undefined);
  let sincePrevious = $state(false);
  let allCollapsed = $state(false);
  const revision = $derived(
    patch ? patch.revisions[revIndex ?? patch.revisions.length - 1] : undefined,
  );
  const revisionNumber = $derived(patch && revision ? patch.revisions.indexOf(revision) + 1 : 0);
  const previous = $derived(
    patch && revision ? patch.revisions[patch.revisions.indexOf(revision) - 1] : undefined,
  );
  const files = $derived(
    revision
      ? diffSnapshots(
          repo.snapshots[sincePrevious && previous ? previous.head : revision.base] ?? {},
          repo.snapshots[revision.head] ?? {},
        )
      : [],
  );
  const latestStats = $derived(
    latest
      ? diffStats(diffSnapshots(repo.snapshots[latest.base] ?? {}, repo.snapshots[latest.head] ?? {}))
      : undefined,
  );

  const delegate = $derived(node.isDelegate(repo));
  const mine = $derived(patch?.author === "self");
  const canEdit = $derived(delegate || mine);
  const allReviews = $derived(
    patch?.revisions.flatMap((r, i) => r.reviews.map(review => ({ review, number: i + 1 }))) ?? [],
  );
  const latestReviews = $derived(latest?.reviews ?? []);
  const accepts = $derived(
    latestReviews.filter(r => r.verdict === "accept" && repo.delegates.includes(r.author)),
  );
  const rejects = $derived(latestReviews.filter(r => r.verdict === "reject"));
  const canMerge = $derived(
    delegate && patch?.state === "open" && accepts.length >= repo.threshold && rejects.length === 0,
  );
  const myReview = $derived(latest?.reviews.find(r => r.author === "self"));
  const knownLabels = $derived([...new Set(repo.patches.flatMap(p => p.labels))]);

  // Review drafting
  let drafting = $state(false);
  let drafts = $state<{ path: string; line: number; body: string }[]>([]);
  let openDraft = $state<{ path: string; line: number } | undefined>(undefined);
  let summary = $state("");
  let verdict = $state<"comment" | "accept" | "reject">("comment");

  const reviewComments = $derived(
    revision?.reviews.flatMap(r => r.comments.map(c => ({ ...c, review: r }))) ?? [],
  );
  const marked = $derived(
    new Set([
      ...reviewComments.filter(c => c.location).map(c => `${c.location!.path}:${c.location!.line}`),
      ...drafts.map(d => `${d.path}:${d.line}`),
      ...(openDraft ? [`${openDraft.path}:${openDraft.line}`] : []),
    ]),
  );

  function startReview() {
    revIndex = undefined;
    drafting = true;
    navigate(`${href}?view=changes`);
  }

  function submitReview() {
    if (!patch) return;
    node.do({
      type: "review",
      rid: repo.rid,
      patch: patch.id,
      verdict: verdict === "comment" ? undefined : verdict,
      summary: summary.trim(),
      comments: drafts,
    });
    drafts = [];
    summary = "";
    drafting = false;
    verdict = "comment";
    navigate(href);
  }

  const runs = $derived(patch ? node.ryphRunsFor(repo.rid, "patch", patch.id) : []);
  const busy = $derived(runs.some(r => !r.finished));
  const origin = $derived(patch ? node.ryphRunForPatch(repo.rid, patch.id) : undefined);
  const latestChecks = $derived(latest?.checks ?? []);
  const failingChecks = $derived(latestChecks.filter(c => c.status === "failed"));

  type Item =
    | { kind: "run"; time: number; run: (typeof runs)[number] }
    | { kind: "revision"; time: number; rev: Revision; index: number }
    | { kind: "review"; time: number; review: Review; rev: Revision; index: number }
    | { kind: "thread"; time: number; root: Comment; replies: Comment[] }
    | { kind: "event"; time: number; event: CobEvent }
    | { kind: "merged"; time: number };

  const timeline = $derived.by((): Item[] => {
    if (!patch) return [];
    const items: Item[] = [];
    patch.revisions.forEach((rev, index) => {
      if (index > 0) items.push({ kind: "revision", time: rev.time, rev, index });
      for (const review of rev.reviews) {
        items.push({ kind: "review", time: review.time, review, rev, index });
      }
      const all = rev.comments;
      const rootOf = (c: Comment): Comment => {
        let cur = c;
        while (cur.replyTo) {
          const parent = all.find(p => p.id === cur.replyTo);
          if (!parent) break;
          cur = parent;
        }
        return cur;
      };
      for (const root of all.filter(c => rootOf(c) === c)) {
        items.push({
          kind: "thread",
          time: root.time,
          root,
          replies: all.filter(c => c !== root && rootOf(c) === root),
        });
      }
    });
    for (const event of patch.events) items.push({ kind: "event", time: event.time, event });
    if (patch.state === "merged" && patch.mergedAt) {
      items.push({ kind: "merged", time: patch.mergedAt });
    }
    for (const run of runs) items.push({ kind: "run", time: run.run.startedAt + 1, run });
    return items.sort((a, b) => a.time - b.time);
  });

  function badgeFor(c: Comment) {
    if (c.author === patch?.author) return "Author";
    if (repo.delegates.includes(c.author)) return "Delegate";
    return undefined;
  }

  function openRevision(index: number) {
    revIndex = patch && index === patch.revisions.length - 1 ? undefined : index;
    navigate(`${href}?view=changes`);
  }

  function subject(description: string) {
    return description.split("\n")[0].trim();
  }
</script>

<style>
  .main {
    max-width: 64rem;
    margin: 0 auto;
  }
  .main.wide {
    max-width: none;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
    align-items: center;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .add {
    color: var(--color-feedback-success-text);
  }
  .del {
    color: var(--color-feedback-error-text);
  }
  .reviewer-stack {
    display: inline-flex;
    align-items: center;
  }
  .reviewer-stack :global(.avatar + .avatar) {
    margin-left: -0.375rem;
    box-shadow: 0 0 0 1px var(--color-surface-canvas);
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-surface-canvas);
  }
  .tabs.pinned {
    position: sticky;
    top: 3.5rem;
    z-index: 5;
  }
  .tabs-right {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .changes {
    --diff-sticky-top: 6.55rem;
  }
  .revision-list {
    min-width: 26rem;
  }
  .rev-row {
    display: grid;
    grid-template-columns: 1.75rem 4.5rem minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.5rem;
  }
  .rev-row .n {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-medium);
  }
  .sha {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  .latest-chip {
    font: var(--txt-body-s-medium);
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .rev-subject {
    color: var(--color-text-primary);
    font-weight: 468;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .latest-chip {
    flex-shrink: 0;
  }
  .open-changes {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    padding: 0.125rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
  }
  .open-changes:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .origin {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .gate {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    margin: 1rem 0;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .gate strong {
    color: var(--color-text-primary);
    font-weight: 468;
  }
  .gate .meter {
    display: flex;
    gap: 0.25rem;
    width: 5rem;
  }
  .gate .meter span {
    flex: 1;
    height: 0.375rem;
    border-radius: var(--border-radius-full);
    background: var(--color-surface-strong);
  }
  .gate .meter span.on {
    background: var(--color-feedback-success-fill);
  }
  .checkout {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 22rem;
  }
  .cmd {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.25rem 0.25rem 0.25rem 0.5rem;
  }
  .cmd span {
    flex: 1;
  }
  .review-bar {
    position: sticky;
    bottom: 1rem;
    z-index: 10;
    margin-top: 1rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.16);
  }
  .verdicts {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    font: var(--txt-body-m-regular);
  }
  .verdicts label {
    display: flex;
    gap: 0.375rem;
    align-items: center;
    cursor: pointer;
  }
  .draft {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .draft-label {
    font: var(--txt-body-s-medium);
    color: var(--color-feedback-warning-text);
  }
  .inline-thread {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>

{#if !patch || !latest || !revision}
  <Empty icon="patch" title="Patch not found">This patch isn't on your node yet.</Empty>
{:else}
  <div class="main" class:wide={tab === "changes"}>
    <div class="title-row">
      <CobStateButton
        kind="patch"
        state={patch.state}
        options={canEdit && patch.state !== "merged" ? ["open", "draft", "archived"] : []}
        onSelect={state =>
          node.do({
            type: "patchState",
            rid: repo.rid,
            patch: patch.id,
            state: state as Exclude<PatchState, "merged">,
          })} />
      <EditableTitle
        title={patch.title}
        editable={canEdit}
        onSave={title => node.do({ type: "editCob", rid: repo.rid, kind: "patch", id: patch.id, title })} />
      <div class="actions">
        <Button variant="naked" title="Copy link" onclick={() => copy(location.href)}>
          <Icon name="link" />
        </Button>
        <Popover placement="bottom-end">
          {#snippet toggle(onclick)}
            <Button variant="naked" {onclick}><Icon name="checkout" />Checkout</Button>
          {/snippet}
          {#snippet popover()}
            <div class="popover-panel checkout">
              <span class="txt-body-m-semibold">Check out revision {revisionNumber}</span>
              <div class="cmd">
                <span>rad patch checkout {shortId(patch.id)}</span>
                <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(`rad patch checkout ${shortId(patch.id)}`)}>
                  <Icon name="copy" />
                </Button>
              </div>
            </div>
          {/snippet}
        </Popover>
        <SummonButton
          {repo}
          kind="patch"
          {busy}
          onSummon={body => node.do({ type: "patchComment", rid: repo.rid, patch: patch.id, body })} />
        {#if canMerge}
          <Button
            variant="secondary"
            onclick={() => node.do({ type: "mergePatch", rid: repo.rid, patch: patch.id })}>
            <Icon name="patch-merged" />Merge
          </Button>
        {:else if patch.state === "open" && !mine}
          <Button
            variant="secondary"
            disabled={!!myReview && !drafting}
            title={myReview ? "You already reviewed this revision" : "Start a review of this revision"}
            onclick={startReview}>
            <Icon name="comment" />Review
          </Button>
        {/if}
      </div>
    </div>

    <div class="meta">
      <span class="chip"><PersonLink person={patch.author} size="1rem" /></span>
      <span class="chip-group">
        <IdChip id={patch.id} label="patch ID" grouped />
        <Icon name="arrow-right" />
        <a class="chip" href={`${base}/tree/${repo.defaultBranch}`}>
          <Icon name="branch" />{repo.defaultBranch}
        </a>
      </span>
      {#if latestStats}
        <button class="chip" onclick={() => openRevision(patch.revisions.length - 1)} title="View changed files">
          <Icon name="diff" />
          {plural(latestStats.files, "file")}
          <span class="add">+{latestStats.additions}</span>
          <span class="del">-{latestStats.deletions}</span>
        </button>
      {/if}
      {#if latestChecks.length > 0}
        <Popover placement="bottom-start">
          {#snippet toggle(onclick)}
            <button class="chip" {onclick} title="Agentic CI from Ryph">
              <span
                style:display="inline-flex"
                style:color={failingChecks.length ? "var(--color-feedback-error-text)" : "var(--color-feedback-success-text)"}>
                <Icon name={failingChecks.length ? "close" : "checkmark"} />
              </span>
              {failingChecks.length
                ? `${failingChecks.length} of ${latestChecks.length} checks failed`
                : `${latestChecks.length} checks passed`}
            </button>
          {/snippet}
          {#snippet popover()}
            <div class="popover-panel">
              {#each latestChecks as c (c.name)}
                <div class="popover-item" style="cursor: default;">
                  <span
                    style:display="inline-flex"
                    style:color={c.status === "failed" ? "var(--color-feedback-error-text)" : "var(--color-feedback-success-text)"}>
                    <Icon name={c.status === "failed" ? "close" : "checkmark"} />
                  </span>
                  <span class="mono">ryph / {c.name}</span>
                  {#if c.durationSec}<span class="caption" style="margin-left: auto;">{c.durationSec}s</span>{/if}
                </div>
              {/each}
              <div class="caption txt-body-s-regular" style="padding: 0.375rem 0.5rem;">
                Revision {patch.revisions.length} · from .ryph/checks.yml
              </div>
            </div>
          {/snippet}
        </Popover>
      {/if}
      {#if allReviews.length > 0}
        <span
          class="chip"
          title={`${accepts.length} delegate approvals on the latest revision, ${repo.threshold} needed`}>
          <span
            style:color={rejects.length
              ? "var(--color-feedback-error-text)"
              : accepts.length >= repo.threshold
                ? "var(--color-feedback-success-text)"
                : undefined}
            style:display="inline-flex">
            <Icon name={rejects.length ? "stop" : accepts.length ? "thumbs-up" : "comment"} />
          </span>
          {plural(allReviews.length, "review")}
          <span class="reviewer-stack">
            {#each [...new Set(allReviews.map(r => r.review.author))].slice(0, 3) as a (a)}
              <Avatar person={a} size="1.125rem" />
            {/each}
          </span>
        </span>
      {/if}
      <LabelsChip
        labels={patch.labels}
        known={knownLabels}
        editable={canEdit}
        onSave={labels => node.do({ type: "editCob", rid: repo.rid, kind: "patch", id: patch.id, labels })} />
    </div>

    <div class="tabs" class:pinned={tab === "changes"}>
      <Button
        variant={tab === "activity" ? "ghost" : "naked"}
        active={tab === "activity"}
        onclick={() => navigate(href)}>
        <Icon name="activity" />Activity
      </Button>
      <Button
        variant={tab === "changes" ? "ghost" : "naked"}
        active={tab === "changes"}
        onclick={() => navigate(`${href}?view=changes`)}>
        <Icon name="diff" />Changes
      </Button>
      {#if tab === "changes"}
        <div class="tabs-right">
          {#if revision !== latest}
            <Button variant="outline" onclick={() => (revIndex = undefined)}>
              <Icon name="revision" />Back to latest revision
            </Button>
          {/if}
          {#if previous}
            <label class="row txt-body-m-regular caption" style="cursor: pointer;">
              <input type="checkbox" bind:checked={sincePrevious} /> Since revision {revisionNumber - 1}
            </label>
          {/if}
          {#if patch.revisions.length > 1}
            <Popover placement="bottom-end">
              {#snippet toggle(onclick)}
                <Button variant="outline" {onclick}>
                  <Icon name="revision" />
                  <span
                    style:color={revision === latest
                      ? "var(--color-text-secondary)"
                      : "var(--color-feedback-warning-text)"}>
                    Revision {revisionNumber} of {patch.revisions.length}
                  </span>
                  <span class="sha">{shortId(revision.id)}</span>
                  <Icon name="chevron-down" />
                </Button>
              {/snippet}
              {#snippet popover()}
                <div class="popover-panel revision-list">
                  {#each patch.revisions as r, i (r.id)}
                    <button
                      class="popover-item"
                      class:selected={r === revision}
                      onclick={() => {
                        revIndex = i === patch.revisions.length - 1 ? undefined : i;
                        closeFocused();
                      }}>
                      <span class="rev-row" style="width: 100%;">
                        <span class="n">r{i + 1}</span>
                        <span class="sha">{shortId(r.id)}</span>
                        <span class="ellipsis">{subject(r.description) || "No description"}</span>
                        <span class="caption txt-body-s-regular">{timeAgo(r.time)}</span>
                        <span class="reviewer-stack">
                          {#each r.reviews as v (v.id)}<Avatar person={v.author} size="1rem" />{/each}
                        </span>
                      </span>
                    </button>
                  {/each}
                </div>
              {/snippet}
            </Popover>
          {/if}
          <Button
            variant="naked"
            title={allCollapsed ? "Expand all files" : "Collapse all files"}
            onclick={() => (allCollapsed = !allCollapsed)}>
            <Icon name={allCollapsed ? "expand-vertical" : "collapse-vertical"} />
          </Button>
        </div>
      {/if}
    </div>

    {#if tab === "changes"}
      <div class="changes">
        <DiffView
          {files}
          {marked}
          {allCollapsed}
          onAddComment={drafting && revision === latest ? (path, line) => (openDraft = { path, line }) : undefined}>
          {#snippet below(path, line)}
            <div class="inline-thread">
              {#each reviewComments.filter(c => c.location?.path === path && c.location?.line === line) as c (c.id)}
                <CommentView rid={repo.rid} comment={c} caption="reviewed">
                  {#snippet actions()}
                    {#if !c.resolved && (mine || delegate)}
                      <Button
                        variant="naked"
                        styleHeight="1.5rem"
                        onclick={() => node.do({ type: "resolveComment", rid: repo.rid, comment: c.id, resolved: true })}>
                        <Icon name="checkmark" />Resolve
                      </Button>
                    {/if}
                  {/snippet}
                </CommentView>
              {/each}
              {#each drafts.filter(d => d.path === path && d.line === line) as d, i (i)}
                <div class="draft">
                  <span class="draft-label">Pending · part of your review</span>
                  <Markdown content={d.body} compact />
                </div>
              {/each}
              {#if openDraft?.path === path && openDraft?.line === line}
                <Composer
                  compact
                  autofocus
                  submitLabel="Add to review"
                  placeholder={`Comment on line ${line}`}
                  onCancel={() => (openDraft = undefined)}
                  onSubmit={body => {
                    drafts = [...drafts, { path, line, body }];
                    openDraft = undefined;
                  }} />
              {/if}
            </div>
          {/snippet}
        </DiffView>

        {#if drafting}
          <div class="review-bar">
            <div class="row" style="justify-content: space-between;">
              <span class="txt-body-m-semibold">
                Review of revision {revisionNumber} · {plural(drafts.length, "comment")}
              </span>
              <span class="caption txt-body-s-regular">Hover a line and press + to comment on it</span>
            </div>
            <textarea class="textarea" style="min-height: 3.5rem;" bind:value={summary} placeholder="Summary (optional)"></textarea>
            <div class="row" style="justify-content: space-between; flex-wrap: wrap;">
              <div class="verdicts">
                <label><input type="radio" bind:group={verdict} value="comment" /> Comment</label>
                <label><input type="radio" bind:group={verdict} value="accept" /> Accept</label>
                <label><input type="radio" bind:group={verdict} value="reject" /> Request changes</label>
              </div>
              <div class="row">
                <Button
                  variant="naked"
                  onclick={() => {
                    drafting = false;
                    drafts = [];
                    openDraft = undefined;
                  }}>
                  Discard
                </Button>
                <Button
                  variant="secondary"
                  disabled={verdict === "comment" && drafts.length === 0 && !summary.trim()}
                  onclick={submitReview}>
                  Publish review
                </Button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      {#if origin}
        <div class="origin">
          <Icon name="lightbulb" />
          Opened by a Ryph agent for
          <a class="link" href={`${base}/issues/${origin.thread.id}`}>{origin.thread.title}</a>
          · asked by {node.person(origin.requestedBy).alias} · run {origin.id}
        </div>
      {/if}
      <CommentView
        rid={repo.rid}
        reactable={false}
        caption="opened patch"
        comment={{
          id: patch.revisions[0].id,
          author: patch.author,
          body: patch.revisions[0].description,
          time: patch.time,
          reactions: [],
        }} />

      <Timeline>
        {#each timeline as item, i (i)}
          {#if item.kind === "run"}
            <RyphRunCard
              {repo}
              run={item.run.run}
              stepsDone={item.run.stepsDone}
              finished={item.run.finished}
              checks={item.run.checks} />
          {:else if item.kind === "revision"}
            <TimelineRow icon="revision" author={item.rev.author} time={item.time}>
              <span>created revision</span>
              <span class="rev-subject ellipsis">{subject(item.rev.description) || "No description"}</span>
              {#if item.rev === latest}<span class="latest-chip">Latest</span>{/if}
              {#snippet trailing()}
                <span class="sha">{shortId(item.rev.id)}</span>
                <button class="open-changes" title="Open revision changes" onclick={() => openRevision(item.index)}>
                  <Icon name="arrow-right" />
                </button>
              {/snippet}
            </TimelineRow>
          {:else if item.kind === "review"}
            <ReviewItem
              {repo}
              review={item.review}
              revision={item.rev}
              revisionNumber={item.index + 1}
              revisionCount={patch.revisions.length}
              onOpenChanges={() => openRevision(item.index)} />
          {:else if item.kind === "thread"}
            <Thread
              rid={repo.rid}
              root={item.root}
              replies={item.replies}
              {badgeFor}
              onReply={(body, replyTo) =>
                node.do({ type: "patchComment", rid: repo.rid, patch: patch.id, body, replyTo })} />
          {:else if item.kind === "event"}
            <EventRow kind="patch" event={item.event} />
          {:else}
            <TimelineRow
              icon="patch-merged"
              iconColor="var(--color-text-merged)"
              author={patch.mergedBy}
              time={item.time}>
              <span>merged revision {patch.revisions.length} into</span>
              <b>{repo.defaultBranch}</b>
            </TimelineRow>
          {/if}
        {/each}
      </Timeline>

      {#if patch.state === "open"}
        <div class="gate">
          <div class="meter">
            {#each Array(repo.threshold) as _, i (i)}<span class:on={i < accepts.length}></span>{/each}
          </div>
          <span>
            {#if rejects.length > 0}
              <strong>Changes requested</strong> on revision {patch.revisions.length}.
            {:else if accepts.length >= repo.threshold}
              <strong>Ready to merge.</strong> {accepts.length} of {repo.delegates.length} delegates accepted.
            {:else}
              <strong>{accepts.length} of {repo.threshold}</strong> delegate approvals needed to merge.
            {/if}
          </span>
          <span style="margin-left: auto;" class="caption txt-body-s-regular" title={fullDate(latest.time)}>
            Latest revision {timeAgo(latest.time)}
          </span>
        </div>
      {/if}

      <Composer
        compact
        placeholder={node.canSummon(repo) ? "Leave a comment, or type /ryph mender address the review" : "Leave a comment"}
        onSubmit={body => node.do({ type: "patchComment", rid: repo.rid, patch: patch.id, body })} />
    {/if}
  </div>
{/if}
