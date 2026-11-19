<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ProfileEdit } from "@bindings/actor/ProfileEdit";
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";

  import {
    ago,
    describeActorError,
    keyName,
    PROFILE_PATH,
  } from "@app/views/profile/actor";

  import { invoke } from "@app/lib/invoke";
  import { hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";

  interface Props {
    // The profile whose versions are listed, for its ID and its keys' names.
    actor: ActorInfo;
  }

  const { actor }: Props = $props();

  const PAGE = 20;
  // The profile's fields as the form labels them.
  const LABELS: Record<string, string> = {
    displayName: "display name",
    fullName: "full name",
    pronouns: "pronouns",
    bio: "bio",
    location: "location",
    timezone: "time zone",
    avatar: "avatar",
    banner: "banner",
    links: "links",
  };

  const edits = $state<ProfileEdit[]>([]);
  // How many versions the pages so far covered, which is more than `edits`
  // holds once a page has repeated some.
  let fetched = 0;
  let more = $state(false);
  let loading = $state(true);
  let error = $state<string>();

  async function load() {
    loading = true;
    error = undefined;

    try {
      const page = await invoke<PaginatedQuery<ProfileEdit[]>>(
        "actor_profile_history",
        { skip: fetched, take: PAGE },
      );
      // A profile that moved since the last page shifts the next one back
      // over versions already here.
      fetched += page.content.length;
      const held = new Set(edits.map(edit => edit.commit));
      edits.push(...page.content.filter(edit => !held.has(edit.commit)));
      more = page.more;
    } catch (e) {
      error = describeActorError(e, "Could not load the history.");
    } finally {
      loading = false;
    }
  }
  void load();

  function list(fields: string[]): string {
    const names = fields.map(field => LABELS[field] ?? field);
    if (names.length === 1) return names[0];

    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  // What a version did, told against the one it was saved over. A version
  // that changed no field shown here changed something else: another file,
  // or a part of the profile this version of Desktop does not read.
  function summary(edit: ProfileEdit): string {
    if (edit.parents.length === 0) return "Created the profile";

    const changed = edit.fields?.length ? list(edit.fields) : undefined;
    if (edit.parents.length > 1) {
      const joined = "Joined versions saved on different devices";

      return changed ? `${joined} and changed ${changed}` : joined;
    }

    return changed
      ? `Changed ${changed}`
      : "Changed in a way this version of Desktop cannot show";
  }
</script>

<style>
  .modal {
    width: 36rem;
    max-width: 92vw;
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
    padding: 0 1.25rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .source {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .path {
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
  }
  .entries {
    display: flex;
    flex-direction: column;
  }
  .entry {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1.25rem;
  }
  .entry + .entry {
    border-top: 1px solid var(--color-border-subtle);
  }
  .entry-icon {
    display: flex;
    flex-shrink: 0;
    padding-top: 0.125rem;
    color: var(--color-text-tertiary);
  }
  .entry-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .changed {
    color: var(--color-text-primary);
  }
  .byline {
    color: var(--color-text-tertiary);
  }
  .more {
    display: flex;
    justify-content: center;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .empty {
    padding: 2.5rem 1.25rem;
    text-align: center;
  }
  .error {
    color: var(--color-feedback-error-text);
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">Published history</span>
    <Button variant="naked" onclick={hide}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>

  <div class="source txt-body-m-regular">
    <Icon name="repository" />
    <CopyableId id={actor.rid} styleFont="var(--txt-body-m-regular)">
      {actor.rid}
    </CopyableId>
    <span class="path">{PROFILE_PATH}</span>
  </div>

  {#if edits.length > 0}
    <ScrollArea style="max-height: 24rem;">
      <div class="entries">
        {#each edits as edit (edit.commit)}
          <div class="entry">
            <span class="entry-icon"><Icon name="commit" /></span>
            <div class="entry-text">
              <span class="changed txt-body-m-regular">{summary(edit)}</span>
              <span class="byline txt-body-m-regular">
                {edit.author
                  ? keyName(actor, edit.author)
                  : "A device that left no name"} · {ago(edit.savedAt)} ·
                <span class="path">{edit.commit.slice(0, 7)}</span>
                {#if !edit.live}
                  · Not the profile yet
                {/if}
              </span>
            </div>
          </div>
        {/each}

        {#if more}
          <div class="more">
            <Button
              variant="outline"
              bordered
              disabled={loading}
              onclick={load}>
              Show more
            </Button>
          </div>
        {/if}
      </div>
    </ScrollArea>
  {:else if !loading && !error}
    <div class="empty">
      <span class="txt-missing txt-body-m-regular">Nothing published yet</span>
    </div>
  {/if}

  {#if error}
    <div class="empty">
      <span class="error txt-body-m-regular">{error}</span>
    </div>
  {/if}
</div>
