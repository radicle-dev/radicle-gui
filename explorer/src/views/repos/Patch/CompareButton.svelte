<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  export let fromCommit: string;
  export let toCommit: string;
</script>

<Button size="regular" disabled>
  <span style:color="var(--color-text-disabled)">Compare</span>
  <span
    style:color="var(--color-text-disabled)"
    style:font="var(--txt-code-regular)">
    {fromCommit.substring(0, 6)}..{toCommit.substring(0, 6)}
  </span>
  <Icon name="chevron-down" />
</Button>
