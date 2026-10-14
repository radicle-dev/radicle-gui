<script lang="ts">
  import type { Config } from "@bindings/config/Config";

  import { cubicIn, cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";

  import {
    closeIssueSheet,
    issueSheet,
    issueSheetChanges,
  } from "@app/lib/issueSheet";
  import * as router from "@app/lib/router";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueDetail from "@app/components/IssueDetail.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";

  interface Props {
    config: Config;
  }

  const { config }: Props = $props();

  // Popovers, menus and modals the sheet opens portal out of it, so they
  // count as inside.
  const OVERLAYS = '.popover, [role="menu"], [data-modal-content]';

  function openPage() {
    if (!$issueSheet) return;
    void router.push({
      resource: "repo.issue",
      rid: $issueSheet.repo.rid,
      issue: $issueSheet.issue.id,
      status: "all",
    });
  }

  // A click on something that opens an issue swaps the sheet instead of
  // closing it first.
  function onPointerDown(event: PointerEvent) {
    if (!$issueSheet || !(event.target instanceof Element)) return;
    if (document.querySelector("[data-modal-content]")) return;
    if (
      event.target.closest(
        `.issue-sheet, [data-issue-sheet-trigger], ${OVERLAYS}`,
      )
    ) {
      return;
    }
    closeIssueSheet();
  }

  function onKeydown(event: KeyboardEvent) {
    if (
      event.key === "Escape" &&
      $issueSheet &&
      !document.querySelector(OVERLAYS)
    ) {
      closeIssueSheet();
    }
  }
</script>

<style>
  .issue-sheet {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    width: min(48rem, 60vw);
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-canvas);
    border-left: 1px solid var(--color-border-subtle);
    box-shadow: var(--elevation-low);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 2.75rem;
    padding: 0 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }
  .id {
    font: var(--txt-code-regular);
    color: var(--color-text-secondary);
    margin-right: auto;
    padding-left: 0.25rem;
  }
  .body {
    padding: 0 2rem 2rem;
    min-width: 0;
  }
</style>

<svelte:window onpointerdowncapture={onPointerDown} onkeydown={onKeydown} />

{#if $issueSheet}
  {@const { repo, issue, activity, threads } = $issueSheet}
  <div
    class="issue-sheet"
    role="dialog"
    aria-label="Issue"
    in:fly={{ x: "100%", opacity: 1, duration: 260, easing: cubicOut }}
    out:fly={{ x: "100%", opacity: 1, duration: 200, easing: cubicIn }}>
    <div class="header">
      <span class="id">{issue.id.slice(0, 7)}</span>
      <ShareButton
        target={{ type: "cob", kind: "issue", rid: repo.rid, oid: issue.id }}
        id={issue.id}
        idLabel="issue"
        variant="naked"
        {config} />
      <Button
        styleHeight="2rem"
        variant="naked"
        title="Open full page"
        onclick={openPage}>
        <Icon name="expand-out" />
      </Button>
      <Button
        styleHeight="2rem"
        variant="naked"
        title="Close"
        onclick={closeIssueSheet}>
        <Icon name="close" />
      </Button>
    </div>
    <ScrollArea style="flex: 1; min-height: 0;">
      {#key `${repo.rid}/${issue.id}`}
        <div class="body">
          <IssueDetail
            {repo}
            {issue}
            {activity}
            {threads}
            {config}
            onChange={() => issueSheetChanges.update(n => n + 1)} />
        </div>
      {/key}
    </ScrollArea>
  </div>
{/if}
