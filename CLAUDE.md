# radicle-gui

Monorepo for Radicle's graphical interfaces. It holds two independent
projects, each with its own npm package, Cargo workspace, toolchain files,
checks and conventions:

- **Explorer** (repository root): the Svelte web app for browsing Radicle
  repositories, its TypeScript HTTP client, and the `radicle-httpd` and
  `radicle-search` backends it talks to.
- **Desktop** (`desktop/`): the Tauri desktop app. Its own `desktop/CLAUDE.md`
  is the source of truth for anything under `desktop/`.

## Layout

| Path | Project | What it is |
|---|---|---|
| `src/`, `public/`, `tests/` | explorer | Svelte web app and its unit, e2e and visual tests |
| `http-client/` | explorer | TypeScript client for the httpd API |
| `crates/radicle-httpd/` | explorer | HTTP daemon serving the API (Rust), with its own `CLAUDE.md` for code conventions |
| `crates/radicle-search/` | explorer | Search service, released together with httpd (Rust) |
| `workers/` | explorer | Cloudflare workers (open-graph images) |
| `scripts/` | explorer | Check, CI and e2e helper scripts |
| `desktop/` | desktop | Tauri app: Svelte frontend in `desktop/src/`, Rust in `desktop/crates/` |
| `.github/workflows/` | both | GitHub CI: `explorer-*.yml` for explorer, `desktop-*.yml` for desktop |
| `.buildkite/` | explorer | Radicle CI pipelines |
| `.ryph/` | both | Dev machine image and setup for agents, see `.ryph/environment.md` |

## Working in this repo

- Work out which project a change belongs to first, and run every command
  from that project's root: the repository root for explorer, `desktop/`
  for desktop. Root `npm` and `cargo` commands never cover `desktop/`, and
  the root lint and format checks skip it on purpose.
- The two projects don't share code. A change that touches both is two
  changes: check each project with its own commands.
- The rules under "Explorer" below don't apply in `desktop/`. In particular,
  explorer uses legacy Svelte syntax while desktop uses Svelte 5 runes.

### Plan mode

- Propose the minimal MVP first — no tests, no docs, no speculative extras
- Tests are added only when explicitly requested after MVP review
- Keep plans concise: short bullet points listing what changes and where
- Skip obvious details and boilerplate explanations

### Shared conventions

- Prefer `undefined` over `null`
- Do not add comments unless explicitly asked. When writing comments,
  use proper English sentences
- Ask before adding new dependencies
- Use npm, never `yarn` or `pnpm`
- Do not use `npm test` — neither project has a default test script
- Do not use `npx vitest` or `npx playwright test` — use the `npm run` scripts

### Commit messages

- Imperative mood: "Add feature" not "Added feature"
- Capitalize subject, no trailing period, max 50 chars
- Prefix backend-only commits with `httpd:`

### Releases and tags

Each project is released on its own. Release tags are
`releases/<component>/<version>`; the `refs/tags/releases/*` rule in the
repository's identity decides when they become canonical.

| Component | How it's released | Tag |
|---|---|---|
| Explorer web app | Deployed continuously, no releases or tags | — |
| `radicle-httpd` + `radicle-search` | Together, one version, see `RELEASE.md` | `releases/httpd/<version>` |
| Desktop app | `desktop/scripts/release`, see `desktop/README.md` | `releases/desktop/<version>` |

The older `releases/<version>` tags (httpd 0.22.0–0.29.0, desktop
0.9.0–0.16.0) are left over from before the two repositories were merged.
Never create, match or describe against them; scripts must always match a
component's own prefix.

### Radicle ecosystem (sibling repos)

See the `radicle-ecosystem` skill for the map of sibling repositories
(heartwood, radicle-git, radicle-job, rips, radicle.dev) and the key
crates and files in each.

### Domain glossary

- **RID** — Repository ID (`rad:z3gqc...`)
- **DID** — Decentralized Identifier, user identity (`did:key:z6Mk...`)
- **NID** — Node ID, public key suffix of a DID
- **COB** — Collaborative Object (issue, patch, or identity as a Git DAG)
- **Delegate** — authorized repo maintainer; signatures determine canonical state
- **Patch** — pull-request equivalent with immutable revisions and reviews
- **Seed** — hosting/replicating a repo; seed nodes are always-on servers
- **Canonical refs** — branches/tags resolved by delegate quorum

## Explorer (repository root)

Everything in this section applies to the repository root only. Run all
commands from there.

### Tech stack

- Svelte 5 with legacy syntax (`$:`, stores, `export let`). Do not use
  Svelte 5 runes (`$state`, `$derived`, `$props`) here
- TypeScript, Vite, Vitest, Playwright, Zod
- Rust for `crates/radicle-httpd` and `crates/radicle-search`

### Checks and linting (tsc, svelte-check, eslint, prettier)

```sh
npm run check
npm run format          # auto-fix prettier issues
```

### Unit tests

```sh
npm run test:unit
npm run test:http-client:unit
```

### E2E tests

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

### Rust backend (`crates/`)

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

### API changes across layers

Adding or changing an API endpoint typically touches three layers:
1. `crates/radicle-httpd/` — Rust handler (add route, types, logic)
2. `http-client/` — TypeScript client (add fetch function, types)
3. `src/` — Svelte UI (consume the new data)

**Backwards compatibility:** Only add to the backend API — never rename
or remove fields/endpoints unless explicitly deprecating. The frontend
must handle older nodes gracefully: treat new API fields as optional
and fall back when they're absent.

### Pre-push checklist

`npm run check:ci` runs everything below except the `:local` variants, plus
the build smoke test, from the GitHub workflows, and stops at the first
failure. It logs each step's output, duration and exit code to
`tests/tmp/check-ci.log`.

1. `npm run check`
2. `npm run test:unit`
3. `npm run test:http-client:unit`
4. `npm run test:e2e -- --project chromium`
5. If Rust code changed: clippy, fmt, cargo test (see above),
   plus `:local` variants of e2e and http-client tests

### Svelte components

- Script order (enforced by prettier): `<script context="module">`,
  `<script lang="ts">`, `<style>`, markup
- Optional props use `export let foo: T = undefined`, not `?:`
- CSS: scoped styles with design tokens (`var(--color-text-primary)`,
  `var(--txt-body-m-regular)`, `var(--border-radius-sm)`); use `:global()`
  for styling slotted or `{@html}` content
- Loading states: `{#await promise}` blocks for inline async;
  local `loading` boolean with `try/catch` for imperative fetches

### `{@html}` and untrusted data (XSS)

- Avoid `{@html}` with backend-derived data (branch/ref names, aliases,
  descriptions); when unavoidable, its argument must be DOMPurify-sanitized
  (`sanitizeConfig` in `src/lib/markdown.ts`) or built from `escape()`'d
  parts, in the component that renders it.

### TypeScript / HTTP client

- Derive types from Zod schemas (`z.infer<typeof fooSchema>`), never
  hand-write interfaces that duplicate a schema
- Schema naming: `fooSchema` (camelCase + Schema suffix) → type `Foo`
- Use ES private fields (`#field`), not the TypeScript `private` keyword
- API timestamps are in seconds; multiply by 1000 for JS `Date`
- Relative imports inside `http-client/` use `.js` extension (ESM)

## Desktop (`desktop/`)

See `desktop/CLAUDE.md`. In short: Tauri with a Svelte 5 frontend that uses
runes, a hexagonal Rust backend in `desktop/crates/`, and its own checks
(`npm run check:ci` from `desktop/`).
