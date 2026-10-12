<script lang="ts" module>
  import type { ActivityItem } from "@app/lib/cobActivity";

  export type { ActivityItem };
</script>

<script lang="ts" generics="A">
  import type { Author } from "@bindings/cob/Author";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type { Config } from "@bindings/config/Config";
  import type { Snippet } from "svelte";

  import partial from "lodash/partial";

  import * as roles from "@app/lib/roles";
  import { mergeTimeline, timelineRuns } from "@app/lib/timelineRuns";
  import { authorForNodeId } from "@app/lib/utils";

  import ExtendedTextarea from "@app/components/ExtendedTextarea.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import ThreadComponent from "@app/components/Thread.svelte";

  interface Props {
    cobId: string;
    commentThreads: Thread[];
    config: Config;
    repoDelegates: Author[];
    createComment: (
      body: string,
      embeds: Embed[],
      replyTo?: string,
    ) => Promise<void>;
    editComment: (
      commentId: string,
      body: string,
      embeds: Embed[],
    ) => Promise<void>;
    reactOnComment: (
      commentId: string,
      authors: Author[],
      reaction: string,
    ) => Promise<void>;
    // Optional: a discussion whose host has no way to redact a comment simply
    // does not offer the action.
    deleteComment?: (commentId: string) => Promise<void>;
    rid: string;
    activityItems?: ActivityItem<A>[];
    /// Drops the outer margin, for a host that owns the spacing between its own
    /// blocks. The default keeps the spacing the timeline pages rely on.
    flush?: boolean;
    renderActivity?: Snippet<[A, { hideAuthor: boolean }]>;
    authorOf?: (data: A) => Author | undefined;
    afterActivity?: Snippet;
  }

  /* eslint-disable prefer-const */
  let {
    cobId,
    commentThreads,
    config,
    repoDelegates,
    createComment,
    editComment,
    reactOnComment,
    deleteComment,
    rid,
    activityItems,
    flush = false,
    renderActivity,
    authorOf,
    afterActivity,
  }: Props = $props();
  /* eslint-enable prefer-const */

  // svelte-ignore state_referenced_locally
  let previousCobId = cobId;
  let focusReply: boolean = $state(false);
  let commentFormKey = $state(0);

  const runs = $derived(
    timelineRuns(mergeTimeline(commentThreads, activityItems ?? []), authorOf),
  );

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    cobId;

    if (cobId !== previousCobId) {
      previousCobId = cobId;
      focusReply = false;
      commentFormKey += 1;
    }
  });
</script>

<style>
  .discussion {
    margin: 1.5rem 0 2.5rem;
  }
  .discussion.flush {
    margin: 0;
  }
  .timeline-rail {
    position: relative;
  }
  .activity-stream {
    position: relative;
  }
  .activity-stream.has-runs::before {
    content: "";
    position: absolute;
    top: 0.5rem;
    bottom: -1rem;
    left: 1rem;
    width: 1px;
    background-color: var(--color-border-subtle);
    pointer-events: none;
    z-index: -1;
  }
  .timeline-rail :global(.icon) {
    background-color: var(--color-surface-canvas);
  }
  .timeline-rail :global(.timeline-item.toggleable:hover .icon),
  .timeline-rail :global(.timeline-item.toggleable:focus-visible .icon),
  .timeline-rail :global(.older-revisions:hover .icon),
  .timeline-rail :global(.older-revisions:focus-visible .icon) {
    background-color: var(--color-surface-subtle);
  }
  .timeline-rail :global(.verdict-accept .icon),
  .timeline-rail :global(.verdict-reject .icon),
  .timeline-rail :global(.verdict-comment .icon),
  .timeline-rail :global(.merge-badge .icon) {
    background-color: transparent;
  }
  .timeline-rail :global(.replies-wrapper) {
    margin-left: 1.5rem;
  }
  .timeline-rail :global(.replies-wrapper)::before {
    display: none;
  }
  .connector {
    height: 0.5rem;
  }
  /* Grouped actions are bare rows whose own min-height already spaces them;
     the connector on top of that leaves more air between them than between
     the header and the first row. The last one is kept: it separates the
     group from whatever follows. */
  .run-children > .connector:not(:last-child) {
    height: 0;
  }
  .run-header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 1.5rem 0.5rem 0.5rem;
    color: var(--color-text-tertiary);
    min-height: 2.5rem;
  }
  /* The first group's top padding is redundant with the space the timeline
     container already leaves below the tabs, so drop it to tighten the gap
     between the patch nav and the first author. */
  .activity-stream > .run-header:first-child {
    padding-top: 0;
  }
  /* A first child with its own top margin (e.g. a revision card) would push
     that margin out above the group, leaving the rail to span a wider gap than
     the rest of the group's spacing. */
  .run-children > :global(:first-child) {
    margin-top: 0;
  }
  .reply-wrapper {
    margin-top: 1rem;
  }
  /* Nothing above it to connect to, so the host's own spacing is the whole gap. */
  .activity-stream:not(.has-runs) + .reply-wrapper {
    margin-top: 0;
  }
</style>

<div class="discussion" class:flush>
  <div class="timeline-rail">
    <div class="activity-stream" class:has-runs={runs.length > 0}>
      {#each runs as run, runIndex (runIndex)}
        {#if run.kind === "thread"}
          <ThreadComponent
            thread={run.entry.thread}
            {rid}
            currentUserNid={config.publicKey}
            canModifyComment={partial(
              roles.isDelegateOrAuthor,
              config.publicKey,
              repoDelegates.map(delegate => delegate.did),
            )}
            {editComment}
            {deleteComment}
            createReply={createComment}
            {reactOnComment} />
          <div class="connector"></div>
        {:else if run.kind === "single" && renderActivity}
          {@render renderActivity(run.entry.data, {
            hideAuthor: run.repeatsAuthor,
          })}
          <div class="connector"></div>
        {:else if run.kind === "group" && renderActivity}
          {#if !run.repeatsAuthor}
            <div class="run-header">
              <NodeId
                {...authorForNodeId(run.author)}
                styleFont="var(--txt-body-m-medium)" />
            </div>
          {/if}
          <div class="run-children">
            {#each run.entries as entry (entry.key)}
              {@render renderActivity(entry.data, { hideAuthor: true })}
              <div class="connector"></div>
            {/each}
          </div>
        {/if}
      {/each}

      {@render afterActivity?.()}
    </div>

    <div id={`reply-${cobId}`} class="reply-wrapper">
      {#key commentFormKey}
        <ExtendedTextarea
          disallowEmptyBody
          {rid}
          focus={focusReply}
          borderVariant="ghost"
          stylePadding="0.5rem 0.75rem"
          hideDiscard
          collapseActions
          placeholder="Leave a comment"
          submitActiveVariant="secondary"
          close={() => {
            focusReply = false;
            commentFormKey += 1;
          }}
          submit={async ({ comment, embeds }) => {
            try {
              await createComment(comment, Array.from(embeds.values()));
            } finally {
              focusReply = false;
              commentFormKey += 1;
            }
          }} />
      {/key}
    </div>
  </div>
</div>
