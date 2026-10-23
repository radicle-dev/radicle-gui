<script lang="ts">
  import {
    diffStyle,
    setDiffStyle,
    splitFits,
  } from "@app/lib/diffStyle.svelte";

  import SegmentedSwitch from "./SegmentedSwitch.svelte";
</script>

{#if splitFits.current}
  <SegmentedSwitch
    options={[
      {
        value: "unified",
        icon: "diff-unified",
        title: "Show changes in one column",
      },
      {
        value: "split",
        icon: "diff-split",
        title: "Show changes side by side",
      },
    ]}
    value={diffStyle.current}
    onchange={setDiffStyle} />
{/if}
