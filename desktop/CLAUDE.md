# radicle-desktop

Tauri desktop app for Radicle. Svelte 5 frontend communicates with a Rust
backend via Tauri IPC commands. TypeScript types are generated from Rust
structs using ts-rs (`crates/radicle-types/`).

## Tech stack

- Svelte 5 with runes syntax (`$state`, `$derived`, `$props`, `$effect`)
- TypeScript, Vite, Vitest, Playwright
- Path aliases: `@app` (src), `@bindings` (crates/radicle-types/bindings), `@tests`

## Commands

### Development

```sh
npm run tauri dev       # full Tauri dev build with hot reload
npm run start:http      # test-http-api backend on :8081 (no Tauri runtime)
npm start               # Vite dev server; in a browser it talks to test-http-api
```

Set `VITE_LOG_INVOKE_TIMINGS=true` to log each command's duration
(`[invoke] <command> <ms>ms`) to the browser console. It is off by default.

### Checks and linting

```sh
npm run check           # svelte-check, eslint, prettier, then scripts/check-rs
npm run format          # auto-fix prettier issues
```

### Unit tests

```sh
npm run test:unit
```

DOMPurify does not sanitize under happy-dom (the unit-test environment):
`<script>` and `onerror=` pass through, and `setConfig` allowlists are
ignored. Don't assert sanitization in `tests/unit/`; verify it in the real
app or in an E2E test.

### E2E tests

```sh
npm run test:e2e
npm run test:e2e -- tests/e2e/<file>.spec.ts
```

Run `./scripts/install-binaries` once after cloning and whenever the Radicle
binaries are updated.

Peer keys have no passphrase, so the app authenticates without an
ssh-agent. Tests that need a running node use the `peer` fixture; tests that
need an ssh-agent use the `sshAuthSock` fixture and create a peer with a
`passphrase`. When a fixture depends on one peer seeing another's changes,
wait for the node event with `waitForEvent` instead of sleeping.
Reload pages with `reload(page)` from `@tests/support/fixtures.js`, not
`page.reload()`, and navigate a page that already shows the app with
`goto(page, url)`: the app polls the backend, and the harness would otherwise
fail the test on the request the navigation cancels.

Tests run against a production build in `tests/tmp/build`, served by
`vite preview`; the build takes a few seconds at startup. Set
`E2E_DEV_SERVER=1` to run against the Vite dev server instead, e.g. for hot
reload while writing tests.

Each run writes `tests/artifacts/results.json` (Playwright's JSON report)
and per-test logs in `tests/artifacts/<test>/`. Read those to see what
failed in a run someone else started.

`SKIP_FIXTURE_CREATION=true` skips fixture creation for faster iteration.
Only use it when you are solely editing `.spec.ts` files and fixtures
already exist from a previous full run. Any change to app code, the Rust
backend, or test fixtures requires a full run.

```sh
SKIP_FIXTURE_CREATION=true npm run test:e2e
```

### Rust backend (`crates/`)

```sh
scripts/check-rs    # cargo fmt --check, clippy on all targets, test
```

### Regenerate TypeScript bindings

Run after changing any type annotated with `#[derive(TS)]` in
`crates/radicle-types/`, and commit the regenerated bindings:

```sh
npm run generate-types
```

### Changes across layers

Adding or changing a Tauri command touches these layers in order:

1. `crates/radicle-types/src/` — add/update Rust types with `#[derive(TS)]` and
   `#[ts(export)]`, run `npm run generate-types` to update `@bindings`
2. `crates/radicle-types/src/traits/` — add the method to the relevant port trait;
   default implementation goes here, not in the command handler
3. `crates/radicle-tauri/src/commands/` — add the `#[tauri::command]` handler
   (thin wrapper: `ctx.method()`), register in `crates/radicle-tauri/src/lib.rs`
4. `crates/test-http-api/src/` — mirror the same route so E2E tests keep working;
   `cargo test -p test-http-api --test parity` fails until you do. A command
   that can't work over HTTP goes in `TAURI_ONLY` in
   `crates/test-http-api/tests/parity.rs`, with the reason
5. `src/` — call via `invoke<T>("command_name", args)`, import types from `@bindings`

### Tests for a feature

When adding tests for a feature, go through `docs/testing-checklist.md` and
report which items are covered and which don't apply. The testing strategy is
in `docs/adr/0001-testing-strategy.md`.

### Pre-push checklist

`npm run check:ci` runs everything CI runs on every PR (checks, unit tests,
`install-binaries`, E2E tests) and stops at the first failure. It writes the
full output, with each step's duration and exit code, to
`tests/tmp/check-ci.log`.

## Backend architecture

Three crates in a hexagonal architecture; the reasoning is in
`docs/adr/0002-backend-architecture.md`.

- `radicle-types` — domain types, ports (`src/traits/`), domain services
  (`src/domain/`), the SQLite adapter (`src/outbound/`), ts-rs bindings
- `radicle-tauri` — Tauri driver; `AppState` implements the ports
- `test-http-api` — HTTP driver for E2E tests and `npm run start:http`;
  `Context` implements the same ports

Ports have full default implementations, so a driver only implements
`Profile`. Paginated list views (issues, patches, notifications) go through
a domain `Service` backed by the SQLite adapter instead of the ports; new
lists over large data sets should do the same.

## Domain glossary

- **NID** — Node ID, the public key in a DID (`did:key:z6Mk...`)
- **COB** — Collaborative Object (issue, patch, or identity as a Git DAG)
- **Delegate** — authorized repo maintainer; signatures determine canonical state
- **Seed** — hosting/replicating a repo; seed nodes are always-on servers
- **Canonical refs** — branches/tags resolved by delegate quorum

## Code conventions

- Prefer `undefined` over `null`
- Do not add comments unless explicitly asked. When writing comments,
  use proper English sentences
- Ask before adding new dependencies
- When proposing a bigger architectural change, record it as a new ADR in
  `docs/adr/`, numbered after the last one and in the same format

### Svelte components

- Props use `$props()`: `const { foo, bar = undefined }: Props = $props()`
- CSS: scoped styles with design tokens (`var(--color-text-primary)`,
  `var(--txt-body-m-regular)`, `var(--border-radius-sm)`); use `:global()`
  for styling slotted or `{@html}` content
- Loading states: `{#await promise}` blocks for inline async;
  local `loading` boolean with `try/catch` for imperative fetches

### TypeScript

- Import backend types from `@bindings/*` — these are generated by ts-rs, never
  hand-write interfaces that duplicate them
- Use ES private fields (`#field`), not the TypeScript `private` keyword
- Call Tauri commands via `invoke<T>("command_name", { arg })` from `@app/lib/invoke`

### Rust backend

- All serialized types live in `crates/radicle-types/src/`; annotate new types
  with `#[derive(Serialize, TS)]`, `#[serde(rename_all = "camelCase")]`,
  `#[ts(export)]`, and `#[ts(export_to = "<dir>/")]`
- Optional fields: `#[serde(skip_serializing_if = "Option::is_none")]`
- Error type: `radicle_types::error::Error`
- `rust-toolchain.toml` tracks heartwood's. When bumping the `radicle` crate,
  check heartwood's toolchain too: an older rustc fails inside the dependency
  with a confusing error (e.g. E0382 in `cob/identity.rs` for radicle 0.25)

## Commit messages

- Imperative mood: "Add feature" not "Added feature"
- Capitalize subject, no trailing period, max 50 chars

## Do NOT

- Do not use `npm test` — no default test script exists
- Do not use `yarn` or `pnpm` — use npm
- Do not use `npx vitest` or `npx playwright test` — use the `npm run` scripts
