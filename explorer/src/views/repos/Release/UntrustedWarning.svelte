<script lang="ts">
  import Icon from "@app/components/Icon.svelte";

  export let text: string;
</script>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
  }
  .icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-feedback-warning-text);
  }
</style>

<div class="banner" role="note">
  <span class="icon"><Icon name="warning" /></span>
  <span>{text}</span>
</div>
