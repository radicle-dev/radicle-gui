<script lang="ts">
  import type { BaseUrl } from "@http-client";

  import config from "@app/lib/config";
  import {
    archiveDownloadSupported,
    archiveUnsupportedMessage,
  } from "@app/lib/archive";
  import { parseRepositoryId } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Loading from "@app/components/Loading.svelte";
  import Popover from "@app/components/Popover.svelte";
  import Radio from "@app/components/Radio.svelte";

  import { baseUrlToString } from "@app/lib/utils";

  export let baseUrl: BaseUrl;
  export let id: string;
  export let name: string;
  export let currentRefname: string;
  export let alias: string | undefined = undefined;

  let activeTab: "radicle" | "git" | "archive" = "radicle";
  let archiveProbe: Promise<boolean> | undefined;

  function showArchiveTab() {
    activeTab = "archive";
    archiveProbe = archiveDownloadSupported(
      `${baseUrlToString(baseUrl)}/raw/${id}/archive/${currentRefname}`,
    );
  }

  $: radCloneUrl = `rad clone ${id}`;
  $: portFragment =
    baseUrl.scheme === config.nodes.defaultHttpdScheme &&
    baseUrl.port === config.nodes.defaultHttpdPort
      ? ""
      : `:${baseUrl.port}`;
  $: archiveUrl = `curl -OJ ${baseUrl.scheme}://${baseUrl.hostname}${portFragment}/raw/${alias ?? id}/archive/${currentRefname}`;
  $: gitCloneUrl = `git clone ${baseUrl.scheme}://${
    baseUrl.hostname
  }${portFragment}/${alias ?? parseRepositoryId(id)?.pubkey ?? id}.git ${name}`;
</script>

<style>
  .popover {
    font: var(--txt-body-m-regular);
  }
  label {
    display: block;
    margin-bottom: 0.75rem;
  }
</style>

<Popover popoverPositionTop="2.5rem" popoverPositionRight="0">
  <Button slot="toggle" let:toggle on:click={toggle} variant="outline">
    <Icon name="checkout" />
    <span class="global-hide-on-small-desktop-down">Clone</span>
  </Button>

  <div slot="popover" style:width="24rem" class="popover">
    <div style:margin-bottom="1.5rem">
      <Radio ariaLabel="Toggle render method" styleGap="2px">
        <Button
          styleWidth="100%"
          styleBorderRadius="0"
          variant={activeTab === "radicle" ? "selected" : "not-selected"}
          on:click={() => {
            activeTab = "radicle";
          }}>
          <Icon name="logo" />
          Radicle
        </Button>
        <div class="global-spacer"></div>
        <Button
          styleWidth="100%"
          styleBorderRadius="0"
          variant={activeTab === "git" ? "selected" : "not-selected"}
          on:click={() => {
            activeTab = "git";
          }}>
          <Icon name="git" />
          Git
        </Button>
        <div class="global-spacer"></div>
        <Button
          styleWidth="100%"
          styleBorderRadius="0"
          variant={activeTab === "archive" ? "selected" : "not-selected"}
          on:click={showArchiveTab}>
          <Icon name="archive" />
          Download
        </Button>
      </Radio>
    </div>

    {#if activeTab === "radicle"}
      <label for="rad-clone-url">
        Use the <ExternalLink href="https://radicle.dev">
          Radicle CLI
        </ExternalLink> to clone this repository.
      </label>
      <Command command={radCloneUrl} />
    {:else if activeTab === "git"}
      <div>
        <label for="git-clone-url">
          If you don’t have Radicle installed, you can still clone the
          repository via Git.
        </label>
        <Command command={gitCloneUrl} />
        <div style:margin-top="1.5rem">
          Note that a Git clone does not include any of the social artifacts
          such as issues or patches.
        </div>
      </div>
    {:else if activeTab === "archive"}
      {#await archiveProbe}
        <Loading small center />
      {:then supported}
        {#if supported}
          <div>
            <label for="git-clone-url">
              If you don’t have Radicle installed, you can still download an
              archive of the repository.
            </label>
            <Command command={archiveUrl} />
            <div style:margin-top="1.5rem">
              Note that a compressed archive of the source code does not include
              any of the social artifacts such as issues or patches nor the git
              history.
            </div>
          </div>
        {:else}
          {archiveUnsupportedMessage}
        {/if}
      {:catch}
        {archiveUnsupportedMessage}
      {/await}
    {/if}
  </div>
</Popover>
