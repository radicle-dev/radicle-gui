<script lang="ts">
  import type { Revision } from "@bindings/identity/Revision";

  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import { hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import PierreFile from "@app/components/PierreFile.svelte";
  import PierreSnippet from "@app/components/PierreSnippet.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";

  interface Props {
    raw: string;
    // When set, its ID is shown and its diff is offered.
    revision?: Revision;
  }

  const { raw, revision }: Props = $props();

  let view = $state<"document" | "changes">("document");
  const diff = $derived(view === "changes" ? revision?.diff : undefined);

  let copyIcon: "copy" | "checkmark" = $state("copy");
  const restoreIcon = debounce(() => (copyIcon = "copy"), 1000);

  async function copy() {
    await writeToClipboard(diff ?? raw);
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
</style>

<div class="modal">
  <div class="header">
    <span class="title">Identity document</span>
    {#if revision}
      <Id id={revision.id} clipboard={revision.id} label="revision ID" />
    {/if}
    <div class="actions">
      {#if revision}
        <SegmentedSwitch
          options={[
            { value: "document", label: "Document" },
            { value: "changes", label: "Changes" },
          ]}
          value={view}
          onchange={value => (view = value)} />
      {/if}
      <Button variant="outline" styleHeight="2rem" onclick={copy}>
        <Icon name={copyIcon} />
        {diff !== undefined ? "Copy diff" : "Copy JSON"}
      </Button>
      <Button variant="naked" onclick={hide}>
        <span style:color="var(--color-text-tertiary)">
          <Icon name="close" />
        </span>
      </Button>
    </div>
  </div>
  <ScrollArea style="flex: 1; min-height: 0;">
    <div class="code">
      {#if revision && diff !== undefined}
        <PierreSnippet
          patch={diff}
          path="radicle.json"
          cacheKey={`identity-diff:${revision.id}`} />
      {:else}
        <PierreFile
          contents={raw}
          path="radicle.json"
          cacheKey={`identity-doc:${revision?.blob ?? raw}`} />
      {/if}
    </div>
  </ScrollArea>
</div>
