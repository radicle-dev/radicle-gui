# Testing checklist

Go through this list for every feature or bug fix. Tick an item when it's
covered, or say in the commit or patch description why it doesn't apply.
The strategy behind it is in [ADR 1](adr/0001-testing-strategy.md).

## Bug fixes

- [ ] The fix comes with a regression test that fails without it, written
      at the cheapest layer that reproduces the bug.

## Unit (`tests/unit/`)

- [ ] New or changed pure logic in `src/lib/` has unit tests.
- [ ] Non-trivial logic that was added inside a component (filtering,
      grouping, sorting, parsing) has been moved into `src/lib/` and tested.
      One-line helpers with a single caller stay where they are.
- [ ] Tests assert behaviour, not UI copy, CSS, selector strings or copies
      of constant tables.
- [ ] Each new test was seen to fail when the logic it covers was broken.
- [ ] Edge cases are covered: empty input, a single item, invalid input,
      boundaries.
- [ ] New routes or URL parameters are covered by the router round-trip
      tests.
- [ ] New `localStorage` schemas have tests for their defaults and for
      invalid stored values.

## Rust (`crates/`)

- [ ] New logic in trait default implementations or type conversions has a
      `#[test]`.
- [ ] New error variants are tested, as the frontend matches on error codes.

## E2E (`tests/e2e/`)

- [ ] A new Tauri command has a matching route in `crates/test-http-api`
      (enforced by `cargo test -p test-http-api --test parity`).
- [ ] A new write path, meaning any command that changes a COB, a repo or
      the node's state, has a happy-path E2E test, even when its logic is
      unit-tested in `src/lib/`.
- [ ] Actions limited to authors or delegates have a test for the user who
      isn't allowed.
- [ ] New persisted UI state survives a reload.
- [ ] New keyboard shortcuts are exercised at least once.

## Manual

- [ ] Native-only behaviour (dialogs, clipboard, drag and drop, dock badge,
      ssh-agent) has been checked in a real `npm run tauri dev` build.
