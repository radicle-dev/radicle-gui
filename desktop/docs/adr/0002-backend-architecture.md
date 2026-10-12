# 2. Backend architecture

Date: 2026-10-01

## Status

Accepted

## Context

The app needs the same backend behaviour in two places: inside Tauri for
the desktop app, and over HTTP so the frontend can run in a browser for E2E
tests and development without the Tauri runtime. If each runtime held its
own logic, the two would drift and the E2E tests would stop exercising the
code users run.

Most reads and writes go straight through the `radicle` crate. Some list
views can't: reading patches, issues and notifications through heartwood's
caches loads and sorts every item in memory on each page, which is too slow
for large repositories.

This ADR records a design that grew from 2024 onwards (the HTTP driver in
October 2024, the first domain service for the inbox in January 2025).

## Decision

The backend follows a hexagonal architecture split across three crates:

| Crate           | Role                                                       |
| --------------- | ---------------------------------------------------------- |
| `radicle-types` | Domain types, ports, adapters and the ts-rs bindings       |
| `radicle-tauri` | Tauri driver: thin IPC wrappers around port methods        |
| `test-http-api` | Axum driver: the same ports exposed as HTTP routes         |

Both drivers depend on `radicle-types` and share no code with each other.

**Ports with default implementations.** Each port is a trait in
`radicle-types/src/traits/` whose methods have full default
implementations built on `Profile::profile()`. A driver gets the whole
behaviour by implementing `Profile` and declaring empty `impl` blocks, so
`AppState` (Tauri) and `Context` (HTTP) behave identically by construction.
Business logic goes in these defaults, never in a command handler or route.

**Domain services for hot reads.** Where going through `radicle` is too
slow, a module in `radicle-types/src/domain/` defines its own storage port
and a generic `Service` over it. The `Sqlite` adapter in `src/outbound/`
implements those ports by querying Radicle's COB cache and notifications
database directly (read-only). Both drivers construct the services at
startup and use them for the matching list endpoints; everything else
keeps going through the ports. Releases are the exception: `radicle-artifact`
keeps its own SQLite cache of release COBs, so `list_releases` reads through
that instead of a domain service.

**Parity is enforced.** Every Tauri command has a matching HTTP route.
`cargo test -p test-http-api --test parity` fails when a command, route or
frontend `invoke` has no counterpart, unless the command is listed in
`TAURI_ONLY` with a reason.

**Moving away from radicle-surf.** Repository browsing (trees, commit
history, diff structure) still goes through `radicle-surf`, and we intend
to replace it with our own code in `radicle-types`. Surf may not be
maintained in the long run, and we want finer control over performance and
features: the slow paths (diff stats, opening files, commit counts) already
bypass it with the `git` binary or `git2`. Owning this code behind a narrow
interface would also let us swap the git backend later, for example to
gitoxide. Surf is read-only and does no verification; trust comes from the
signed refs that `radicle` resolves before surf reads anything, so the
replacement doesn't have to preserve any security property. This is not
scheduled yet.
