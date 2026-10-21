<script lang="ts">
  export let filenameWithPath: string;

  $: path = filenameWithPath
    .match(/^.*\/|/)
    ?.values()
    .next().value;

  $: filename = filenameWithPath.split("/").slice(-1);
</script>

<style>
  .file-path {
    font: var(--txt-body-m-regular);
    white-space: nowrap;
  }

  .path {
    color: var(--color-text-tertiary);
  }

  .filename {
    font: var(--txt-body-m-regular);
  }
</style>

<!-- prettier-ignore -->
<span class="file-path"><span class="path">{path}</span><span class="filename">{filename}</span></span>
