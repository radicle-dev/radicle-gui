<script lang="ts">
  import type { PatchView } from "../router";
  import type { BaseUrl, Patch } from "@http-client";
  import * as utils from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownList/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import Popover from "@app/components/Popover.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";

  export let view: Extract<PatchView, { name: "changes" }>;
  export let baseUrl: BaseUrl;
  export let patch: Patch;
  export let repoId: string;
</script>

<Popover
  popoverPadding="0"
  popoverPositionTop="3rem"
  popoverBorderRadius="var(--border-radius-md)">
  <Button
    let:expanded
    slot="toggle"
    let:toggle
    on:click={toggle}
    size="regular"
    disabled={patch.revisions.length === 1}>
    <span
      style:color={patch.revisions.length > 1
        ? "var(--color-text-primary)"
        : "var(--color-text-disabled)"}>
      Revision
    </span>
    <span
      style:color={patch.revisions.length > 1
        ? "var(--color-text-brand)"
        : "var(--color-text-disabled)"}
      style:font="var(--txt-code-regular)">
      {utils.formatObjectId(view.revision)}
    </span>
    <Icon name={expanded ? "chevron-up" : "chevron-down"} />
  </Button>
  <DropdownList slot="popover" items={patch.revisions}>
    <svelte:fragment slot="item" let:item>
      <Link
        on:afterNavigate={closeFocused}
        route={{
          resource: "repo.patch",
          repo: repoId,
          node: baseUrl,
          patch: patch.id,
          view: {
            name: view.name,
            revision: item.id,
          },
        }}>
        <DropdownListItem selected={item.id === view.revision}>
          <span
            style:color={item.id === view.revision
              ? "var(--color-text-primary)"
              : "var(--color-text-tertiary)"}>
            Revision
          </span>
          <span
            style:color="var(--color-text-brand)"
            style:font="var(--txt-code-regular)">
            {utils.formatObjectId(item.id)}
          </span>
        </DropdownListItem>
      </Link>
    </svelte:fragment>
  </DropdownList>
</Popover>
