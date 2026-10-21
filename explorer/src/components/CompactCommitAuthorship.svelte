<script lang="ts">
  import type { CommitHeader } from "@http-client";

  import * as utils from "@app/lib/utils";
  import HoverPopover from "./HoverPopover.svelte";

  export let commit: CommitHeader;
</script>

<style>
  .authorship {
    display: flex;
    font: var(--txt-body-m-regular);
    column-gap: 0.5rem;
    align-items: center;
    white-space: nowrap;
  }
  .person {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    white-space: nowrap;
    gap: 0.5rem;
  }
  .label {
    color: var(--color-text-tertiary);
  }
  .avatar {
    width: 1rem;
    height: 1rem;
    border-radius: var(--border-radius-full);
  }
</style>

<div class="authorship">
  <HoverPopover
    stylePopoverPositionLeft="-8rem"
    stylePopoverPositionBottom="1.5rem">
    <div slot="toggle" style="display: flex;">
      {#if commit.author.email === commit.committer.email}
        <div class="person">
          <img
            class="avatar"
            alt="avatar"
            src={utils.gravatarURL(commit.committer.email)} />
        </div>
      {:else}
        <div class="person">
          <img
            class="avatar"
            alt="avatar"
            src={utils.gravatarURL(commit.author.email)} />
        </div>
        <div class="person">
          <img
            class="avatar"
            alt="avatar"
            src={utils.gravatarURL(commit.committer.email)} />
        </div>
      {/if}
    </div>

    <div slot="popover" class="popover">
      {#if commit.author.email === commit.committer.email}
        <div class="person">
          <div class="label">Author</div>
          <img
            class="avatar"
            alt="avatar"
            src={utils.gravatarURL(commit.committer.email)} />
          {commit.author.name}
        </div>
      {:else}
        <div class="person">
          <div class="label">Author</div>
          <img
            class="avatar"
            alt="avatar"
            src={utils.gravatarURL(commit.author.email)} />
          {commit.author.name}
        </div>
        <div class="person">
          <div class="label">Committer</div>
          <img
            class="avatar"
            alt="avatar"
            src={utils.gravatarURL(commit.committer.email)} />
          {commit.committer.name}
        </div>
      {/if}
    </div>
  </HoverPopover>
  <slot />
  <div title={utils.absoluteTimestamp(commit.committer.time)}>
    {utils.formatTimestamp(commit.committer.time)}
  </div>
</div>
