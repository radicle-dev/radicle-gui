<script lang="ts">
  import type { Revision } from "@bindings/identity/Revision";
  import type { ComponentProps } from "svelte";

  import { show } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import RawIdentityDocumentModal from "@app/modals/RawIdentityDocument.svelte";

  interface Props {
    raw: string;
    revision?: Revision;
    styleHeight?: ComponentProps<typeof Button>["styleHeight"];
  }

  const { raw, revision, styleHeight = "2rem" }: Props = $props();
</script>

<Button
  {styleHeight}
  variant="outline"
  onclick={() =>
    show({ component: RawIdentityDocumentModal, props: { raw, revision } })}>
  <Icon name="code" />View JSON
</Button>
