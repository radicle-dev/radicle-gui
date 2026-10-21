<script context="module" lang="ts">
  import type { BaseUrl, Job } from "@http-client";

  import { LRUCache } from "lru-cache";

  import { HttpdClient } from "@http-client";

  const inFlightJobs = new LRUCache<string, Promise<Job[]>>({
    max: 200,
    ttl: 30_000,
  });

  function fetchJobs(
    baseUrl: BaseUrl,
    rid: string,
    commit: string,
  ): Promise<Job[]> {
    const key = `${baseUrl.scheme}://${baseUrl.hostname}:${baseUrl.port}/${rid}/${commit}`;
    let promise = inFlightJobs.get(key);
    if (!promise) {
      const request = new HttpdClient(baseUrl).repo.getJobsByCommit(
        rid,
        commit,
      );
      // Only evict on failure if this exact request is still cached; after the
      // entry's ttl expires a later request may have replaced it under the key.
      request.catch(() => {
        if (inFlightJobs.peek(key) === request) {
          inFlightJobs.delete(key);
        }
      });
      inFlightJobs.set(key, request);
      promise = request;
    }
    return promise;
  }
</script>

<script lang="ts">
  import { safeHttpUrl } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Loading from "@app/components/Loading.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Popover from "@app/components/Popover.svelte";

  export let baseUrl: BaseUrl;
  export let commit: string;
  export let rid: string;

  $: jobsPromise = fetchJobs(baseUrl, rid, commit);

  type Run = Job["runs"][number];
  type Status = Run["status"];

  type RunView = {
    run: Run;
    label: string;
    safeLog: string | undefined;
  };

  type HostGroup = {
    host: string;
    runs: RunView[];
  };

  type Counts = { succeeded: number; failed: number; started: number };

  type NodeGroup = {
    nodeKey: string;
    nodeId: string;
    alias: string | undefined;
    hosts: HostGroup[];
    flatRuns?: RunView[];
    inlineHost?: string;
    counts: Counts;
    status: Status;
  };

  let collapsed: Record<string, true> = {};

  function parseUrl(s: string): URL | undefined {
    try {
      return new URL(s);
    } catch {
      return undefined;
    }
  }

  function runLabel(run: Run, url: URL | undefined): string {
    if (url && url.host === "github.com") {
      const m = url.pathname.match(/\/actions\/runs\/(\d+)/);
      if (m) return m[1];
    }
    return run.runId.slice(0, 8);
  }

  function isTerminal(status: Status): boolean {
    return status === "succeeded" || status === "failed";
  }

  function aggregateStatus(c: Counts): Status {
    if (c.failed) return "failed";
    if (c.started) return "started";
    return "succeeded";
  }

  function statusLabel(c: Counts): string {
    const parts: string[] = [];
    if (c.succeeded) parts.push(`${c.succeeded} passed`);
    if (c.failed) parts.push(`${c.failed} failed`);
    if (c.started) parts.push(`${c.started} running`);
    return parts.join(" · ");
  }

  function totalCounts(groups: NodeGroup[]): Counts {
    const total: Counts = { succeeded: 0, failed: 0, started: 0 };
    for (const g of groups) {
      total.succeeded += g.counts.succeeded;
      total.failed += g.counts.failed;
      total.started += g.counts.started;
    }
    return total;
  }

  function aliasMatchesHost(alias: string | undefined, host: string): boolean {
    if (!alias) return false;
    const a = alias.toLowerCase();
    if (host === a) return true;
    if (host.endsWith("." + a)) return true;
    return host.split(".").includes(a);
  }

  function groupJobs(jobs: Job[]): NodeGroup[] {
    const byNode: Record<
      string,
      {
        nodeId: string;
        alias: string | undefined;
        byHost: Record<string, RunView[]>;
        seen: Map<string, RunView>;
      }
    > = {};
    const nodeOrder: string[] = [];
    for (const job of jobs) {
      for (const run of job.runs) {
        const url = parseUrl(run.log);
        const host = url && url.host ? url.host : "(unknown host)";
        const safeLog =
          url?.host !== "no.url.example.com" ? safeHttpUrl(run.log) : undefined;
        const view: RunView = {
          run,
          label: runLabel(run, url),
          safeLog,
        };
        const key = run.node.id;
        let entry = byNode[key];
        if (!entry) {
          entry = {
            nodeId: run.node.id,
            alias: run.node.alias,
            byHost: {},
            seen: new Map(),
          };
          byNode[key] = entry;
          nodeOrder.push(key);
        }
        const existing = entry.seen.get(run.runId);
        if (existing) {
          // The same run can appear under multiple job COBs. Keep one view
          // per runId, but let a terminal status override a stale "started"
          // one when COBs polled at different times disagree. We mutate the
          // existing view in place because it is the same object referenced
          // from its host bucket below.
          if (!isTerminal(existing.run.status) && isTerminal(run.status)) {
            existing.run = run;
            existing.label = view.label;
            existing.safeLog = view.safeLog;
          }
          continue;
        }
        entry.seen.set(run.runId, view);
        const bucket = entry.byHost[host] ?? (entry.byHost[host] = []);
        bucket.push(view);
      }
    }
    return nodeOrder.map(nodeKey => {
      const { nodeId, alias, byHost } = byNode[nodeKey];
      const hosts: HostGroup[] = Object.entries(byHost).map(([host, runs]) => ({
        host,
        runs,
      }));
      const counts: Counts = { succeeded: 0, failed: 0, started: 0 };
      for (const { runs } of hosts) {
        for (const v of runs) counts[v.run.status]++;
      }
      const group: NodeGroup = {
        nodeKey,
        nodeId,
        alias,
        hosts,
        counts,
        status: aggregateStatus(counts),
      };
      if (hosts.length === 1) {
        group.flatRuns = hosts[0].runs;
        if (!aliasMatchesHost(alias, hosts[0].host)) {
          group.inlineHost = hosts[0].host;
        }
      }
      return group;
    });
  }

  function toggleNode(key: string) {
    if (collapsed[key]) {
      delete collapsed[key];
    } else {
      collapsed[key] = true;
    }
    collapsed = { ...collapsed };
  }
</script>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
  }
  .chip.succeeded {
    color: var(--color-feedback-success-text);
    background-color: var(--color-feedback-success-bg);
  }
  .chip.failed {
    color: var(--color-feedback-error-text);
    background-color: var(--color-feedback-error-bg);
  }
  .chip.started {
    color: var(--color-text-quaternary);
    background-color: var(--color-surface-mid);
  }
  .popover-body {
    display: flex;
    flex-direction: column;
    min-width: 24rem;
    font: var(--txt-body-m-regular);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    padding: 0 0.75rem;
    border-radius: var(--border-radius-sm);
  }
  .node-header {
    cursor: pointer;
    user-select: none;
  }
  .node-header:hover,
  a.run-row:hover {
    background-color: var(--color-surface-subtle);
  }
  .chevron {
    width: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-quaternary);
  }
  .node-name {
    min-width: 0;
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    overflow: hidden;
  }
  .inline-host {
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
    white-space: nowrap;
  }
  .host-row {
    padding-left: 2.25rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
  }
  /*
   * 3.75rem = row padding (0.75) + chevron (1) + gap (0.5) + header chip (1)
   * + gap (0.5), so the run status chip sits under the node avatar.
   */
  .run-row {
    padding-left: 3.75rem;
    text-decoration: none;
    color: var(--color-text-primary);
  }
  a.run-row {
    cursor: pointer;
  }
  .run-label {
    flex: 1;
    white-space: nowrap;
  }
  .run-id {
    font: var(--txt-code-regular);
  }
  .run-affordance {
    color: var(--color-text-quaternary);
    white-space: nowrap;
  }
  .run-affordance.muted {
    font: var(--txt-body-s-regular);
  }
  .loading {
    padding-left: 0.5rem;
  }
</style>

{#await jobsPromise}
  <div class="loading"><Loading small noDelay /></div>
{:then jobs}
  {@const groups = groupJobs(jobs)}
  {#if groups.length > 0}
    {@const overallCounts = totalCounts(groups)}
    {@const overall = aggregateStatus(overallCounts)}
    <Popover
      popoverPadding="0.25rem"
      popoverBorderRadius="var(--border-radius-md)"
      popoverPositionTop="calc(100% + 0.25rem)"
      popoverPositionLeft="0">
      <svelte:fragment slot="toggle" let:toggle>
        <Button
          variant="background"
          on:click={e => {
            e.stopPropagation();
            toggle();
          }}>
          <span class="chip {overall}">
            {#if overall === "succeeded"}
              <Icon name="checkmark" />
            {:else if overall === "failed"}
              <Icon name="close" />
            {:else}
              <Icon name="hourglass" />
            {/if}
          </span>
          {statusLabel(overallCounts)}
          <Icon name="chevron-down" />
        </Button>
      </svelte:fragment>

      <div slot="popover" class="popover-body">
        {#each groups as group (group.nodeKey)}
          {@const isCollapsed = collapsed[group.nodeKey]}
          <div class="node-group">
            <div
              class="row node-header"
              role="button"
              tabindex="0"
              on:click={() => toggleNode(group.nodeKey)}
              on:keydown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleNode(group.nodeKey);
                }
              }}>
              <span class="chevron">
                <Icon name={isCollapsed ? "chevron-right" : "chevron-down"} />
              </span>
              <span class="chip {group.status}">
                {#if group.status === "succeeded"}
                  <Icon name="checkmark" />
                {:else if group.status === "failed"}
                  <Icon name="close" />
                {:else}
                  <Icon name="hourglass" />
                {/if}
              </span>
              <span class="node-name">
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <span on:click|stopPropagation>
                  <NodeId {baseUrl} nodeId={group.nodeId} alias={group.alias} />
                </span>
                {#if group.inlineHost}
                  <span class="inline-host">· {group.inlineHost}</span>
                {/if}
              </span>
              <span class="count">{statusLabel(group.counts)}</span>
            </div>

            {#if !isCollapsed}
              {#if group.flatRuns}
                {#each group.flatRuns as view (view.run.runId)}
                  {#if view.safeLog}
                    <a
                      class="row run-row"
                      href={view.safeLog}
                      target="_blank"
                      rel="noopener noreferrer">
                      <span class="chip {view.run.status}">
                        {#if view.run.status === "succeeded"}
                          <Icon name="checkmark" />
                        {:else if view.run.status === "failed"}
                          <Icon name="close" />
                        {:else}
                          <Icon name="hourglass" />
                        {/if}
                      </span>
                      <span class="run-label">
                        run <span class="run-id">{view.label}</span>
                      </span>
                      <span class="run-affordance">
                        <Icon name="open-external" />
                      </span>
                    </a>
                  {:else}
                    <div class="row run-row">
                      <span class="chip {view.run.status}">
                        {#if view.run.status === "succeeded"}
                          <Icon name="checkmark" />
                        {:else if view.run.status === "failed"}
                          <Icon name="close" />
                        {:else}
                          <Icon name="hourglass" />
                        {/if}
                      </span>
                      <span class="run-label">
                        run <span class="run-id">{view.label}</span>
                      </span>
                      <span class="run-affordance muted">(no log)</span>
                    </div>
                  {/if}
                {/each}
              {:else}
                {#each group.hosts as host}
                  <div class="row host-row"><span>{host.host}</span></div>
                  {#each host.runs as view (view.run.runId)}
                    {#if view.safeLog}
                      <a
                        class="row run-row"
                        href={view.safeLog}
                        target="_blank"
                        rel="noopener noreferrer">
                        <span class="chip {view.run.status}">
                          {#if view.run.status === "succeeded"}
                            <Icon name="checkmark" />
                          {:else if view.run.status === "failed"}
                            <Icon name="close" />
                          {:else}
                            <Icon name="hourglass" />
                          {/if}
                        </span>
                        <span class="run-label">
                          run <span class="run-id">{view.label}</span>
                        </span>
                        <span class="run-affordance">
                          <Icon name="open-external" />
                        </span>
                      </a>
                    {:else}
                      <div class="row run-row">
                        <span class="chip {view.run.status}">
                          {#if view.run.status === "succeeded"}
                            <Icon name="checkmark" />
                          {:else if view.run.status === "failed"}
                            <Icon name="close" />
                          {:else}
                            <Icon name="hourglass" />
                          {/if}
                        </span>
                        <span class="run-label">
                          run <span class="run-id">{view.label}</span>
                        </span>
                        <span class="run-affordance muted">(no log)</span>
                      </div>
                    {/if}
                  {/each}
                {/each}
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    </Popover>
  {/if}
{:catch}
  <!-- Silently ignore errors from old nodes without the jobs endpoint. -->
{/await}
