<script lang="ts">
  import type { CommitHeader } from "@http-client";

  import {
    absoluteTimestamp,
    formatTimestamp,
    gravatarURL,
  } from "@app/lib/utils";

  export let header: CommitHeader;
</script>

<style>
  .authorship {
    display: flex;
    font: var(--txt-body-m-regular);
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .person {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    white-space: nowrap;
    gap: 0.5rem;
  }
  .avatar {
    width: 1rem;
    height: 1rem;
  }
</style>

<span class="authorship">
  {#if header.author.email === header.committer.email}
    <div class="person">
      <img
        class="avatar"
        alt="avatar"
        src={gravatarURL(header.committer.email)} />
      {header.committer.name}
    </div>
    committed
    <slot />
    <span title={absoluteTimestamp(header.committer.time)}>
      {formatTimestamp(header.committer.time)}
    </span>
    <slot name="after-timestamp" />
  {:else}
    <div class="person">
      <img class="avatar" alt="avatar" src={gravatarURL(header.author.email)} />
      {header.author.name}
    </div>
    authored and
    <div class="person">
      <img
        class="avatar"
        alt="avatar"
        src={gravatarURL(header.committer.email)} />
      {header.committer.name}
    </div>
    committed
    <slot />
    <span title={absoluteTimestamp(header.committer.time)}>
      {formatTimestamp(header.committer.time)}
    </span>
    <slot name="after-timestamp" />
  {/if}
</span>
