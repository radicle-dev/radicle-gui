<script lang="ts">
  import { onMount } from "svelte";

  import { copy, formatBytes, shortNid, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  const net = node.network;
  let now = $state(Date.now());
  let quota = $state<{ usage: number; quota: number } | undefined>(undefined);
  let persisted = $state<boolean | undefined>(undefined);

  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    void navigator.storage?.estimate?.().then(e => {
      quota = { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    });
    void navigator.storage?.persisted?.().then(p => (persisted = p));
    return () => clearInterval(t);
  });

  function repoSize(rid: string): number {
    const repo = node.world.repos[rid];
    let bytes = 0;
    for (const snap of Object.values(repo.snapshots)) {
      for (const content of Object.values(snap)) bytes += content.length;
    }
    // Git packs plus COB history: scale up so sizes look like real repos.
    return bytes * 9 + repo.issues.length * 4800 + repo.patches.length * 21000;
  }

  const sizes = $derived(
    node.repos.map(r => ({ repo: r, bytes: repoSize(r.rid) })),
  );
  const seededBytes = $derived(
    sizes.filter(s => node.seeding[s.repo.rid]).reduce((a, s) => a + s.bytes, 0),
  );
  const uptime = $derived.by(() => {
    if (net.status === "offline") return "Stopped";
    const s = Math.floor((now - net.startedAt) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  });
  const statusText = $derived(
    {
      starting: "Starting",
      connecting: "Connecting",
      online: "Online",
      offline: "Offline",
    }[net.status],
  );
  const statusColor = $derived(
    net.status === "online"
      ? "var(--color-feedback-success-fill)"
      : net.status === "offline"
        ? "var(--color-text-quaternary)"
        : "var(--color-feedback-warning-border)",
  );
  const self = $derived(node.person("self"));
</script>

<style>
  .hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }
  h1 {
    font: var(--txt-heading-xl);
    margin: 0 0 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  h1 .dot {
    width: 0.75rem;
    height: 0.75rem;
  }
  .lede {
    color: var(--color-text-secondary);
    font: var(--txt-body-l-regular);
    margin: 0;
    max-width: 40rem;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 2rem;
  }
  .stat {
    padding: 1rem 1.25rem;
    border-right: 1px solid var(--color-border-subtle);
  }
  .stat:last-child {
    border-right: none;
  }
  .stat .value {
    font: var(--txt-heading-l);
  }
  .stat .label {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 2rem;
  }
  section {
    margin-bottom: 2rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font: var(--txt-body-m-regular);
  }
  th {
    text-align: left;
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  td {
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    white-space: nowrap;
  }
  tr:last-child td {
    border-bottom: none;
  }
  .num {
    text-align: right;
  }
  .kind {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .log {
    max-height: 26rem;
    overflow-y: auto;
  }
  .event {
    display: flex;
    gap: 0.625rem;
    padding: 0.5rem 1rem;
    font: var(--txt-body-s-regular);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .event .time {
    color: var(--color-text-quaternary);
    width: 4.5rem;
    flex-shrink: 0;
  }
  .event .icon {
    color: var(--color-text-tertiary);
  }
  .seed-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
  .seed-row:last-child {
    border-bottom: none;
  }
  .seed-row .size {
    margin-left: auto;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .bar {
    height: 0.375rem;
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-full);
    overflow: hidden;
    margin: 0.5rem 0;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--color-surface-brand-primary);
  }
  .info {
    padding: 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .info strong {
    color: var(--color-text-primary);
  }
  .id {
    font: var(--txt-code-small);
    color: var(--color-text-secondary);
    word-break: break-all;
  }
  @media (max-width: 960px) {
    .cols {
      grid-template-columns: 1fr;
    }
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

<div class="page">
  <div class="hero">
    <div>
      <h1><span class="dot" style:background={statusColor}></span>Your node · {statusText}</h1>
      <p class="lede">
        A full Radicle node running inside this browser tab. It stores the repositories
        you seed, syncs them with peers over WebTransport and WebRTC, and signs
        everything you do with your key.
      </p>
    </div>
    <div class="row">
      {#if net.status === "offline"}
        <Button variant="secondary" onclick={() => net.start()}>
          <Icon name="play" /> Start node
        </Button>
      {:else}
        <Button variant="ghost" onclick={() => net.goOffline()}>
          <Icon name="stop" /> Stop node
        </Button>
      {/if}
    </div>
  </div>

  <div class="card stats">
    <div class="stat">
      <div class="value">{net.peers.length}</div>
      <div class="label">Connected peers</div>
    </div>
    <div class="stat">
      <div class="value">{node.seededRepos.length}</div>
      <div class="label">Repositories seeded</div>
    </div>
    <div class="stat">
      <div class="value">{formatBytes(net.inBytes)} ↓ · {formatBytes(net.outBytes)} ↑</div>
      <div class="label">Transferred this session</div>
    </div>
    <div class="stat">
      <div class="value">{uptime}</div>
      <div class="label">Uptime</div>
    </div>
  </div>

  <div class="cols">
    <div>
      <section>
        <h2 class="section-title">Peers</h2>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Peer</th>
                <th>Transport</th>
                <th class="num">Latency</th>
                <th class="num">In / Out</th>
              </tr>
            </thead>
            <tbody>
              {#each net.peers as peer (peer.nid)}
                <tr>
                  <td>
                    <div class="row">
                      <Icon name={peer.kind === "seed" ? "globe" : "device"} />
                      {#if peer.person}
                        <a class="link" href={`/@${node.person(peer.person).alias}`}>{peer.label}</a>
                      {:else}
                        {peer.label}
                      {/if}
                      <span class="kind">{peer.kind === "seed" ? "Seed node" : "Peer"}</span>
                    </div>
                  </td>
                  <td>{peer.transport}</td>
                  <td class="num">{peer.latencyMs} ms</td>
                  <td class="num">{formatBytes(peer.inBytes)} / {formatBytes(peer.outBytes)}</td>
                </tr>
              {:else}
                <tr><td colspan="4" class="muted">No peers connected.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="section-title">Seeding</h2>
        <div class="card">
          {#each sizes as { repo, bytes } (repo.rid)}
            <div class="seed-row">
              <Icon name={node.seeding[repo.rid] ? "seed-filled" : "seed"} />
              <a class="link ellipsis" href={node.repoPath(repo)}>
                {node.ownerHandle(repo.owner)}/{repo.name}
              </a>
              <span class="size">{node.seeding[repo.rid] ? formatBytes(bytes) : "Not stored"}</span>
              <Button
                variant={node.seeding[repo.rid] ? "ghost" : "outline"}
                styleHeight="1.75rem"
                onclick={() =>
                  node.do({ type: "seed", rid: repo.rid, on: !node.seeding[repo.rid] })}>
                {node.seeding[repo.rid] ? "Unseed" : "Seed"}
              </Button>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <div>
      <section>
        <h2 class="section-title">Activity</h2>
        <div class="card log">
          {#each net.events as event (event.id)}
            <div class="event">
              <span class="time">{timeAgo(event.time, now)}</span>
              <span class="icon">
                <Icon
                  name={event.kind === "connect"
                    ? "online"
                    : event.kind === "disconnect"
                      ? "offline"
                      : event.kind === "announce"
                        ? "share"
                        : event.kind === "serve"
                          ? "arrow-up"
                          : "arrow-down"} />
              </span>
              <span>{event.text}</span>
            </div>
          {/each}
        </div>
      </section>

      <section>
        <h2 class="section-title">Storage</h2>
        <div class="card info">
          <div>
            <strong>{formatBytes(seededBytes)}</strong> used by repositories
            {#if quota}
              <div class="bar">
                <span style:width={`${Math.max(1, (seededBytes / Math.max(quota.quota, 1)) * 100)}%`}></span>
              </div>
              <span class="muted txt-body-s-regular">
                The browser allows this site up to {formatBytes(quota.quota)}.
              </span>
            {/if}
          </div>
          <div>
            {#if persisted}
              <strong>Persistent storage is on.</strong> The browser won't clear your
              repositories to free space.
            {:else}
              <strong>Storage may be cleared.</strong> The browser can evict site data
              when space runs low. Your peers and seed nodes still have your work.
            {/if}
          </div>
        </div>
      </section>

      <section>
        <h2 class="section-title">When you close this tab</h2>
        <div class="card info">
          <div>
            Your node stops, but nothing is lost. Everything you published was already
            announced to peers, and seed nodes keep serving it. Next time you open
            Radicle, your node catches up from them.
          </div>
          <div>
            With several Radicle tabs open, only one runs the node; the others share
            it.
          </div>
          {#if !net.tabVisible}<div><strong>Tab in background:</strong> syncing slowed down.</div>{/if}
        </div>
      </section>

      <section>
        <h2 class="section-title">Identity</h2>
        <div class="card info">
          <div class="row" style="justify-content: space-between;">
            <strong>{self.alias}</strong>
            <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(self.did)}>
              <Icon name="copy" /> Copy DID
            </Button>
          </div>
          <span class="id">{self.did}</span>
          <span class="muted txt-body-s-regular">
            Node ID {shortNid(self.nid)} · key stored in this browser ({node.identity?.device})
          </span>
        </div>
      </section>
    </div>
  </div>
</div>
