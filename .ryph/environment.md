# radicle-gui environment

This repository holds two projects: the explorer web app and `radicle-httpd`
in `explorer/`, and the desktop app in `desktop/`. Each has its own npm
package and Cargo workspace.

`.ryph/Dockerfile` is written as the machine for the whole Radicle
workspace, and a workspace builds only its environment repository's
Dockerfile: the description of the machine above says which one this run
is on. On top of the universal image it adds:

- Tauri's system libraries (`libwebkit2gtk-4.1-dev`,
  `libjavascriptcoregtk-4.1-dev`, `libayatana-appindicator3-dev`,
  `librsvg2-dev`, `libxdo-dev`), so the desktop crates build here;
- the OS libraries Playwright's Chromium and WebKit need, and `bzip2`;
- `golangci-lint` v2.14.0 in `/usr/local/bin`, for garden-broker;
- `MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS=node,python,deno,bun`, so mise
  does not read a `go.mod` `go` line as a pin: Go is the image's own.
- `CARGO_PROFILE_DEV_DEBUG=line-tables-only`: dev and test builds carry
  line tables, not full debug info. Backtraces keep file and line. Do not
  override it, or every crate rebuilds.

`.ryph/setup.yml` installs the npm dependencies and the pinned Radicle
binaries (`explorer/tests/tmp/bin`, `desktop/tests/tmp/bin`) for both projects,
Playwright's Chromium for the explorer and its WebKit for the desktop app.
At image build it warms clippy and the Rust test builds of both workspaces,
and the desktop e2e backend (`test-http-api`, `rad-job`), in
`explorer/target/` and `desktop/target/`. At run start it only reinstalls what the lockfiles
changed, and cargo builds what a command needs when it runs. Node 24.15.0
(`explorer/.nvmrc`, `desktop/.nvmrc`) and Rust 1.97.1
(`explorer/rust-toolchain`, `desktop/rust-toolchain.toml`) come from mise and
rustup.

## Checks (what CI runs)

Explorer and `radicle-httpd`, from `explorer/`:

```sh
npm run check
npm run test:unit
npm run test:http-client:unit
RUSTFLAGS="-D warnings" cargo clippy --workspace --all-features --tests
RUSTFLAGS="-D warnings" cargo clippy -p radicle-httpd --no-default-features --tests
cargo fmt --all -- --check
cargo test --workspace --all-features
cargo test -p radicle-httpd
npm run test:e2e -- --project chromium
```

`npm run check:ci` runs all of the explorer's checks in order, plus the build
smoke test, and logs to `explorer/tests/tmp/check-ci.log`.

Desktop, from `desktop/`:

```sh
npm run check-js        # svelte-check, eslint, prettier
scripts/check-rs        # cargo fmt --check, clippy -Dwarnings, cargo test
npm run test:unit
npm run test:e2e        # WebKit; needs scripts/install-binaries, done by setup
```

In `desktop/`, `npm run check:ci` runs all of the desktop checks in order and
logs to `desktop/tests/tmp/check-ci.log`. The machine has 2 CPUs: the Rust
test builds and the e2e suites are the slow parts.

## What does not work here

- The explorer's visual tests: their baselines exist only as CI artifacts.
- There is no container runtime, so nothing that runs `docker` or `podman`
  works (always-on-node's `pnpm test:e2e`, garden-broker's integration tests).
