<script lang="ts">
  import type { Sheet } from "@app/lib/sheet";

  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";
  import { navigate } from "@app/lib/router.svelte";

  interface Props {
    sheet: Sheet;
  }

  const { sheet }: Props = $props();
</script>

<Button variant="naked" title="Open full page" ariaLabel="Open full page" onclick={() => navigate(sheet.expandHref)}>
  <Icon name="expand-out" />
</Button>
<Button variant="naked" title="Close" ariaLabel="Close" onclick={sheet.close}>
  <Icon name="close" />
</Button>
