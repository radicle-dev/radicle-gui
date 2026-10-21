---
title: Download Radicle
subtitle: Reproducible binaries, package managers, and verification
---

<script>
  import Meta from '@app/marketing/Meta.svelte';
</script>

<svelte:head>
  <title>Download | Radicle</title>
</svelte:head>

<Meta title="Download | Radicle" description="Reproducible binaries, package managers, and verification." canonical="https://radicle.dev/download" />

# Download Radicle

## Install script

The quickest way to install Radicle on any supported platform:

```
curl -sSf https://radicle.dev/install | sh
```

## Package managers

### APT (Debian / Ubuntu)

```
curl -LO https://radicle.dev/apt/radicle-archive-keyring.deb
chmod a+r radicle-archive-keyring.deb
sudo apt install ./radicle-archive-keyring.deb
echo "deb [signed-by=/usr/share/radicle/radicle-archive-keyring.asc] https://radicle.dev/apt release main" \
  | sudo tee /etc/apt/sources.list.d/radicle.list
sudo apt update
sudo apt install radicle
```

### Pacman (Arch Linux)

Install [`radicle`](https://archlinux.org/packages/extra/x86_64/radicle/) via pacman.

### Nix

Install `radicle-node` from [Nixpkgs](https://search.nixos.org/packages?query=radicle-node).

## Reproducible binaries

Radicle publishes reproducible builds for Linux and macOS. Each release includes binaries, SHA256 checksums, and SSH signatures.

### Radicle

Download the latest release for your platform:

```
curl -O -L https://files.radicle.dev/releases/latest/radicle-$TARGET.tar.xz
```

Replace `$TARGET` with one of:

| Platform | Target |
|----------|--------|
| Linux x86_64 | `x86_64-unknown-linux-musl` |
| Linux ARM64 | `aarch64-unknown-linux-musl` |
| macOS x86_64 | `x86_64-apple-darwin` |
| macOS ARM64 | `aarch64-apple-darwin` |

### Radicle HTTP daemon

```
curl -O -L https://files.radicle.dev/releases/radicle-httpd/latest/radicle-httpd-$TARGET.tar.xz
```

The same platform targets apply.

### Installation

Extract the archive to `~/.radicle/`:

```
tar -xf radicle-$TARGET.tar.xz -C ~/.radicle/
```

This places binaries in `~/.radicle/bin` and man pages in `~/.radicle/man`. Make sure `~/.radicle/bin` is in your `PATH`.

## Verification

Each archive is accompanied by a `.sig` (SSH signature) and `.sha256` (checksum) file.

### Signature verification

Verify the archive signature using `ssh-keygen`:

```
ssh-keygen -Y check-novalidate -n file -s ARCHIVE.tar.xz.sig < ARCHIVE.tar.xz
```

The following team members sign releases:

| Name | Public key |
|------|-----------|
| cloudhead@radicle.xyz | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL460KIEccS4881p7PPpiiQBsxF+H5tgC6De6crw9rbU` |
| erik@radicle.xyz | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBrJyJTwj/xG7F7qY0HDFXbb8A+xNNH8eILQ8hlvKW7/` |
| fintan@radicle.xyz | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEFsaRqAJ1r6bBFwlcWzJKN7DdjItQDumCNc0wqw6Dvk` |
| lorenz@radicle.xyz | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFhK7CqgIIbSthoNn8ea32krOnMzC807Z+PpBkR2YOVj` |
| rudolfs@osins.org | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPueml1FxzjvwbD7vRZfwoaoyuxLy0L+WLBwSNiVoJe5` |

### Checksum verification

```
sha256sum -c ARCHIVE.tar.xz.sha256
```
