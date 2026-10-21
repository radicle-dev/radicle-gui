---
title: Glossary
---

<script>
  import Meta from '@app/marketing/Meta.svelte';
</script>

<svelte:head>

  <title>Glossary - Radicle</title>
</svelte:head>

<Meta title="Glossary | Radicle" description="Quick definitions of the Radicle-specific terms you'll come across." />

<h1 class="txt-bold-32">Glossary. <span class="txt-color-tertiary">Definitions of Radicle-specific terms.</span></h1>

**Bootstrap node** — A well-known seed node that new nodes connect to on first startup to discover the rest of the network. Radicle ships pre-configured with `seed.radicle.garden` and `seed.radicle.xyz`.

**Canonical JSON** — A standardized JSON encoding with sorted keys and no unnecessary whitespace. Used for identity documents so that hashing produces deterministic results.

**Canonical reference** — A Git reference whose authoritative state is determined by delegate signatures meeting the threshold requirement.

**COB (Collaborative Object)** — A CRDT-based data structure stored as Git objects. Used to implement issues, patches, and other social features.

**`config.json`** — The node configuration file, typically at `~/.radicle/config.json`. Controls seeding policy, external addresses, bootstrap peers, and scope.

**CRDT (Conflict-Free Replicated Data Type)** — A data structure designed so that concurrent modifications by different participants always merge deterministically without conflicts. The foundation of COBs.

**Delegate** — A person (identified by their DID) authorized to make changes to a repository’s identity document and canonical branches.

**DID (Decentralized Identifier)** — A W3C standard identifier encoding a public key. In Radicle, DIDs use the `did:key` method with Ed25519 keys. Format: `did:key:z6Mk...`.

**Gossip protocol** — The communication mechanism by which Radicle nodes discover peers and learn about repository updates.

**Identity document** — A JSON document at `refs/rad/id` that defines a repository’s metadata, delegates, and threshold.

**Magic ref** — A special Git reference (like `refs/patches`) that Radicle intercepts during push to trigger specific actions.

**Namespace** — Git’s mechanism for partitioning references. Radicle uses namespaces to store each peer’s data under their Node ID.

**Node** — A participant in the Radicle network, running `radicle-node`. Identified by a public key (Node ID).

**Node ID (NID)** — The public key that identifies a node on the network. Also used as the node’s static key in NoiseXK handshakes. Retrieve yours with `rad self --nid`.

**NoiseXK** — The cryptographic handshake pattern used to secure peer connections. Uses Ed25519 keys and requires knowing the peer’s Node ID before connecting.

**Patch** — A proposed code change, stored as a COB. Radicle’s equivalent of a pull request.

**`rad` remote** — The Git remote configured in Radicle working copies. Handled by `git-remote-rad`.

**Radicle Explorer** — The web interface for browsing Radicle repositories, powered by `radicle-httpd`. Currently read-only.

**Reference announcement** — A gossip message that informs peers a repository has been updated. Triggers Git fetches by interested nodes.

**RID (Repository Identity)** — A globally unique, self-certifying identifier for a Radicle repository. Prefixed with `rad:`.

**Scope** — Controls which peers’ data your node synchronizes. Options are `followed` (only explicit follows) or `all`.

**Seed / Seed node** — An always-on server node that provides high availability for repositories. Listens on TCP port 8776 by default.

**Seeding** — Serving a repository to other nodes on the network. Distinct from tracking (storing locally for your own use).

**Seeding policy** — Configuration that determines which repositories a node will replicate. `allow` means replicate everything; `block` means only replicate explicitly allowed repos.

**Threshold** — The number of delegates required to agree on a change for it to be considered canonical. Defined in the identity document.

**Tracking** — Telling your node to store a local copy of a repository and fetch updates. Distinct from seeding (also serving it to others).
