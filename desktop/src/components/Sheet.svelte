<script lang="ts">
  import type { Config } from "@bindings/config/Config";

  import { cubicIn, cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";

  import * as router from "@app/lib/router";
  import {
    closeSheet,
    refreshSheet,
    sheet,
    sheetChanges,
    sheetId,
  } from "@app/lib/sheet";
  import {
    issueStatusIcon,
    issueStatusLabel,
    patchStatusLabel,
  } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueDetail from "@app/components/IssueDetail.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";
  import PatchView from "@app/views/repo/Patch.svelte";

  interface Props {
    config: Config;
  }

  const { config }: Props = $props();

  // Popovers, menus and modals the sheet opens portal out of it, so they
  // count as inside.
  const OVERLAYS = '.popover, [role="menu"], [data-modal-content]';

  function openPage() {
    if (!$sheet) return;
    if ($sheet.kind === "issue") {
      void router.push({
        resource: "repo.issue",
        rid: $sheet.repo.rid,
        issue: $sheet.issue.id,
        status: "all",
      });
    } else {
      void router.push({
        resource: "repo.patch",
        rid: $sheet.repo.rid,
        patch: $sheet.patch.id,
        status: undefined,
        reviewId: undefined,
      });
    }
  }

  function changed() {
    sheetChanges.update(n => n + 1);
    void refreshSheet();
  }

  function openList() {
    if (!$sheet) return;
    if ($sheet.kind === "issue") {
      void router.push({
        resource: "repo.issues",
        rid: $sheet.repo.rid,
        status: $sheet.issue.state.status,
      });
    } else {
      void router.push({
        resource: "repo.patches",
        rid: $sheet.repo.rid,
        status: $sheet.patch.state.status,
      });
    }
  }

  // A click on something that opens a sheet swaps it instead of closing it
  // first.
  function onPointerDown(event: PointerEvent) {
    if (!$sheet || !(event.target instanceof Element)) return;
    if (document.querySelector("[data-modal-content]")) return;
    if (event.target.closest(`.sheet, [data-sheet-trigger], ${OVERLAYS}`)) {
      return;
    }
    closeSheet();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && $sheet && !document.querySelector(OVERLAYS)) {
      closeSheet();
    }
  }
</script>

<style>
  .sheet {
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
  .sheet.patch {
    width: min(56rem, 64vw);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 2.75rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    margin-right: auto;
  }
  .breadcrumb-link {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .breadcrumb-link:hover {
    color: var(--color-text-primary);
  }
  .breadcrumb-title {
    color: var(--color-text-primary);
    font: var(--txt-body-m-medium);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    padding: 0 2rem 2rem;
    min-width: 0;
  }
  .patch-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
</style>

<svelte:window onpointerdowncapture={onPointerDown} onkeydown={onKeydown} />

{#if $sheet}
  {@const data = $sheet}
  {@const id = sheetId(data)}
  <div
    class="sheet"
    class:patch={data.kind === "patch"}
    role="dialog"
    aria-label={data.kind === "issue" ? "Issue" : "Patch"}
    in:fly={{ x: "100%", opacity: 1, duration: 260, easing: cubicOut }}
    out:fly={{ x: "100%", opacity: 1, duration: 200, easing: cubicIn }}>
    <div class="header">
      <div class="breadcrumb">
        {#if data.kind === "issue"}
          <Icon name={issueStatusIcon[data.issue.state.status]} />
          <button class="breadcrumb-link" onclick={openList}>
            {issueStatusLabel[data.issue.state.status]}
          </button>
          <Icon name="chevron-right" />
          <span class="breadcrumb-title">{data.issue.title}</span>
        {:else}
          <Icon
            name={data.patch.state.status === "open"
              ? "patch"
              : `patch-${data.patch.state.status}`} />
          <button class="breadcrumb-link" onclick={openList}>
            {patchStatusLabel[data.patch.state.status]}
          </button>
          <Icon name="chevron-right" />
          <span class="breadcrumb-title">{data.patch.title}</span>
        {/if}
      </div>
      <ShareButton
        target={{
          type: "cob",
          kind: data.kind,
          rid: data.repo.rid,
          oid: id,
        }}
        {id}
        idLabel={data.kind}
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
        onclick={closeSheet}>
        <Icon name="close" />
      </Button>
    </div>
    {#key `${data.kind}/${data.repo.rid}/${id}`}
      {#if data.kind === "issue"}
        <ScrollArea style="flex: 1; min-height: 0;">
          <div class="body">
            <IssueDetail
              repo={data.repo}
              issue={data.issue}
              activity={data.activity}
              threads={data.threads}
              {config}
              onChange={changed} />
          </div>
        </ScrollArea>
      {:else}
        <div class="patch-body">
          <PatchView
            repo={data.repo}
            patch={data.patch}
            revisions={data.revisions}
            activity={data.activity}
            {config}
            status={undefined}
            inSheet
            onChange={changed} />
        </div>
      {/if}
    {/key}
  </div>
{/if}
