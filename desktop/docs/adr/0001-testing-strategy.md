# 1. Testing strategy

Date: 2026-09-30

## Status

Accepted

## Context

The app has many features and few tests. We need a way to decide what to
test, at which layer, and in what order, without trying to reach full
coverage.

## Decision

Prioritise by risk: how bad a failure is (corrupt COB writes are worse than
wrong display), how likely it is (complex logic, churn, crossing the Rust/TS
boundary) and how hard it is to notice manually (multi-peer, caching,
timing).

Test each behaviour at the cheapest layer that can catch its failure:

| Layer    | Tool                          | Scope                                                                    |
| -------- | ----------------------------- | ------------------------------------------------------------------------ |
| TS unit  | Vitest, `tests/unit/`         | Pure logic: parsing, routing, formatting, filters, diff and review logic |
| Rust     | `cargo test`                  | Trait default implementations, type conversions, error codes            |
| E2E      | Playwright + `test-http-api`  | User journeys and every write path against a real Radicle profile       |
| Manual   | Tauri build                   | Native-only features: dialogs, clipboard images, drag and drop, badges  |

Rules:

- Unit tests come first because they are the cheapest.
- Every bug fix adds a regression test, at the cheapest layer that
  reproduces the bug, and the test fails without the fix.
- Non-trivial logic inside a component (branching, ordering, grouping,
  deduplication, parsing) is extracted into a module in `src/lib/` and
  tested there. A one-line helper with a single caller stays in the
  component. Comments that explain why the code is the way it is move with
  it.
- Tests assert behaviour: an outcome, a property or a relationship between
  inputs. They don't restate UI copy, CSS classes, selector strings or
  constant tables, since such tests only ever change in lockstep with the
  code.
- A test earns its place by failing when the logic it covers breaks. New
  tests are checked by mutating that logic (flip a comparison, drop a
  filter, shift a boundary), and a test that never fails is removed.
- Extracted logic is tested in isolation, so the component flow that wires
  it into a write path still needs its E2E test.
- Every mutating command gets at least one E2E happy path and one
  permission or error case. Reads are covered by unit tests plus one E2E
  test showing the data renders.
- Combinations such as filters and sort orders are covered in unit tests,
  not in E2E.
- State persisted in `localStorage` gets one reload test in E2E.
- Sanitisation is asserted in E2E only, since DOMPurify is a no-op under
  happy-dom.
- `test-http-api` mirrors every Tauri command. Logic lives in
  `radicle-types` so that both drivers stay thin wrappers, and a parity test
  fails when a command, route or frontend `invoke` has no counterpart.

New features follow [the testing checklist](../testing-checklist.md).

