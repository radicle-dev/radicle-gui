<script lang="ts">
  import Icon from "@app/components/Icon.svelte";

  export let commentCount: number;
</script>

<style>
  .comments {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
  }
</style>

<div class="comments">
  <Icon name="comment" />
  <span>{commentCount}</span>
</div>
