# Release Process

`radicle-httpd` and `radicle-search` are released **together** from this
workspace: a single tag, a single changelog, and one build run that produces
artifacts for both binaries. They share the same version number, set by the
release tag. On [files.radicle.dev][files] each binary gets its own release
folder — `releases/radicle-httpd/<version>/` and, as a sibling,
`releases/radicle-search/<version>/` — so existing `radicle-httpd` download URLs
are unaffected and `radicle-search` is downloaded independently.

The release tooling lives in [`crates/radicle-httpd/build/`][build].

## Scope

Releases cover **only** the `radicle-httpd` and `radicle-search` binaries. The
web front-end (`radicle-explorer`) is not released this way: it is deployed
continuously (rolling release) and must always remain compatible with the latest
`radicle-httpd`/`radicle-search` release.

## Versioning

Versions follow [semantic versioning](https://semver.org). The version covers
the HTTP API, the CLI and the config: bump the minor version for additions, and
the major version for removals or changes. Before 1.0, `0.y` counts as the
major, so bump `0.y.z` to `0.y.(z+1)` for additions and to `0.(y+1).0` for
removals or changes. The release tag sets the version; do not change it in
`Cargo.toml`. See [ADR 0001](docs/adr/0001-expand-and-contract-api-changes.md)
for which releases explorer supports.

## Prerequisites

- Git signing configured via SSH:
  ```sh
  git config set gpg.format ssh
  git config set user.signingKey "$(rad self --ssh-key)"
  ```
- Working `podman` setup (see [Podman Setup](#podman-setup) below)
- Required tools: `podman`, `rad`, `sha256sum`

## Prepare

Normal patches add their highlights to `## Unreleased` in
[`CHANGELOG.md`](CHANGELOG.md). Note in each entry whether the change belongs to
`radicle-httpd` or `radicle-search`.

## Release

1. Update `master`:

   ```sh
   git switch master
   git pull --ff-only rad master
   ```

2. Make the release commit. The script renames `## Unreleased` to the version in
   `CHANGELOG.md` and [`docs/api-changes.md`](docs/api-changes.md), and adds a
   new empty `## Unreleased` to each:

   ```sh
   crates/radicle-httpd/build/prepare <version>
   ```

   Check the diff. Then add the API changes from `docs/api-changes.md` to the
   new section in `CHANGELOG.md`. If the release bumps the major, set the target
   date to drop the previous major in `## Support` of `docs/api-changes.md`,
   three months from today. Then commit:

   ```sh
   git commit -am "httpd: Release <version>"
   ```

3. Make and sign the tag. The script checks the signing key:

   ```sh
   crates/radicle-httpd/build/tag <version>
   ```

4. Push the commit and the tag. Push only this tag, not `--tags`. The push
   reports that the canonical reference is updated:

   ```sh
   git push rad master refs/tags/releases/httpd/<version>
   rad sync --announce
   ```

## Build and upload

Do these steps after the tag is canonical.

1. Check out the tag. The build reads the version from it with `git describe`:

   ```sh
   git switch --detach releases/httpd/<version>
   ```

2. Run the reproducible build (Linux x86_64 or macOS). A single run compiles the
   workspace and packages **both** binaries, one archive per binary per target:

   ```sh
   crates/radicle-httpd/build/build
   ```

   This writes to `crates/radicle-httpd/build/artifacts/`:
   - `radicle-httpd-<version>-<target>.tar.xz` (binary + man page)
   - `radicle-search-<version>-<target>.tar.xz` (binary)

   each with a `.sig` and `.sha256` alongside.

3. Upload. This publishes each binary into its own sibling folder on
   [files.radicle.dev][files] and creates the version-less and `latest` symlinks
   for both:

   ```sh
   SSH_LOGIN=<username> crates/radicle-httpd/build/upload
   ```

   > **Warning:** Uploading immediately publishes the release.

## Announce

1. Mark the previous release as resolved in Zulip `#Announcements`

2. Create a new announcement with the following template:

   **Topic:** `radicle-httpd + radicle-search <version>`

   **Message:**

   ````markdown
   # 👾 radicle-httpd + radicle-search <version>

   `radicle-httpd` and `radicle-search` <version> (<build-id>) are released.

   ## Installation

   Download binaries from:

   - https://files.radicle.dev/releases/radicle-httpd/<version>
   - https://files.radicle.dev/releases/radicle-search/<version>
   - https://radicle.dev/download

   ## Changelog

   <copy the <version> section from CHANGELOG.md>

   ## Checksums

   ```
   <copy output from crates/radicle-httpd/build/checksums>
   ```

   :info: This release was built on <platform>. Build reproducibility across
   platforms is unsupported; checksums may differ if rebuilt elsewhere.
   ````

## Notes

> **Important:**
>
> - macOS binaries are unsigned and not notarized; download via CLI only
> - Build reproducibility across platforms is not guaranteed

## Podman Setup

We use `podman` for reproducible builds across machines. It's preferred over
Docker because it runs without a daemon and doesn't require root access.

On first run, you may need to configure UID/GID ranges:

```sh
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER
podman system migrate
```

[files]: https://files.radicle.dev
[build]: crates/radicle-httpd/build/
