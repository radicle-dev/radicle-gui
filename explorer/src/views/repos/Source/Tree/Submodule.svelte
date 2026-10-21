<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import { formatCommit } from "@app/lib/utils";

  export let name: string;
  export let oid: string;
</script>

<style>
  .submodule {
    color: var(--color-text-tertiary);
    border-radius: var(--border-radius-sm);
    display: flex;
    line-height: 1.5em;
    margin: 0.25rem 0;
    padding: 0.25rem 0.875rem;
    width: 100%;
  }

  .name {
    margin-left: 0.25rem;
    user-select: none;
    white-space: nowrap;
    text-overflow: ellipsis !important;
    overflow: hidden;
    font: var(--txt-body-m-regular);
  }
  .icon-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-right: 0.125rem;
  }
</style>

<div
  class="submodule"
  title="This is a git submodule, for more information look at the nearest .gitmodules file">
  <div class="icon-container">
    <Icon name="repository" />
  </div>
  <span class="name">{name} @ {formatCommit(oid)}</span>
</div>
