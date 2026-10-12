<script lang="ts">
  import type { GitInfo } from "@bindings/config/GitInfo";
  import type { ComponentProps } from "svelte";

  import type { DiffOptions } from "@app/lib/diffOptions.svelte";
  import { diffOptions } from "@app/lib/diffOptions.svelte";
  import { hints } from "@app/lib/hints";
  import { invoke } from "@app/lib/invoke";
  import { updateChecker } from "@app/lib/updateChecker.svelte";
  import { pluralize } from "@app/lib/utils";

  import AnnounceSwitch from "@app/components/AnnounceSwitch.svelte";
  import BadgeCounterSwitch from "@app/components/BadgeCounterSwitch.svelte";
  import Button from "@app/components/Button.svelte";
  import CodeFontSwitch from "@app/components/CodeFontSwitch.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import FontSizeSwitch from "@app/components/FontSizeSwitch.svelte";
  import Icon from "@app/components/Icon.svelte";
  import RepoListSwitch from "@app/components/RepoListSwitch.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";
  import ThemeSwitch from "@app/components/ThemeSwitch.svelte";
  import UpdateSwitch from "@app/components/UpdateSwitch.svelte";

  // How a diff is drawn, wherever one is drawn: the commit view, a patch's
  // changes and a review all read the same preferences.
  type Option<T> = {
    value: T;
    label?: string;
    icon?: ComponentProps<typeof Icon>["name"];
    title?: string;
  };

  // Shown so that a user seeing the slower fallback can tell which git, if
  // any, was picked.
  const gitInfo = invoke<GitInfo>("git_info");

  const diffStyleOptions: Option<DiffOptions["diffStyle"]>[] = [
    { value: "unified", icon: "diff-unified", title: "Unified" },
    { value: "split", icon: "diff-split", title: "Split" },
  ];
  const indicatorOptions: Option<DiffOptions["indicators"]>[] = [
    { value: "classic", icon: "diff-classic", title: "Classic (+/−)" },
    { value: "bars", icon: "diff-bars", title: "Bars" },
    { value: "none", icon: "eye-slash", title: "None" },
  ];
  const wordDiffOptions: Option<DiffOptions["lineDiffType"]>[] = [
    {
      value: "word-alt",
      label: "Word+",
      title: "Highlight entire words with enhanced algorithm",
    },
    {
      value: "word",
      label: "Word",
      title: "Highlight changed words within lines",
    },
    { value: "char", label: "Char", title: "Highlight character changes" },
    { value: "none", label: "None", title: "Show line-level changes only" },
  ];
  const wordWrapOptions: Option<"on" | "off">[] = [
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
  ];
</script>

<style>
  .modal {
    width: 40rem;
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
    padding: 0 1.5rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .rows {
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    gap: 1.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .row-label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }
  .row-title {
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
  }
  .row-description {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .section {
    border-top: 1px solid var(--color-border-subtle);
  }
  .git {
    overflow-wrap: anywhere;
  }
  .footer {
    padding: 4rem 1.5rem 1.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">Settings</span>
  </div>
  <div class="rows">
    <div class="row">
      <div class="row-label">
        <span class="row-title">Appearance</span>
        <span class="row-description">Light, dark, or follow your system</span>
      </div>
      <ThemeSwitch />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Font size</span>
        <span class="row-description">
          Make the interface text larger or smaller
        </span>
      </div>
      <FontSizeSwitch />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Repository list</span>
        <span class="row-description">
          List only the repositories you seed, or everything in local storage
        </span>
      </div>
      <RepoListSwitch />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Notification badge</span>
        <span class="row-description">Show unread count on the dock icon</span>
      </div>
      <BadgeCounterSwitch />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Announce changes</span>
        <span class="row-description">
          Broadcast your activity to the network right away or periodically
        </span>
      </div>
      <AnnounceSwitch />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Notify on new versions</span>
        <span class="row-description">
          Check for new versions in the background
        </span>
      </div>
      <UpdateSwitch
        active={updateChecker.isEnabled}
        disable={updateChecker.disable}
        enable={updateChecker.enable} />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Hidden hints</span>
        <span class="row-description">
          {hints.dismissedCount === 0
            ? "You haven't hidden any hints"
            : `Show the ${hints.dismissedCount} ${pluralize("hint", hints.dismissedCount)} you've hidden again`}
        </span>
      </div>
      <Button
        variant="ghost"
        disabled={hints.dismissedCount === 0}
        onclick={() => hints.resetAll()}>
        Reset
      </Button>
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Git binary</span>
        {#await gitInfo}
          <span class="row-description">Looking for git…</span>
        {:then info}
          <span class="row-description git txt-selectable">
            {info?.path
              ? `${info.version ?? "git"} at ${info.path}`
              : "None found, using a slower built-in fallback"}
          </span>
        {:catch}
          <span class="row-description">
            Could not tell which git is in use
          </span>
        {/await}
      </div>
    </div>
  </div>
  <!-- How every diff in the app is drawn — the commit view, a patch's changes
       and a review all read these. Kept apart from the rest because they are
       about one kind of screen rather than about the app. -->
  <div class="rows section">
    <div class="row">
      <div class="row-label">
        <span class="row-title">Code font</span>
        <span class="row-description">Use a monospace font in code views</span>
      </div>
      <CodeFontSwitch />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Diff style</span>
        <span class="row-description">
          Show changes in one column or side by side
        </span>
      </div>
      <SegmentedSwitch
        options={diffStyleOptions}
        value={diffOptions.diffStyle}
        onchange={value => (diffOptions.diffStyle = value)} />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Word wrap</span>
        <span class="row-description">
          Wrap long lines in a diff instead of scrolling sideways
        </span>
      </div>
      <SegmentedSwitch
        options={wordWrapOptions}
        value={diffOptions.wordWrap ? "on" : "off"}
        onchange={value => (diffOptions.wordWrap = value === "on")} />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Change indicators</span>
        <span class="row-description">
          How added and removed lines are marked
        </span>
      </div>
      <SegmentedSwitch
        options={indicatorOptions}
        value={diffOptions.indicators}
        onchange={value => (diffOptions.indicators = value)} />
    </div>
    <div class="row">
      <div class="row-label">
        <span class="row-title">Word diff</span>
        <span class="row-description">
          Highlight what changed within a line
        </span>
      </div>
      <SegmentedSwitch
        options={wordDiffOptions}
        value={diffOptions.lineDiffType}
        onchange={value => (diffOptions.lineDiffType = value)} />
    </div>
  </div>
  <div class="footer">
    {#if updateChecker.currentVersion}
      <span class="txt-selectable">
        Version {updateChecker.currentVersion}
      </span>
      {#if updateChecker.newVersion}
        · <ExternalLink href="https://radicle.dev/desktop">
          Update to {updateChecker.newVersion}
        </ExternalLink>
      {:else if updateChecker.upToDate}
        · Up to date
      {/if}
    {/if}
  </div>
</div>
