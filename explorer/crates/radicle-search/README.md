# radicle-search

Optional indexing daemon for Radicle. Runs alongside `radicle-node` and
maintains seven Meilisearch indexes that `radicle-httpd` can use to serve fast,
typo-tolerant repo listings and full-text search.

When configured, httpd routes `/repos?sort=activity|seeding` and
`/repos/search?q=…` through the index. In the default `sqlite` mode, when absent
or unreachable, httpd transparently falls back to its built-in storage walk — no
configuration on the client side, no API contract changes.

## Indexes

The daemon maintains seven indexes (all named relative to
`RADICLE_SEARCH_INDEX_PREFIX`):

### `repos`

One document per public, locally-seeded repository.

- **Searchable**: `name`, `description`.
- **Sortable**: `seedingCount`, `headCommitterTime`, `ridHex`.
- **Filterable**: `delegates`, `visibility`, `rid`.
- **Stored**: `rid`, `issueCounts`, `patchCounts`, head OID, default branch,
  schema version (`v`).

httpd uses the index to resolve a sorted or matched set of `rid`s, then builds
each repo's full response from storage.

### `issues`

One document per issue in every indexed repo. Full Collaborative Object (COB)
JSON, stored as a string in the `cob` field, plus extracted `title`,
`description`, `comments`, and `dids` for full-text search. Filterable on `rid`,
`state`, and `dids`. Sortable on `timestamp`.

### `patches`

One document per patch in every indexed repo. Full COB JSON, stored as a string
in the `cob` field, plus extracted `title`, `description`, `comments`, and
`dids`. Filterable on `rid`, `state`, and `dids`. Sortable on `timestamp`.

### `releases`

The `releases` index carries each release Collaborative Object (COB) with its
tag/commit text, artifact names and URLs, and participant DIDs, plus two view
flags (`creatorIsDelegate`, `redacted`) that radicle-httpd applies as filters.

### `nodes`

One document per known node. `alias` is searchable; `nid` is filterable.

### `policies`

A full mirror of this node's seeding-policy table, including block entries.
Contains the RIDs of all repos in the policy store — including private and
blocked ones. This is the same data the public policies endpoint already serves,
so no new information is exposed.

### `inventory`

Per-node seeded-repo lists, one document per node whose inventory has been
announced.

## How it stays up to date

1. **Bootstrap.** On startup and after every event-stream reconnect, the daemon
   walks the storage tree end-to-end and reconciles all seven indexes.
2. **Real time.** Subscribes to the node's control socket (same stream as
   `rad node events`) and reacts to:
   - `RefsFetched`, `LocalRefsAnnounced`, `CanonicalRefUpdated`, `RefsSynced` →
     re-index the affected repo, its issues, patches and releases.
   - `SeedDiscovered`, `SeedDropped` and `RefsAnnounced` are ignored; the
     seeding count the seed events affect is refreshed by the periodic rescan,
     and the content changes a ref announcement precedes arrive as
     `RefsFetched`.
   - `NodeAnnounced` → upsert the node document.
   - `InventoryAnnounced` → replace the inventory document for that node.

   Affected repos are collected and re-indexed together every
   `RADICLE_SEARCH_BATCH_SECS` (default 30s), so a burst of events for the same
   repo costs a single re-index.

3. **Periodic rescan.** Every `RADICLE_SEARCH_RESCAN_SECS` (default 1h) as a
   safety net for missed events.

## Live tests

`src/live_test.rs` covers filtering/reads, the pagination cap, schema-version
and not-found handling, unseed purging, and timeout/connection error mapping
against a real, locally-spawned Meilisearch instance, rather than mocking the
engine. Run them with `npm run test:live-search` from `explorer/` (equivalent to
`cargo test -p radicle-search -- --ignored --test-threads=1` after
`./scripts/install-binaries`); they're `#[ignore]`d, so a plain `cargo test`
skips them.

## Setup

### 1. Install Meilisearch

Follow the official installation guide:
<https://www.meilisearch.com/docs/learn/getting_started/installation>

The simplest path on Linux is the install script:

```sh
curl -L https://install.meilisearch.com | sh
```

This drops a single self-contained `meilisearch` binary in the current
directory. Move it onto your `$PATH` (e.g. `~/.local/bin/`).

Run it:

```sh
meilisearch \
  --http-addr 127.0.0.1:7700 \
  --db-path ~/.meilisearch/data \
  --no-analytics
```

For production set a master key with `--master-key <KEY>` and run with
`--env production`; see the Meilisearch docs for hardening guidance.

### 2. Build and run radicle-search

`radicle-search` is a member of the Cargo workspace rooted at the repository
root (it lives under `crates/`), so build it from there. Cargo places the binary
in the workspace-wide `target/`, not under this crate's directory:

```sh
cargo build --release -p radicle-search
./target/release/radicle-search
```

The daemon picks up the Radicle profile from `RAD_HOME` and the node control
socket from `RAD_SOCKET` (or their defaults). On first launch it bootstraps all
seven indexes in a few seconds, then listens for node events.

### 3. Point httpd at the index

Set `RADICLE_SEARCH_URL` (plus optional friends) before launching httpd:

```sh
RADICLE_SEARCH_URL=http://127.0.0.1:7700 radicle-httpd
```

On boot httpd logs `search backend enabled: url=… index=repos`. With the env var
absent, httpd works exactly as before.

## Configuration

All via environment variables:

| Variable                                | Default                       | Purpose                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RADICLE_SEARCH_MEILI_URL`              | `http://localhost:7700`       | Meilisearch instance to connect to.                                                                                                                                                          |
| `RADICLE_SEARCH_MEILI_KEY`              | _(none)_                      | Meilisearch master key (production mode).                                                                                                                                                    |
| `RADICLE_SEARCH_INDEX_PREFIX`           | _(none)_                      | Prefix prepended to each index name (e.g. `prod-` → `prod-repos`, `prod-issues`, …). When unset, index names are `repos`, `issues`, `patches`, `releases`, `nodes`, `policies`, `inventory`. |
| `RADICLE_SEARCH_RESCAN_SECS`            | `3600`                        | Interval between safety-net full rescans.                                                                                                                                                    |
| `RADICLE_SEARCH_RECONNECT_BACKOFF_SECS` | `5`                           | Delay before reconnecting after an event-stream disconnect.                                                                                                                                  |
| `RADICLE_SEARCH_BATCH_SECS`             | `30`                          | Interval at which repos touched by node events are re-indexed.                                                                                                                               |
| `RAD_HOME`                              | `~/.radicle`                  | Standard Radicle profile path.                                                                                                                                                               |
| `RAD_SOCKET`                            | `$RAD_HOME/node/control.sock` | Standard node control socket.                                                                                                                                                                |

httpd reads a parallel set to decide, at runtime, whether to use the index:

| Variable                      | Default  | Purpose                                                                                                                                                                                            |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RADICLE_SEARCH_URL`          | _(none)_ | Meilisearch instance httpd queries. **Unset disables search** — httpd serves listings and search from its storage walk.                                                                            |
| `RADICLE_SEARCH_KEY`          | _(none)_ | Meilisearch API key.                                                                                                                                                                               |
| `RADICLE_SEARCH_INDEX_PREFIX` | _(none)_ | Prefix prepended to each index name (e.g. `prod-` → `prod-repos`); must match the daemon's prefix. When unset, index names are `repos`, `issues`, `patches`, etc.                                  |
| `RADICLE_SEARCH_TIMEOUT_MS`   | `500`    | Per-query timeout in milliseconds (must be a non-zero integer).                                                                                                                                    |
| `RADICLE_HTTPD_SOURCE`        | `sqlite` | Data source for derived state: `sqlite` (default) or `meilisearch`. In meilisearch mode httpd reads only git storage and the seven indexes; SQLite is never opened; requires `RADICLE_SEARCH_URL`. |

Use the same URL and key in both processes. A single `radicle-httpd` binary
handles both modes — no build-time feature flag is involved. In the default
`sqlite` mode, when `RADICLE_SEARCH_URL` is unset or a query to the backend
fails or times out, httpd transparently falls back to the storage walk. In
`meilisearch` mode there is no fallback: index-backed endpoints return 503 until
the backend recovers.

## Migrating from a custom `RADICLE_SEARCH_INDEX_NAME`

Earlier versions exposed a single `RADICLE_SEARCH_INDEX_NAME` variable for the
repos index. That variable is now `RADICLE_SEARCH_INDEX_PREFIX`, and both
`radicle-search` and `radicle-httpd` use it to reference all seven indexes.

If you were running with a non-default index name (e.g.
`RADICLE_SEARCH_INDEX_NAME=my-repos`), update as follows:

- **Daemon:** replace `RADICLE_SEARCH_INDEX_NAME=my-repos` with
  `RADICLE_SEARCH_INDEX_PREFIX=my-` so the daemon writes to `my-repos`,
  `my-issues`, `my-patches`, etc.
- **httpd:** replace `RADICLE_SEARCH_INDEX_NAME=my-repos` with
  `RADICLE_SEARCH_INDEX_PREFIX=my-` so httpd queries the same prefixed indexes.

Without this change the daemon and httpd will use mismatched index names — a
silent mismatch where search returns no results.
