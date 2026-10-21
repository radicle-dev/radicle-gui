# Changelog

## radicle-httpd + radicle-search 0.29.0

- **Complete commit lists for merge-commit diffs**: The diff endpoint no longer stops the walk early when the head merges the target branch in, which reduced such patches to a single commit

## radicle-httpd + radicle-search 0.28.0

- **Releases API**: New `/repos/{rid}/releases` endpoints serve radicle-artifact release COBs, with Releases and Release views in the UI that degrade gracefully on older nodes
- **`Git-Protocol` header passed through**: Git HTTP routes forward the header to `git-http-backend`, fixing clients that require Git wire protocol version 2
- Updated `chacha20`, `h2` and `lru` to clear advisories reported by `cargo audit`

## radicle-httpd + radicle-search 0.27.0

- **Commit-count endpoint**: New `/repos/{rid}/stats/commits/{sha}` counts reachable commits from the commit-graph, avoiding the full history walk of `/stats/tree`
- **Diff-stats endpoint**: New `/repos/{rid}/diff/{base}/{oid}/stats` returns line counts without building hunks, 6–15x faster than `/diff`; it skips rename detection, so counts can differ slightly on renamed or copied files
- **Faster file browsing**: Blob requests no longer walk the whole history to find a file's last commit, which took seconds to minutes on large repositories
- **Repository reads off the async workers**: Synchronous libgit2 and COB reads run on the blocking pool, so one slow read no longer stalls queued requests
- **Repo aliases in the JSON and raw APIs**: `--alias` path segments resolve there too, not just on the git routes, and the repo endpoint exposes an optional `alias` field
- **Higher open-file limit**: Raised at startup, fixing spurious "missing object" errors in storage with thousands of packfiles
- **Empty job COBs excluded**: Job listings omit jobs with no runs
- **`RUST_LOG` in the default logger**: Honoured without the `logfmt` feature, defaulting to `info`
- Updated radicle crates, cargo dependencies and the Rust toolchain (1.97.1)

## radicle-httpd + radicle-search 0.26.0

- **Repository search**: New optional `radicle-search` indexing daemon backs a `/repos/search?q=…` endpoint for typo-tolerant search over repo names and descriptions, plus faster `/repos?sort=activity|seeding` listings; httpd falls back to its built-in storage walk when the daemon is absent, so existing behavior is unchanged
- **Git archive downloads**: Additional formats ZIP and TAR are now supported. Also, a prefix is added to the archive by default, which can be disabled by using the query `?prefix=false`. This query string is immediately deprecated. It only exists as a workaround for users to adapt their download scripts etc. to accommodate for the prefix. It will be removed in a future version.
- **Streaming archive downloads**: Archives are streamed to the client instead of being buffered in memory, avoiding excessive memory use on large repositories
- **Faster archive HEAD requests**: `HEAD` requests no longer build an archive that is then discarded
- **Streaming git operations**: Clone, fetch, and push stream request and response bodies and accept gzip-compressed requests, reducing memory use on large operations

## radicle-httpd 0.25.0

- **Canonical and peer refs in repo API**: The repo endpoint now exposes canonical refs and per-peer refs, letting clients discover branches and tags resolved by delegate quorum as well as those from individual nodes
- **Job COBs endpoint**: New `/repos/{rid}/jobs/{sha}` endpoint serves job collaborative objects, enabling clients to query CI/CD job state

## radicle-httpd 0.24.0

- **Windows support**: The HTTP daemon now runs on Windows with platform-specific adaptations
- **Faster API responses**: Improved `/node` endpoint performance
- **Git namespace paths**: Direct access to node ref namespaces via `/{rid}.git/{nid}/` remote URLs, simplifying clones and fetches from specific nodes
- Updated dependencies and internal improvements

## radicle-httpd 0.23.0

- **Live config reload**: Update configuration without restarting by sending a SIGHUP signal
