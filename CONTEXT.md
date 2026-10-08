# Radicle Explorer

A web interface for browsing repositories replicated over the Radicle
peer-to-peer network. It reads from a **Seed** over HTTP and renders a
repository's source, collaboration objects and releases.

The language below is what this repo means by each term. Where a term also
appears as a field in the HTTP API, the definition here is the authority on
what it means, not the field name.

## Language

### Identity

**Identity Document**:
The signed record of a repository's identity, holding its delegates, threshold,
visibility and payloads.
_Avoid_: manifest, metadata, config

**Payload**:
A named, delegate-signed section of an Identity Document, addressed by a
reverse-DNS type name.
_Avoid_: extension, attribute

**Project Payload**:
The optional `xyz.radicle.project` Payload, declaring a repository's name,
description and default branch.
_Avoid_: project metadata, project info

**Canonical Refs Payload**:
The optional `xyz.radicle.crefs` Payload, declaring which references reach
canonical status and which reference `HEAD` points at.
_Avoid_: crefs config, refs payload

**Delegate**:
An authorized maintainer of a repository, whose signatures determine canonical
state.
_Avoid_: owner, maintainer, admin

### References

**Default Branch**:
The branch a repository opens at, named by the Canonical Refs Payload's `HEAD`
symbolic reference and otherwise by the Project Payload. Always a branch: a
`HEAD` resolving to anything else leaves the repository with no Default Branch.
_Avoid_: main branch, master, primary branch

**Tip**:
The commit a Default Branch currently resolves to.
_Avoid_: head, head commit, latest

**Canonical Reference**:
A reference resolved by delegate quorum, as opposed to one published by a single
peer.
_Avoid_: blessed ref, official ref

**HEAD**:
The symbolic reference naming the Default Branch. It resolves to a reference
name, never to a commit.
_Avoid_: head commit, tip

### Collaboration

**COB** (Collaborative Object):
A collaboration artifact stored as a Git DAG and replicated with the
repository. Issues, Patches, Releases and Jobs are all COBs.
_Avoid_: collab object, cob object

**Job**:
A COB recording a CI run against a single commit. Unlike other COBs it is
scoped to a commit rather than to the repository, so it has no repository-level
count.
_Avoid_: build, run, pipeline

**Patch**:
A proposed change to a repository, carrying immutable revisions and reviews.
_Avoid_: pull request, merge request, change request

**Release**:
A published set of artifacts attached to a tag.
_Avoid_: version, tag, artifact bundle

**Seed**:
A node that hosts and replicates repositories, and which the explorer reads
from over HTTP.
_Avoid_: server, backend, host, node

## Relationships

- An **Identity Document** carries zero or more **Payloads**, none of which is
  mandatory
- A **Default Branch** is named by the **Canonical Refs Payload**, falling back
  to the **Project Payload**; a repository may have neither and therefore no
  Default Branch
- A **Canonical Reference** is resolved by quorum among the **Delegates**
- A repository has many **COBs**: Issues, **Patches** and **Releases**

## Example dialogue

> **Dev:** "If a repository has no **Project Payload**, does it still have a
> **Default Branch**?"
>
> **Domain expert:** "Usually yes. **HEAD** in the **Canonical Refs Payload**
> names it directly. The **Project Payload** is only consulted when the
> **Canonical Refs Payload** doesn't declare one."
>
> **Dev:** "And if neither declares one?"
>
> **Domain expert:** "Then there is no **Default Branch**. The repository still
> exists and still has **COBs** — you just can't open it at a branch."

## Flagged ambiguities

- "head" was used for two different things: **HEAD**, the symbolic reference
  naming the **Default Branch**, and the commit that reference resolves to.
  Resolved: **HEAD** always means the reference. The commit is "the tip of the
  **Default Branch**".
- "project" was used to mean both a repository and the **Project Payload**.
  Resolved: the thing is a repository; "project" only ever qualifies the
  Payload.
- The **Default Branch** has two spellings in circulation: a bare branch name
  (`main`) in the **Project Payload**, and a qualified reference name
  (`refs/heads/main`) in the **Canonical Refs Payload**. Resolved: qualified is
  canonical, and the bare form is qualified on the way in.
- "cobs" names repository-level **COB** counts, not every **COB** type. **Jobs**
  are absent because they are commit-scoped, not because they were forgotten.
- Search matches on a repository's name and description, both of which live in
  the **Project Payload**. A repository without one is therefore unsearchable by
  construction — it is reachable only by its RID. This is a property of the
  domain, not a gap in the index.
