<script lang="ts">
  import { nodeRunning } from "@app/lib/events";
  import { modalStore, show } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeStatusView from "@app/modals/NodeStatus.svelte";
</script>

<Button
  variant="naked"
  active={$modalStore?.component === NodeStatusView}
  styleWidth="100%"
  styleJustifyContent="flex-start"
  onclick={() => show({ component: NodeStatusView, props: {} })}>
  <span style:color="var(--color-text-tertiary)">
    <Icon name={$nodeRunning ? "online" : "offline"} />
  </span>
  {$nodeRunning ? "Online" : "Offline"}
</Button>
