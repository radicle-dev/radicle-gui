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
`radicle-httpd`/`radicle-search` release. A release also registers the
frontend bundle of the tagged commit with radicle-artifact, see
[Publish](#publish).

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
- Working `podman` setup (see [Podman Setup](#podman-setup) below), or Docker
- Required tools: `podman` or `docker`, `rad`, `rad-artifact`, `sha256sum`,
  `curl`, `jq`, `ssh`, `scp`, `ssh-keygen`, `node`, `npm`. Install `rad-artifact` with:
  ```sh
  curl -sSf https://files.radicle.dev/releases/radicle-artifact/install | sh
  ```
- To download the CI build: a Buildkite API token with `read_builds` and
  `read_artifacts`

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

5. Optional: create the release in radicle-artifact now, so that it is visible
   before its archives are registered. `register` creates it otherwise:

   ```sh
   rad-artifact create releases/httpd/<version>
   ```

## Build

Pushing the tag starts the `📦 httpd release build` step in Buildkite. It builds
the archives in Docker and keeps them as build artifacts. You can also build
them locally. Either way, one build is enough to publish, but a second build in
another environment is recommended: it shows that neither environment changed
the archives.

1. Check out the tag. The scripts read the version from it with `git describe`:

   ```sh
   git switch --detach releases/httpd/<version>
   ```

2. Get the archives in one of these ways:
   - Download the CI build. This needs a Buildkite API token with `read_builds`
     and `read_artifacts`:

     ```sh
     export BUILDKITE_API_TOKEN=<token> BUILDKITE_ORG=<org> BUILDKITE_PIPELINE=<pipeline>
     crates/radicle-httpd/build/fetch <version>
     ```

   - Build locally. A single run compiles the workspace and packages **both**
     binaries, one archive per binary per target. It uses podman; set
     `CONTAINER=docker` to use Docker:

     ```sh
     crates/radicle-httpd/build/build
     ```

   Both write to `crates/radicle-httpd/build/artifacts/`:
   - `radicle-httpd-<version>-<target>.tar.xz` (binary + man page)
   - `radicle-search-<version>-<target>.tar.xz` (binary)

   each with a `.sha256` alongside.

3. Recommended: compare a local build with the CI build. `build` overwrites
   `artifacts/`, so build first, then fetch the CI build into another folder:

   ```sh
   crates/radicle-httpd/build/build
   crates/radicle-httpd/build/fetch -o crates/radicle-httpd/build/artifacts-ci <version>
   crates/radicle-httpd/build/compare crates/radicle-httpd/build/artifacts-ci
   ```

   Do not publish if the archives differ. `compare` takes any folder of archives
   with their `.sha256`, so the build of another delegate works too.

## Publish

1. Sign the archives with your Radicle key. This checks each archive against its
   `.sha256` and writes a `.sig` alongside:

   ```sh
   crates/radicle-httpd/build/sign
   ```

2. Upload. This publishes each binary into its own sibling folder on
   [files.radicle.dev][files] and creates the version-less and `latest` symlinks
   for both:

   ```sh
   SSH_LOGIN=<username> crates/radicle-httpd/build/upload
   ```

   > **Warning:** Uploading immediately publishes the release.

3. Register the archives with radicle-artifact, in the release of the tag. This
   records each archive's files.radicle.dev URL and `sha256`. If you publish the
   archives that `fetch` downloaded into `artifacts/`, it also records their
   Buildkite build. It also builds the explorer frontend bundle from the
   checked out tag with `config/default.json`, registers it as the collection
   `radicle-explorer` and seeds it from your local artifact node. This needs
   `node` and `npm`, in the version of `.nvmrc`, and no untracked files in
   `config/`, such as `local.json`. Running it again changes nothing:

   ```sh
   crates/radicle-httpd/build/register
   ```

## Attest (recommended)

Other delegates check the release by building it themselves. `attest` compares
the CIDs of your build with the registered ones, and attests them only if all
match:

```sh
git switch --detach releases/httpd/<version>
crates/radicle-httpd/build/build
crates/radicle-httpd/build/attest
```

If your build differs, find out why before anyone uses the release. If the
release is wrong, withdraw its archives with
`rad-artifact redact releases/httpd/<version> --cid <cid> -m <reason>`.

## Announce

1. Mark the previous release as resolved in Zulip `#Announcements`

2. Create a new announcement with the following template. `<commit>` is the
   8-character ID of the tagged commit, which the build also writes to
   `radicle-httpd.json`:
   `git rev-parse --short=8 'releases/httpd/<version>^{commit}'`

   **Topic:** `radicle-httpd + radicle-search <version>`

   **Message:**

   ````markdown
   # 👾 radicle-httpd + radicle-search <version>

   `radicle-httpd` and `radicle-search` <version> (<commit>) are released.

   ## Installation

   Download binaries from:

   - https://files.radicle.dev/releases/radicle-httpd/<version>
   - https://files.radicle.dev/releases/radicle-search/<version>
   - https://radicle.dev/download

   Check a download with
   `rad-artifact verify --repo rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5 <archive>`,
   after `rad seed rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5`.

   ## Changelog

   <copy the <version> section from CHANGELOG.md>

   ## Checksums

   ```
   <copy output from crates/radicle-httpd/build/checksums>
   ```

   Attested by: <the DIDs in `rad-artifact show releases/httpd/<version>`, if
   any>
   ````

## Notes

> **Important:**
>
> - macOS binaries are unsigned and not notarized; download via CLI only
> - The build always runs in a `linux/arm64` container, with the base images and
>   zig pinned, so that builds on different hosts give the same bytes. It runs
>   natively on Apple silicon and on the `large_linux_arm` Buildkite queue, and
>   under emulation on amd64 hosts

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
