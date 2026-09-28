<script lang="ts">
  import type { Artifact } from "@http-client";

  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import DelegateBadge from "./DelegateBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Popover from "@app/components/Popover.svelte";
  import Radio from "@app/components/Radio.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import UntrustedWarning from "./UntrustedWarning.svelte";

  export let artifact: Artifact;
  export let rid: string;
  export let delegateIds: Set<string>;

  // Whether the browser can fetch the location itself, as opposed to it being
  // served over the radicle-artifact protocol.
  function isWebUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  // Delegate locations come first: they are the ones a reader can trust most.
  $: webLocations = [...artifact.locations.filter(l => isWebUrl(l.url))].sort(
    (a, b) =>
      Number(delegateIds.has(b.user.id)) - Number(delegateIds.has(a.user.id)),
  );
  $: authorTrusted = delegateIds.has(artifact.author.id);
  $: linksByOthers = webLocations.some(l => !delegateIds.has(l.user.id));
  // Any location at all can be fetched with the CLI, web locations included.
  $: downloadable = artifact.locations.length > 0;
  $: command = `rad artifact -r ${rid} download --cid ${artifact.cid}`;

  let activeTab: "cli" | "browser" = "cli";
</script>

<style>
  .popover {
    font: var(--txt-body-m-regular);
  }
  label {
    display: block;
    margin-bottom: 0.75rem;
  }
  .warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    color: var(--color-feedback-warning-text);
  }
  .warning :global(svg) {
    flex-shrink: 0;
  }
  .untrusted {
    margin-bottom: 0.75rem;
  }
  .locations {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .location {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .url {
    flex: 1;
    min-width: 0;
  }
  .download {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  .download:hover {
    color: var(--color-text-primary);
  }
</style>

<Popover popoverPositionTop="2.5rem" popoverPositionRight="0">
  <Button
    slot="toggle"
    let:toggle
    on:click={toggle}
    variant="gray"
    disabled={!downloadable}
    title={downloadable
      ? undefined
      : "No download source is currently available for this artifact"}>
    <Icon name="download" />
    Download
  </Button>

  <div slot="popover" style:width="24rem" class="popover">
    {#if !authorTrusted}
      <div class="untrusted">
        <UntrustedWarning
          text="Not from a delegate. Only download if you trust the author." />
      </div>
    {/if}
    <div style:margin-bottom="1.5rem">
      <Radio ariaLabel="Toggle download method" styleGap="2px">
        <Button
          styleWidth="100%"
          styleBorderRadius="0"
          variant={activeTab === "cli" ? "selected" : "not-selected"}
          on:click={() => {
            activeTab = "cli";
          }}>
          <Icon name="logo" />
          CLI
        </Button>
        <div class="global-spacer"></div>
        <Button
          styleWidth="100%"
          styleBorderRadius="0"
          disabled={webLocations.length === 0}
          title={webLocations.length === 0
            ? "This artifact has no web locations"
            : undefined}
          variant={activeTab === "browser" ? "selected" : "not-selected"}
          on:click={() => {
            activeTab = "browser";
          }}>
          <Icon name="download" />
          Browser
        </Button>
      </Radio>
    </div>

    {#if activeTab === "cli"}
      <label for="download-command">
        Use the <ExternalLink
          href="https://radicle.network/nodes/iris.radicle.network/rad:z4VYyJ9KuwMNkXGQnmKuGPGKw3inv">
          Radicle Artifact CLI
        </ExternalLink> to download and verify this artifact.
      </label>
      <Command {command} />
    {:else}
      <div class="warning">
        <Icon name="warning" />
        These downloads are not checked against the CID.
      </div>
      {#if authorTrusted && linksByOthers}
        <div class="untrusted">
          <UntrustedWarning
            text="Links without a delegate badge are not from a delegate. Only use them if you trust who added them." />
        </div>
      {/if}
      <div class="locations">
        {#each webLocations as location (location.url)}
          <div class="location">
            {#if delegateIds.has(location.user.id)}
              <DelegateBadge tooltip="Location added by a delegate" />
            {/if}
            <div class="url">
              <Id id={location.url} truncate title={location.url}>
                {location.url}
              </Id>
            </div>
            <a
              class="download"
              href={location.url}
              target="_blank"
              rel="noreferrer"
              download
              title="Download">
              <Icon name="download" />
            </a>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Popover>
