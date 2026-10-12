<script lang="ts">
  interface Props {
    fullPath: string;
  }

  const { fullPath }: Props = $props();
</script>

<style>
  .container {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    -webkit-touch-callout: initial;
    -webkit-user-select: text;
    user-select: text;
  }
  .path {
    color: var(--color-text-quaternary);
  }
</style>

<!-- prettier-ignore -->
<span class="txt-body-m-regular container">
  <span class="path">
    {fullPath
      .match(/^.*\/|/)
      ?.values()
      .next().value}
  </span><span class="filename">
    {fullPath.split("/").slice(-1)}
  </span>
</span>
