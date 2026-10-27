# radicle-gui

Monorepo for Radicle's graphical interfaces. It holds two projects, each with
its own Cargo workspace, toolchain files, checks and conventions, and the UI
code they share. One npm workspace at the root holds all three packages:

- **Explorer** (`explorer/`): the Svelte web app for browsing Radicle
  repositories, its TypeScript HTTP client, and the `radicle-httpd` and
  `radicle-search` backends it talks to. See `explorer/AGENTS.md`.
- **Desktop** (`desktop/`): the Tauri desktop app. See `desktop/AGENTS.md`.
- **Shared UI** (`shared/ui/`): the `@radicle-gui/ui` package with Svelte
  components, helpers, design tokens and fonts used by both apps. See
  `shared/ui/AGENTS.md`.

This file covers what applies to both. Each project's `AGENTS.md` is the
source of truth for anything inside it.

## Layout

| Path | What it is |
|---|---|
| `explorer/` | Web app, HTTP client, `radicle-httpd` and `radicle-search` |
| `desktop/` | Tauri app: Svelte frontend in `src/`, Rust in `crates/` |
| `shared/ui/` | UI code shared by both apps |
| `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc` | The npm workspace, its lockfile and npm and Node settings |
| `docs/adr/` | Decisions that affect the whole repository |
| `.github/workflows/` | GitHub CI: `explorer-*.yml` for explorer, `desktop-*.yml` for desktop, `shared-ui.yml` for the shared UI |
| `.buildkite/` | Radicle CI pipelines (explorer only) |
| `.ryph/` | Dev machine image and setup for agents, see `.ryph/environment.md` |

## Working in this repo

- Install npm dependencies at the root: `npm ci` for everything, or
  `npm ci -w explorer` or `npm ci -w desktop` for one app. Run every other
  command from the project's directory; there are no root `cargo` commands.
- Work out which project a change belongs to first. Changes to `shared/ui`
  affect both apps: check `shared/ui` and both apps.
- A change that touches both projects is two changes: check each project
  with its own commands.
- Explorer's components use legacy Svelte syntax (`$:`, stores,
  `export let`), desktop's and the shared ones use Svelte 5 runes.
- Code in `shared/ui` must not import `@tauri-apps/*`, `@bindings`,
  `@http-client` or anything else from one app. It takes plain props, and
  each app adapts its own data to them.
- Record a bigger architectural change as a new ADR, numbered after the last
  one and in the same format: in `docs/adr/` if it affects the whole
  repository, in the project's own `docs/adr/` otherwise.
- Before opening a patch or tagging a release, read `CONTRIBUTING.md` for
  patch labels and release tags. Never create or match the old
  `releases/<version>` tags; they predate the monorepo.

## Shared conventions

- Prefer `undefined` over `null`
- Do not add comments unless explicitly asked. When writing comments,
  use proper English sentences
- Ask before adding new dependencies: each one is a supply-chain risk, and
  installs are gated by `min-release-age` and `strict-allow-scripts`
- Use npm, never `yarn` or `pnpm`: the lockfile and `.npmrc` settings are
  npm's
- Updates and audit fixes must respect each project's 7-day cooldown, see
  "Updating dependencies" below
- Run tests through the `npm run` scripts, not `npm test` (neither project
  has one), `npx vitest` or `npx playwright test`: the scripts set `TZ=UTC`
  and, in explorer, `NODE_CONFIG_ENV`, which the tests rely on
- Use ES private fields (`#field`), not the TypeScript `private` keyword

### Svelte components

- CSS: scoped styles with design tokens (`var(--color-text-primary)`,
  `var(--txt-body-m-regular)`, `var(--border-radius-sm)`); use `:global()`
  for styling slotted or `{@html}` content
- Loading states: `{#await promise}` blocks for inline async;
  local `loading` boolean with `try/catch` for imperative fetches

## Updating dependencies

Both projects only install releases that are at least 7 days old: npm through
`min-release-age` in the root `.npmrc`, Cargo through `cooldown.toml` and
`cargo-cooldown`. npm commands cover the whole workspace and change the root
lockfile; run Cargo commands from the project's directory:

```sh
npm audit                         # list advisories
npm audit fix                     # apply fixes that are past the cooldown
cargo audit                       # list advisories
cargo cooldown update -p <crate>  # update a crate within the cooldown
```

- Never run plain `cargo update`: it ignores `cooldown.toml`
- `katex` is pinned for the whole workspace by an override in the root
  `package.json`, so mermaid and both apps use one version. Bump it there as
  well as in the apps, or the apps' bump has no effect
- Never run `npm audit fix --force`: it takes major-version bumps. Ask first
- If a fix is still cooling down, report when it clears and ask before
  taking it early. Taking it early means reviewing the release's diff
  against the previous version, then:
  - npm: `npm install <pkg>@<version> -w <project> --min-release-age=0` at
    the root
  - Cargo: add an `[[allow.exact]]` entry to `cooldown.toml` with a comment
    naming the advisory and the date it can be removed

## Commit messages

- Imperative mood: "Add feature" not "Added feature"
- Capitalize subject, no trailing period, about 50 chars
- Prefix commits that touch a single component with it: `explorer:`,
  `httpd:` or `desktop:`, e.g. "desktop: Add release view". Commits that span
  most of the repository have no prefix
- Each commit should be understandable, testable and revertable on its own

## Radicle ecosystem (sibling repos)

Both projects build on crates from sibling repositories, which may be
checked out next to this one. If present, read their source when a type
comes from outside this repo or you need protocol context:

- `../heartwood`: the protocol. Crates `radicle`, `radicle-cob`,
  `radicle-crypto` and `radicle-core`. Start with `HACKING.md` and
  `ARCHITECTURE.md`
- `../radicle-git`: `radicle-surf`, the code browsing (files, diffs, commits)
  that httpd and desktop serve
- `../radicle-job`: CI job COBs
- `../rips`: protocol specs: `0001-heartwood.md`, `0002-identity.md`,
  `0003-storage-layout.md`
- `../radicle.dev`: user docs. `_guides/user.md` covers workflows,
  `_guides/protocol.md` covers gossip, replication and the COB model, and
  `_guides/seeder.md` covers seed nodes and httpd setup

## Domain glossary

- **RID** — Repository ID (`rad:z3gqc...`)
- **DID** — Decentralized Identifier, user identity (`did:key:z6Mk...`)
- **NID** — Node ID, the public key in a DID
- **COB** — Collaborative Object (issue, patch, or identity as a Git DAG)
- **Delegate** — authorized repo maintainer; signatures determine canonical state
- **Patch** — pull-request equivalent with immutable revisions and reviews
- **Seed** — hosting/replicating a repo; seed nodes are always-on servers
- **Canonical refs** — branches/tags resolved by delegate quorum
