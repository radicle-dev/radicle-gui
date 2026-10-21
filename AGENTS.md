# radicle-gui

Monorepo for Radicle's graphical interfaces. It holds two independent
projects, each with its own npm package, Cargo workspace, toolchain files,
checks and conventions:

- **Explorer** (`explorer/`): the Svelte web app for browsing Radicle
  repositories, its TypeScript HTTP client, and the `radicle-httpd` and
  `radicle-search` backends it talks to. See `explorer/AGENTS.md`.
- **Desktop** (`desktop/`): the Tauri desktop app. See `desktop/AGENTS.md`.

This file covers what applies to both. Each project's `AGENTS.md` is the
source of truth for anything inside it.

## Layout

| Path | What it is |
|---|---|
| `explorer/` | Web app, HTTP client, `radicle-httpd` and `radicle-search` |
| `desktop/` | Tauri app: Svelte frontend in `src/`, Rust in `crates/` |
| `docs/adr/` | Decisions that affect the whole repository |
| `.github/workflows/` | GitHub CI: `explorer-*.yml` for explorer, `desktop-*.yml` for desktop |
| `.buildkite/` | Radicle CI pipelines (explorer only) |
| `.ryph/` | Dev machine image and setup for agents, see `.ryph/environment.md` |

## Working in this repo

- Work out which project a change belongs to first, and run every command
  from that project's directory. There are no root `npm` or `cargo`
  commands.
- A change that touches both projects is two changes: check each project
  with its own commands.
- Explorer's components use legacy Svelte syntax (`$:`, stores,
  `export let`), desktop's use Svelte 5 runes.
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
- Use npm, never `yarn` or `pnpm`: the lockfiles and `.npmrc` settings are
  npm's
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
