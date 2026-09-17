<script lang="ts">
  import { hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";

  import { ACTOR_RID, ago, PROFILE_PATH, profileHistory } from "./store.svelte";

  function summarise(fields: string[]): string {
    if (fields.length === 1) return fields[0];
    return `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}`;
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
    max-height: 24rem;
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
  .empty {
    padding: 2.5rem 1.25rem;
    text-align: center;
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
    <CopyableId id={ACTOR_RID} styleFont="var(--txt-body-m-regular)">
      {ACTOR_RID}
    </CopyableId>
    <span class="path">{PROFILE_PATH}</span>
  </div>

  {#if profileHistory.length > 0}
    <ScrollArea style="max-height: 24rem;">
      <div class="entries">
        {#each profileHistory as entry (entry.id)}
          <div class="entry">
            <span class="entry-icon"><Icon name="commit" /></span>
            <div class="entry-text">
              <span class="changed txt-body-m-regular">
                {#if entry.fields.length === 0}
                  Created the profile
                {:else}
                  Changed {summarise(entry.fields)}
                {/if}
              </span>
              <span class="byline txt-body-m-regular">
                {entry.by} · {ago(entry.at)} ·
                <span class="path">{entry.oid.slice(0, 7)}</span>
              </span>
            </div>
          </div>
        {/each}
      </div>
    </ScrollArea>
  {:else}
    <div class="empty">
      <span class="txt-missing txt-body-m-regular">Nothing published yet</span>
    </div>
  {/if}
</div>
