# Release Process

`radicle-httpd` and `radicle-search` are released **together** from this
workspace: a single tag, a single changelog, and one build run that produces
artifacts for both binaries. They share the same version number, bumped in
lockstep. On [files.radicle.dev][files] each binary gets its own release
folder — `releases/radicle-httpd/<version>/` and, as a sibling,
`releases/radicle-search/<version>/` — so existing `radicle-httpd` download
URLs are unaffected and `radicle-search` is downloaded independently.

The release tooling lives in [`crates/radicle-httpd/build/`][build].

## Scope

Releases cover **only** the `radicle-httpd` and `radicle-search` binaries. The
web front-end (`radicle-explorer`) is not released this way: it is deployed
continuously (rolling release) and must always remain compatible with the
latest `radicle-httpd`/`radicle-search` release.

## Prerequisites

- Git signing configured via SSH:
  ```sh
  git config set gpg.format ssh
  git config set user.signingKey "key::$(rad self --ssh-key)"
  ```
- Working `podman` setup (see [Podman Setup](#podman-setup) below)
- Required tools: `podman`, `rad`, `sha256sum`

## Prepare Release

1. Create release branch:
   ```sh
   git checkout -b release/httpd/<version>
   ```

2. Bump the version in **both** crates to the same value, so the two binaries
   stay coupled:
   - `crates/radicle-httpd/Cargo.toml`
   - `crates/radicle-search/Cargo.toml`

3. Update lockfiles:
   ```sh
   cargo build
   ```

4. Generate changelog (the version is read from
   `crates/radicle-httpd/Cargo.toml`):
   ```sh
   crates/radicle-httpd/build/changelog >> CHANGELOG.md
   ```

5. Edit changelog and remove irrelevant entries. Note in each entry whether a
   change belongs to `radicle-httpd` or `radicle-search`.

6. Commit release:
   ```sh
   git commit -m "Release <version>"
   ```

7. Push for review:
   ```sh
   git push rad HEAD:refs/patches
   ```

## Review & Merge

1. Wait for delegate approvals
2. Merge patch into `master`

## Tag Release

Create and sign the release tag (one tag covers both binaries):
```sh
crates/radicle-httpd/build/tag <version>
```

Publish the tag to Radicle. Push only this tag: every tag under `releases/`
that a delegate pushes becomes canonical, so `--tags` would also publish any
stray local ones.
```sh
git push rad refs/tags/releases/httpd/<version>
rad sync
```

## Build Artifacts

Run the reproducible build (Linux x86_64 or macOS). A single run compiles the
workspace and packages **both** binaries — one archive per binary per target:
```sh
crates/radicle-httpd/build/build
```

This writes to `crates/radicle-httpd/build/artifacts/`:
- `radicle-httpd-<version>-<target>.tar.xz` (binary + man page)
- `radicle-search-<version>-<target>.tar.xz` (binary)

each with a `.sig` and `.sha256` alongside.

> **Note:** A tagged commit is required; versioning uses `git describe`.

## Upload Artifacts

The upload publishes each binary into its own sibling folder on
[files.radicle.dev][files] and creates the version-less and `latest` symlinks
for both:
```sh
SSH_LOGIN=<username> crates/radicle-httpd/build/upload
```

> **Warning:** Uploading immediately publishes the release.

## Announce Release

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

   <copy output from crates/radicle-httpd/build/changelog>

   ## Checksums

   ```
   <copy output from crates/radicle-httpd/build/checksums>
   ```

   :info: This release was built on <platform>. Build reproducibility across platforms is unsupported; checksums may differ if rebuilt elsewhere.
   ````

## Notes

> **Important:**
> - macOS binaries are unsigned and not notarized; download via CLI only
> - Build reproducibility across platforms is not guaranteed

## Podman Setup

We use `podman` for reproducible builds across machines. It's preferred over Docker because it runs without a daemon and doesn't require root access.

On first run, you may need to configure UID/GID ranges:

```sh
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER
podman system migrate
```

[files]: https://files.radicle.dev
[build]: crates/radicle-httpd/build/
