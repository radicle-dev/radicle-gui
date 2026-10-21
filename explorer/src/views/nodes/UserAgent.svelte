<script lang="ts">
  import Id from "@app/components/Id.svelte";

  export let agent: string;
</script>

<style>
  .agent {
    color: var(--color-text-tertiary);
    font: var(--txt-code-regular);
    max-width: 19rem;
    margin-right: 2.25rem;
  }
  .item {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    width: 100%;
  }
  @media (max-width: 1010.98px) {
    .agent {
      max-width: 10rem;
    }
  }
</style>

<div class="item">
  <div style:white-space="nowrap">User Agent</div>
  <Id ariaLabel="agent" id={agent} shorten={false}>
    <div class="agent">
      <div class="txt-overflow">{agent}</div>
    </div>
  </Id>
</div>
