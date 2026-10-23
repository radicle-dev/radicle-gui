<script lang="ts">
  import type { CobEvent, Comment, IssueState, PersonId, Repo } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { copy } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import AssigneesChip from "@app/components/AssigneesChip.svelte";
  import Button from "@app/components/Button.svelte";
  import CobStateButton from "@app/components/CobStateButton.svelte";
  import CommentView from "@app/components/CommentView.svelte";
  import Composer from "@app/components/Composer.svelte";
  import EditableTitle from "@app/components/EditableTitle.svelte";
  import Empty from "@app/components/Empty.svelte";
  import EventRow from "@app/components/EventRow.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IdChip from "@app/components/IdChip.svelte";
  import LabelsChip from "@app/components/LabelsChip.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";
  import RyphRunCard from "@app/components/RyphRunCard.svelte";
  import SummonButton from "@app/components/SummonButton.svelte";
  import SheetControls from "@app/components/SheetControls.svelte";
  import { useSheet } from "@app/lib/sheet";
  import Thread from "@app/components/Thread.svelte";
  import Timeline from "@app/components/Timeline.svelte";

  interface Props {
    repo: Repo;
    id: string;
  }

  const { repo, id }: Props = $props();
  const sheet = useSheet();

  const issue = $derived(repo.issues.find(i => i.id === id));
  const base = $derived(node.repoPath(repo));
  const delegate = $derived(node.isDelegate(repo));
  const canEdit = $derived(delegate || issue?.author === "self");
  const knownLabels = $derived([...new Set(repo.issues.flatMap(i => i.labels))]);

  const runs = $derived(issue ? node.ryphRunsFor(repo.rid, "issue", issue.id) : []);
  const busy = $derived(runs.some(r => !r.finished));

  type Item =
    | { kind: "thread"; time: number; root: Comment; replies: Comment[] }
    | { kind: "event"; time: number; event: CobEvent }
    | { kind: "run"; time: number; run: (typeof runs)[number] };

  const items = $derived.by((): Item[] => {
    if (!issue) return [];
    const comments = issue.comments;
    const rootOf = (c: Comment): Comment => {
      let cur = c;
      while (cur.replyTo) {
        const parent = comments.find(p => p.id === cur.replyTo);
        if (!parent) break;
        cur = parent;
      }
      return cur;
    };
    const roots = comments.filter(c => rootOf(c) === c);
    return [
      ...roots.map(root => ({
        kind: "thread" as const,
        time: root.time,
        root,
        replies: comments.filter(c => c !== root && rootOf(c) === root),
      })),
      ...issue.events.map(event => ({ kind: "event" as const, time: event.time, event })),
      ...runs.map(run => ({ kind: "run" as const, time: run.run.startedAt + 1, run })),
    ].sort((a, b) => a.time - b.time);
  });

  function badgeFor(c: Comment) {
    if (c.author === issue?.author) return "Author";
    if (repo.delegates.includes(c.author)) return "Delegate";
    return undefined;
  }

  function edit(change: { title?: string; labels?: string[]; assignees?: PersonId[] }) {
    if (!issue) return;
    node.do({ type: "editCob", rid: repo.rid, kind: "issue", id: issue.id, ...change });
  }
</script>

<style>
  .main {
    max-width: 56rem;
    margin: 0 auto;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }
  .description {
    margin-bottom: 0;
  }
  @media (max-width: 700px) {
    .title-row {
      flex-wrap: wrap;
    }
    .title-row :global(.title) {
      order: -1;
      flex-basis: 100%;
    }
    .actions {
      display: contents;
    }
  }
</style>

{#if !issue}
  <Empty icon="issue" title="Issue not found">This issue isn't on your node yet.</Empty>
{:else}
  <div class="main">
    <div class="title-row">
      <CobStateButton
        kind="issue"
        state={issue.state}
        options={canEdit ? ["open", "solved", "closed"] : []}
        onSelect={state =>
          node.do({ type: "issueState", rid: repo.rid, issue: issue.id, state: state as IssueState })} />
      <EditableTitle title={issue.title} editable={canEdit} onSave={title => edit({ title })} />
      <div class="actions">
        <SummonButton
          {repo}
          kind="issue"
          {busy}
          onSummon={body => node.do({ type: "issueComment", rid: repo.rid, issue: issue.id, body })} />
        {#if sheet}
          <SheetControls sheet={sheet()} />
        {:else}
          <Button variant="naked" title="Copy link" onclick={() => copy(location.href, "link")}>
            <Icon name="link" />
          </Button>
          <Button variant="naked" onclick={() => navigate(`${base}/issues/new`)}>
            <Icon name="plus" />New issue
          </Button>
        {/if}
      </div>
    </div>

    <div class="meta">
      <PersonLink person={issue.author} size="1rem" chip />
      <IdChip id={issue.id} label="issue ID" />
      <LabelsChip
        labels={issue.labels}
        known={knownLabels}
        editable={delegate}
        onSave={labels => edit({ labels })} />
      <AssigneesChip
        assignees={issue.assignees}
        candidates={[...repo.delegates, ...new Set(issue.comments.map(c => c.author))]}
        editable={delegate}
        onSave={assignees => edit({ assignees: assignees as PersonId[] })} />
    </div>

    <div class="description">
      <CommentView
        rid={repo.rid}
        reactable={false}
        caption="opened this issue"
        comment={{
          id: issue.id,
          author: issue.author,
          body: issue.body,
          time: issue.time,
          reactions: [],
        }} />
    </div>

    <Timeline>
      {#each items as item, i (i)}
        {#if item.kind === "thread"}
          <Thread
            rid={repo.rid}
            root={item.root}
            replies={item.replies}
            {badgeFor}
            onReply={(body, replyTo) =>
              node.do({ type: "issueComment", rid: repo.rid, issue: issue.id, body, replyTo })} />
        {:else if item.kind === "run"}
          <RyphRunCard
            {repo}
            run={item.run.run}
            stepsDone={item.run.stepsDone}
            finished={item.run.finished}
            checks={item.run.checks} />
        {:else}
          <EventRow kind="issue" event={item.event} />
        {/if}
      {/each}
    </Timeline>

    <Composer
      compact
      placeholder={node.canSummon(repo) ? "Leave a comment, or type /ryph mender fix this" : "Leave a comment"}
      onSubmit={body => node.do({ type: "issueComment", rid: repo.rid, issue: issue.id, body })} />
  </div>
{/if}
