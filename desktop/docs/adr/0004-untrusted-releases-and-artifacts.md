# 4. Untrusted releases and artifacts

Date: 2026-10-06

## Status

Proposed

## Context

Releases and their artifacts are COBs, so anyone can create a release in a
repo they replicate, and anyone can register an artifact on any release,
including a delegate's. An artifact is a file a user downloads and may run.
A release that sits in a well-known repo gets some of that repo's trust in
the eyes of a user who doesn't know what a delegate is. This makes it easy
to trick a user into downloading something malicious.

Trust is set at two levels:

- **Release:** its creator decides the title, tag and commit.
- **Artifact:** its author decides the bytes behind the CID.

The two can differ. A delegate's release can carry an artifact a
non-delegate registered, and a delegate can register an artifact on a
non-delegate's release.

The app, like radicle-explorer, splits releases and artifacts into two
disjoint scopes by author: Delegates and Others. In the code the scopes are
`trusted` and `untrusted`. The discussion is in the
[Artifacts topic](https://radicle.zulipchat.com/#narrow/channel/444463-Desktop/topic/Artifacts/with/624009755)
on Zulip.

## Decision

**Trust follows delegates.** A release or artifact is trusted when its
creator or author is a delegate of the repo, and untrusted otherwise. The
UI keeps the labels Delegates and Others, as "Untrusted" reads as too
alarming for content that is often harmless.

**Warn where untrusted content shows.** A short warning
(`UntrustedWarning.svelte`) says the content is not from a delegate and to
download it only if the user trusts its author. It stays small, so it
informs without alarm. It shows:

- above the Others releases list;
- on a release by a non-delegate, for the whole release;
- on a delegate's release, while it shows artifacts by non-delegates;
- in the download popover of an artifact by a non-delegate, whatever the
  release, because that is where the user acts;
- in the browser tab of a delegate's artifact, while it lists links added
  by non-delegates, as those downloads are not checked against the CID.

**Count only delegate attestations.** The attestation badge on an artifact
counts delegates only, as anyone can make keys that attest their own
artifact. The full list still shows every attestation.

**Open on Delegates, and never switch scope by itself.** The releases list
and the artifacts of a release always open on Delegates, also when Delegates
is empty. The Others filter shows whenever Others has content, so untrusted
content is one deliberate click away. An empty Delegates scope tells the
user that the delegates published nothing. Opening on Others would hide
that, and would show untrusted content the user did not ask for.

## Alternatives considered

- **Open on Others when Delegates is empty.** This avoids an empty page,
  but shows untrusted content without the user asking for it, and hides
  that the delegates published nothing.
- **Hide Others by default**, behind a global setting. This protects users
  best, and avoids showing links to malware at all, which is a reputation
  risk a warning doesn't remove. It also hides legitimate contributions,
  such as builds by a release manager who is not a delegate. It is still
  open.
- **Rename Delegates to Official** or Others to Untrusted. This changes
  only the wording and leaves the warning to a single label.
- **A list of trusted publishers in the repo identity**, like canonical ref
  rules. This lets non-delegates publish trusted releases, but adds a
  second trust model. Linking a release to a canonical annotated tag gives
  part of this already, so canonical refs are the preferred path.

## Consequences

- Users see a warning before they download an untrusted artifact, also when
  it sits on a trusted release.
- A trusted artifact on an untrusted release still shows the release
  warning, as its title, tag and commit are not trusted.
- Delegation is the only trust signal. Release managers who are not
  delegates show as Others until releases can use canonical ref rules.
- An empty Delegates scope shows an empty page, also when Others has
  content.
- radicle-explorer shows the same warnings and opens on the same scope, so
  that both clients agree.
