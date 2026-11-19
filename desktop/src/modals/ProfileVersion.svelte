<script lang="ts">
  import type { ActorProfile } from "@bindings/actor/ActorProfile";

  import { PROFILE_PATH } from "@app/views/profile/actor";
  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import { hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import PierreFile from "@app/components/PierreFile.svelte";
  import PierreSnippet from "@app/components/PierreSnippet.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";

  interface Props {
    // Whose version this is, as the keys list names it.
    name: string;
    // The commit of the version.
    head: string;
    // Unset when the version holds no profile this Desktop can read.
    profile?: ActorProfile;
    // What the version changed since it split from the one shown here, as a
    // unified diff. Unset when that cannot be told.
    changes?: string;
  }

  const { name, head, profile, changes }: Props = $props();

  let chosen = $state<"document" | "changes">("changes");
  const view = $derived(changes === undefined ? "document" : chosen);
  const raw = $derived(profile ? JSON.stringify(profile, null, 2) : undefined);
  const copied = $derived(view === "changes" ? changes : raw);

  let copyIcon: "copy" | "checkmark" = $state("copy");
  const restoreIcon = debounce(() => (copyIcon = "copy"), 1000);

  async function copy() {
    if (copied === undefined) return;

    await writeToClipboard(copied);
    copyIcon = "checkmark";
    restoreIcon();
  }
</script>

<style>
  .modal {
    width: min(46rem, 92vw);
    height: min(38rem, 85vh);
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
    gap: 0.75rem;
    padding: 0 0.75rem 0 1.5rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
  }
  .code {
    padding: 0.75rem 0;
  }
  .note {
    padding: 0 1.5rem;
    color: var(--color-text-secondary);
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">Profile on {name}</span>
    <div class="actions">
      {#if raw !== undefined && changes !== undefined}
        <SegmentedSwitch
          options={[
            { value: "document", label: "Document" },
            { value: "changes", label: "Changes" },
          ]}
          value={view}
          onchange={value => (chosen = value)} />
      {/if}
      {#if copied !== undefined}
        <Button variant="outline" styleHeight="2rem" onclick={copy}>
          <Icon name={copyIcon} />
          {view === "changes" ? "Copy diff" : "Copy JSON"}
        </Button>
      {/if}
      <Button variant="naked" onclick={hide}>
        <span style:color="var(--color-text-tertiary)">
          <Icon name="close" />
        </span>
      </Button>
    </div>
  </div>
  <ScrollArea style="flex: 1; min-height: 0;">
    <div class="code">
      {#if raw === undefined}
        <span class="note txt-body-m-regular">
          That version holds no profile this Desktop can read.
        </span>
      {:else if view === "document" || changes === undefined}
        <PierreFile
          contents={raw}
          path={PROFILE_PATH}
          cacheKey={`profile-version:${head}`} />
      {:else if changes.trim() === ""}
        <span class="note txt-body-m-regular">
          The profile was not changed there.
        </span>
      {:else}
        <PierreSnippet
          patch={changes}
          path={PROFILE_PATH}
          cacheKey={`profile-split:${head}:${changes.length}`} />
      {/if}
    </div>
  </ScrollArea>
</div>
