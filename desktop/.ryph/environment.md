# radicle-desktop environment

This repository's `.ryph/Dockerfile` is the machine for the whole Radicle
workspace. On top of the universal image it adds:

- Tauri's system libraries (`libwebkit2gtk-4.1-dev`,
  `libjavascriptcoregtk-4.1-dev`, `libayatana-appindicator3-dev`,
  `librsvg2-dev`, `libxdo-dev`), so the Rust crates build here;
- the OS libraries Playwright's Chromium and WebKit need, and `bzip2`;
- `golangci-lint` v2.14.0 in `/usr/local/bin`, for garden-broker;
- `MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS=node,python,deno,bun`, so mise
  does not read a `go.mod` `go` line as a pin: Go is the image's own.
- `CARGO_PROFILE_DEV_DEBUG=line-tables-only`: dev and test builds carry
  line tables, not full debug info. Backtraces keep file and line. Do not
  override it, or every crate rebuilds.

`.ryph/setup.yml` installs the npm dependencies, Playwright's WebKit and the
pinned Radicle binaries (`tests/tmp/bin`), and warms clippy, the test build
and the e2e backend (`test-http-api`, `rad-job`) in `target/`. Node 24.15.0
(`.nvmrc`) and Rust 1.97.1 (`rust-toolchain.toml`) are installed by mise and
rustup on first use.

## Checks (what CI runs)

```sh
npm run check-js        # svelte-check, eslint, prettier
scripts/check-rs        # cargo fmt --check, clippy -Dwarnings, cargo test
npm run test:unit
npm run test:e2e        # WebKit; needs scripts/install-binaries, done by setup
```

`npm run check:ci` runs all of them in order and logs to
`tests/tmp/check-ci.log`. The machine has 2 CPUs: the Rust test build and the
e2e suite are the slow parts.

## What does not work here

- Chromium cannot be installed by Playwright: its download redirects to
  `storage.googleapis.com`, which the egress allowlist refuses. This app's
  e2e tests use WebKit only and are unaffected; radicle-explorer's and
  always-on-node's Chromium e2e tests are.
- There is no container runtime, so nothing that runs `docker` or `podman`
  works (always-on-node's `pnpm test:e2e`, garden-broker's integration tests).
