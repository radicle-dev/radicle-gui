# radicle-explorer

The Svelte web app for browsing Radicle repositories, its TypeScript HTTP
client, and the `radicle-httpd` and `radicle-search` backends it talks to.

The project lives in `explorer/` of the radicle-gui monorepo. It is its own
npm package and Cargo workspace: run every command here from `explorer/`,
and all paths in this file are relative to it. Conventions shared with
desktop are in the root `AGENTS.md`.

## Checks and linting (tsc, svelte-check, eslint, prettier)

```sh
npm run check
npm run format          # auto-fix prettier issues
```

## Unit tests

```sh
npm run test:unit
npm run test:http-client:unit
```

## E2E tests

```sh
npm run test:e2e -- --project chromium
npm run test:e2e -- tests/e2e/<file>.spec.ts --project chromium
```

`SKIP_SETUP=true` skips fixture creation for faster iteration.
Only use it when you are solely editing `.spec.ts` files and fixtures
already exist from a previous full run. Any change to app code, httpd,
or test fixtures requires a full run.

```sh
SKIP_SETUP=true npm run test:e2e -- --project chromium
```

## Rust backend (`crates/`)

The same commands CI runs:

```sh
RUSTFLAGS="-D warnings" cargo clippy --workspace --all-features --tests
RUSTFLAGS="-D warnings" cargo clippy -p radicle-httpd --no-default-features --tests
cargo fmt --all -- --check
cargo test --workspace --all-features
cargo test -p radicle-httpd
```

E2E and http-client tests run against a stable pre-built httpd by
default. When changing `crates/radicle-httpd/`, also test against the
local build and run both to verify backwards compatibility:

```sh
npm run test:e2e:local -- --project chromium
npm run test:http-client:unit:local
```

## API changes across layers

Adding or changing an API endpoint typically touches three layers:
1. `crates/radicle-httpd/` — Rust handler (add route, types, logic)
2. `http-client/` — TypeScript client (add fetch function, types)
3. `src/` — Svelte UI (consume the new data)

**Backwards compatibility:** Only add to the backend API — never rename
or remove fields/endpoints unless explicitly deprecating. The frontend
must handle older nodes gracefully: treat new API fields as optional
and fall back when they're absent. Put that fallback in
`http-client/lib/compat.ts`, tagged with the date it can go
(`Client: remove after 2027-03-14.`). Breaking changes
go through expand and contract, see
`docs/adr/0001-expand-and-contract-api-changes.md`, and get an entry in
`docs/api-changes.md`.

## Pre-push checklist

`npm run check:ci` runs the checks, unit, http-client, e2e and build smoke
tests from the GitHub workflows, and stops at the first failure. It logs
each step's output, duration and exit code to `tests/tmp/check-ci.log`. If
Rust code changed, also run the Rust commands and the `:local` variants
above.

## Svelte components

- Optional props use `export let foo: T = undefined`, not `?:`

## `{@html}` and untrusted data (XSS)

- Avoid `{@html}` with backend-derived data (branch/ref names, aliases,
  descriptions); when unavoidable, its argument must be DOMPurify-sanitized
  (`sanitizeConfig` in `src/lib/markdown.ts`) or built from `escape()`'d
  parts, in the component that renders it.

## TypeScript / HTTP client

- Derive types from Zod schemas (`z.infer<typeof fooSchema>`), never
  hand-write interfaces that duplicate a schema
- Schema naming: `fooSchema` (camelCase + Schema suffix) → type `Foo`
- API timestamps are in seconds; multiply by 1000 for JS `Date`
- Relative imports inside `http-client/` use `.js` extension (ESM)
