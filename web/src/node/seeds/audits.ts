import type { RepoSeed } from "./types";

const readme = `# Keystone audits

Public security reviews of Keystone's libraries, and of a few community
projects that asked us to look at them. Every report is plain Markdown,
written to be read by the people who maintain and use the code, not only
by other auditors.

- [METHODOLOGY.md](METHODOLOGY.md): how we run a review, what we promise
  and what we don't.
- [SEVERITY.md](SEVERITY.md): the severity scale and status values.
- [FINDINGS.md](FINDINGS.md): every finding from every report, one line
  each, with its current status.
- [TEMPLATE.md](TEMPLATE.md): the skeleton every report starts from.
- \`reports/\`: the reports, named \`YYYY-MM-project-version.md\`.

## Asking for a review

Open an issue titled "Review request: <project>". Tell us what the code
does, who depends on it, and what you're worried about. We take on two or
three outside reviews a year, chosen for how many people they'd protect.
We don't charge, and we don't sign NDAs: everything we find is published
here once it's fixed or 90 days have passed, whichever comes first.

## Reusing these reports

Text is CC BY 4.0. Quote, translate and adapt freely, with a link back.
`;

const license = `The reports, methodology and other text in this repository are licensed
under the Creative Commons Attribution 4.0 International License
(https://creativecommons.org/licenses/by/4.0/).

tools/ is licensed under MIT OR Apache-2.0, at your option.
`;

const methodology = `# How we review

## Before we start

We agree on a scope with the maintainers in writing: which repository,
which commit, which parts of the code, and what the code is supposed to
guarantee. "Is it secure?" is not a scope. "Can a token holder ever
extend a token's lifetime?" is.

We ask for the threat model, if there is one. If there isn't, writing one
together is usually the most valuable hour of the review.

## During the review

Two reviewers, always. Each reads the in-scope code independently first,
then we compare notes. We look for:

- places where the code does something different from what its docs say;
- inputs an attacker controls, and every path they can take;
- secret data: where it lives, how long, and who can observe it;
- misuse: what a reasonable caller will get wrong given this API.

We write tests for every finding we can reproduce, and send them to the
maintainers with the finding.

## Reporting

Findings go to the maintainers privately as soon as we're confident of
them, not at the end. The report is published when every finding of
Medium severity or above is fixed, or 90 days after the first private
report, whichever comes first.

## Retesting

Once fixes land, we check each one against the original reproducer and
record the result in the report and in FINDINGS.md. A finding is only
**Fixed** once we've seen the fix ourselves.

## What a review is not

A review is a fixed amount of time spent by two people. It finds some
bugs. It does not prove there are no others, and "audited" is not a
property code keeps after it changes.
`;

const severity = `# Severity and status

## Severity

**Critical**: an attacker can forge signatures, recover secrets, or run
code, without unusual preconditions.

**High**: as above, but needing a precondition a real attacker could
plausibly arrange; or a full bypass of a documented security property.

**Medium**: weakens a documented property, or makes a serious mistake by
callers likely.

**Low**: hardening. Defence in depth, or an issue that needs an
attacker who is already most of the way there.

**Info**: not a vulnerability. Documentation, tests, process.

## Status

| Status          | Meaning |
|-----------------|---------|
| Open            | Not fixed yet. |
| Fixed in X      | Fixed in release or commit X, and we retested it. |
| Acknowledged    | The maintainers accept the risk, usually with a documentation change. |
| Won't fix       | The maintainers disagree that it's a problem. We say why in the report. |
`;

const template = `# <Project> <version>: security review

| | |
|---|---|
| Project | |
| Version | |
| Reviewers | |
| Dates | |
| Status | Draft |

## Summary

Two or three paragraphs a maintainer's manager could read: what we
looked at, what we found, and whether we'd be comfortable depending on it.

## Scope

### In scope

### Out of scope

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|

### <ID>: <title>

**Severity:** <level>
**Status:** <status>

What the problem is, how to trigger it, and what an attacker gets.

**Recommendation:** what we'd change.

**Retest:** what we checked once the fix landed, and when.

## General recommendations

Things that are not findings but that we'd do differently.
`;

const contributing = `# Contributing

Corrections are very welcome: typos, broken links, a status that's out
of date, a recommendation that turned out to be wrong. Send a patch.

Some rules for reports:

- Never edit the body of a published finding to change what we said.
  Add a dated note under it instead, so readers can see what changed.
- Finding IDs are \`PROJECT-NN\`, numbered per project across all reports,
  and never reused.
- Every finding in a report needs a row in FINDINGS.md. \`make check\`
  verifies this, and CI runs it.
- Write plainly. If a sentence would confuse a maintainer who isn't a
  cryptographer, rewrite it.
`;

const makefile = `.PHONY: check
check:
	python3 tools/check-index.py
`;

const checkIndex = String.raw`#!/usr/bin/env python3
"""Check that FINDINGS.md and the reports agree.

Every "### ID: title" heading in reports/ must have a row in FINDINGS.md
with the same severity, and every row must point at a report that has it.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADING = re.compile(r"^### ([A-Z]+-\d{2}): (.+)$")
SEVERITY = re.compile(r"^\*\*Severity:\*\* (\w+)")
ROW = re.compile(r"^\| ([A-Z]+-\d{2}) \| (\w+) \| (.+?) \| (.+?) \| \[.+?\]\((.+?)\) \|$")


def findings_in_reports():
    found = {}
    for report in sorted((ROOT / "reports").glob("*.md")):
        current = None
        for line in report.read_text(encoding="utf-8").splitlines():
            if m := HEADING.match(line):
                current = m.group(1)
                found[current] = {"report": f"reports/{report.name}", "severity": None}
            elif current and (m := SEVERITY.match(line)):
                found[current]["severity"] = m.group(1)
                current = None
    return found


def findings_in_index():
    rows = {}
    for line in (ROOT / "FINDINGS.md").read_text(encoding="utf-8").splitlines():
        if m := ROW.match(line):
            rows[m.group(1)] = {"severity": m.group(2), "report": m.group(5)}
    return rows


def main():
    reports, index = findings_in_reports(), findings_in_index()
    errors = []
    for fid, r in reports.items():
        row = index.get(fid)
        if row is None:
            errors.append(f"{fid}: in {r['report']} but not in FINDINGS.md")
        elif row["severity"] != r["severity"]:
            errors.append(f"{fid}: severity {r['severity']} in report, {row['severity']} in index")
    for fid, row in index.items():
        if fid not in reports:
            errors.append(f"{fid}: in FINDINGS.md but no report has it")
    for e in errors:
        print(e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
`;

const latchReport = `# latch 0.2: security review

| | |
|---|---|
| Project | latch, Keystone's signed capability tokens |
| Version | 0.2.0 |
| Reviewers | zeynep, malik |
| Dates | 2025-10-06 to 2025-10-17 |
| Status | Final |

## Summary

latch issues short, signed capability tokens that holders can narrow by
appending caveats ("only this path", "expires sooner") without talking to
the issuer. We reviewed the token format, the caveat parser and the
verification path.

The design is sound. The implementation had one serious bug: duplicate
expiry caveats were resolved by taking the last one, so a holder could
extend a token's lifetime by appending a later expiry. That is fixed in
0.2.1. The remaining findings are hardening.

## Scope

### In scope

- \`src/token.rs\`, \`src/caveat.rs\`, \`src/verify.rs\` at the 0.2.0 tag
- The token format as described in \`docs/format.md\`

### Out of scope

- The HMAC-SHA256 implementation (from the \`hmac\` and \`sha2\` crates)
- The example HTTP middleware in \`examples/\`

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| LATCH-01 | High | Duplicate \`exp\` caveats: the last one wins | Fixed in 0.2.1 |
| LATCH-02 | Medium | MAC compared with \`==\` | Fixed in 0.2.1 |
| LATCH-03 | Low | Errors include the full token | Open |
| LATCH-04 | Low | Token length is unbounded | Acknowledged |
| LATCH-05 | Info | Docs suggest 16-byte root keys | Fixed in 0.2.1 |

### LATCH-01: Duplicate \`exp\` caveats: the last one wins

**Severity:** High
**Status:** Fixed in 0.2.1

Caveats are parsed into a map, so when a token carries two \`exp\` caveats
only the later one is kept. Appending caveats is something every holder
is allowed to do, and the new MAC chains correctly, so a holder of a
token expiring in an hour can append \`exp = 2030-01-01\` and get a token
that verifies for years.

**Recommendation:** treat every caveat as a restriction that must hold
independently. For \`exp\`, that means the earliest one applies.

**Retest:** 0.2.1 keeps all caveats in a list and checks each. Our
reproducer now fails with \`Expired\`. Retested 2025-10-29.

### LATCH-02: MAC compared with \`==\`

**Severity:** Medium
**Status:** Fixed in 0.2.1

\`verify.rs\` compares the computed and supplied MAC with \`==\` on byte
slices, which can return early on the first differing byte. Over a
network the signal is small, but it is the textbook setting for a
byte-at-a-time forgery.

**Recommendation:** use \`subtle::ConstantTimeEq\`.

**Retest:** fixed as recommended. Retested 2025-10-29.

### LATCH-03: Errors include the full token

**Severity:** Low
**Status:** Open

\`Error::Display\` includes the token that failed to verify. Applications
log errors, so valid-but-expired tokens end up in logs where anyone with
log access can replay them until expiry.

**Recommendation:** include the token's ID, never its MAC.

### LATCH-04: Token length is unbounded

**Severity:** Low
**Status:** Acknowledged

The parser reads every caveat before checking the MAC. A 50 MB token
of garbage caveats takes about 900 ms to reject on our test machine.

**Recommendation:** reject tokens over a configurable size (4 KiB by
default) before parsing.

### LATCH-05: Docs suggest 16-byte root keys

**Severity:** Info
**Status:** Fixed in 0.2.1

The README example generates a 16-byte root key. HMAC-SHA256 should use
32.

## General recommendations

- Fuzz the caveat parser. It is small and self-contained, which makes it
  a very good fuzzing target.
- Document that caveats are conjunctive. LATCH-01 came from a reasonable
  reading of an underspecified format.
`;

const findingsRoot = `# Findings index

Every finding from every published report, one row each. IDs are stable
and never reused. Severity and status values are explained in
[SEVERITY.md](SEVERITY.md).

## latch

| ID | Severity | Title | Status | Report |
|----|----------|-------|--------|--------|
| LATCH-01 | High | Duplicate exp caveats: the last one wins | Fixed in 0.2.1 | [2025-11](reports/2025-11-latch-0.2.md) |
| LATCH-02 | Medium | MAC compared with == | Fixed in 0.2.1 | [2025-11](reports/2025-11-latch-0.2.md) |
| LATCH-03 | Low | Errors include the full token | Open | [2025-11](reports/2025-11-latch-0.2.md) |
| LATCH-04 | Low | Token length is unbounded | Acknowledged | [2025-11](reports/2025-11-latch-0.2.md) |
| LATCH-05 | Info | Docs suggest 16-byte root keys | Fixed in 0.2.1 | [2025-11](reports/2025-11-latch-0.2.md) |
`;

const sigilReportDraft = `# sigil 0.1: security review

| | |
|---|---|
| Project | sigil, Keystone's Ed25519 library |
| Version | 0.1.0 |
| Reviewers | malik, with an outside reviewer for the curve arithmetic boundary |
| Dates | 2026-02-02 to 2026-02-13 |
| Status | Draft |

## Summary

DRAFT: findings still being confirmed with the maintainers.

## Scope

### In scope

- Everything under \`src/\` at the 0.1.0 tag
- \`docs/verification.md\`, checked against the code

### Out of scope

- curve25519-dalek and sha2

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| SIGIL-01 | Medium | verify_strict accepts non-canonical public keys | Open |
| SIGIL-02 | Low | SigningKey is Clone | Open |
| SIGIL-03 | Low | Error variants invite branching | Open |
| SIGIL-04 | Info | No fuzzing | Open |

### SIGIL-01: verify_strict accepts non-canonical public keys

**Severity:** Medium
**Status:** Open

TODO: write up once the fix is agreed.

### SIGIL-02: SigningKey is Clone

**Severity:** Low
**Status:** Open

### SIGIL-03: Error variants invite branching

**Severity:** Low
**Status:** Open

### SIGIL-04: No fuzzing

**Severity:** Info
**Status:** Open
`;

const sigilReport = `# sigil 0.1: security review

| | |
|---|---|
| Project | sigil, Keystone's Ed25519 library |
| Version | 0.1.0 |
| Reviewers | malik, with an outside reviewer for the curve arithmetic boundary |
| Dates | 2026-02-02 to 2026-02-13 |
| Status | Final |

## Summary

sigil is a thin layer over curve25519-dalek that offers Ed25519 signing
and two verification rules. The code is small (about 400 lines), has no
\`unsafe\`, and its documentation is unusually honest about where Ed25519
implementations disagree.

We found one Medium issue: \`verify_strict\` accepted public keys whose
encoding is not canonical, so the same key had two valid encodings. It
was found independently, during our review window, by an outside
contributor's fuzzer, and is fixed on main. The other findings are about
making misuse harder.

Note: zeynep is a maintainer of sigil and did not review this release.

## Scope

### In scope

- Everything under \`src/\` at the 0.1.0 tag
- \`docs/verification.md\`, checked against the code

### Out of scope

- curve25519-dalek and sha2. We checked that sigil uses their APIs as
  documented, not that the APIs are correct.

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| SIGIL-01 | Medium | verify_strict accepts non-canonical public keys | Fixed in 0.2.0 |
| SIGIL-02 | Low | SigningKey is Clone | Acknowledged |
| SIGIL-03 | Low | Error variants invite branching | Acknowledged |
| SIGIL-04 | Info | No fuzzing | Fixed in 0.2.0 |

### SIGIL-01: verify_strict accepts non-canonical public keys

**Severity:** Medium
**Status:** Fixed in 0.2.0

curve25519-dalek's \`decompress\` accepts y coordinates in [p, 2^255) and
reduces them modulo p. For the 19 values of y below 19 this gives each
point a second encoding. Because the challenge hash \`H(R || A || M)\`
uses the encoding of A as received, a signature made against either
encoding verifies.

Any protocol that uses public key bytes as an identity (a peer ID, an
account name) therefore has two identities for some keys. We found no
way to forge a signature with this.

Credit: reported independently by theo, from a differential fuzzer,
during our review window.

**Recommendation:** in \`verify_strict\`, re-encode A and reject the key
unless the encodings match. Leave \`verify\` alone, since it is meant to
be permissive, and say so in its docs.

**Retest:** fixed as recommended, with a test that tries every affected
encoding. Retested 2026-03-06.

### SIGIL-02: SigningKey is Clone

**Severity:** Low
**Status:** Acknowledged

Every clone of a \`SigningKey\` is another copy of the secret, zeroized
only when that copy is dropped. Clones are easy to make by accident
(\`.clone()\` to satisfy the borrow checker).

**Recommendation:** remove \`Clone\`, or document that every clone is a
secret that needs the same care.

The maintainers chose to keep \`Clone\`, since removing it pushes users
towards \`to_bytes()\` and back, which is worse. Documented in 0.2.0.

### SIGIL-03: Error variants invite branching

**Severity:** Low
**Status:** Acknowledged

\`Error\` distinguishes \`WeakPublicKey\` from \`Verification\`. A caller who
falls back to \`verify\` when \`verify_strict\` says \`WeakPublicKey\` has
quietly turned strict verification off.

**Recommendation:** document that every variant means "invalid", and
consider making the enum \`#[non_exhaustive]\`.

### SIGIL-04: No fuzzing

**Severity:** Info
**Status:** Fixed in 0.2.0

There were no fuzz targets. Parsing and verification are small and take
raw bytes, which is the best case for fuzzing.

**Retest:** \`fuzz/\` now has decode and verify targets, contributed by
theo, and SIGIL-01 shows they work.

## General recommendations

- Run the no_std build in CI on a target without atomics, or document
  that only thumbv7em is supported.
- Keep \`docs/verification.md\` next to the code that implements it, and
  treat changes to either as needing review of both.
`;

const beaconReport = `# beacon announcements: security review

| | |
|---|---|
| Project | beacon (lumen-labs), community project |
| Version | 0.5.2 |
| Reviewers | malik, zeynep |
| Dates | 2026-03-16 to 2026-03-27 |
| Status | Final |

## Summary

beacon is a small library for signed peer announcements in peer-to-peer
networks: each peer periodically broadcasts "I am X, reachable at Y",
signed with its Ed25519 key, and relays forward announcements they
consider valid. The maintainers asked us to review the announcement
format and the verify-then-relay path.

We found one High issue. Signatures were checked against a re-serialised
copy of the decoded message, not against the bytes that were received,
so two different byte strings could carry the same valid signature. The
remaining findings are about freshness and replay.

## Scope

### In scope

- \`src/message.rs\`, \`src/verify.rs\`, \`src/relay.rs\` at 0.5.2
- The v1 and v2 wire formats as documented in \`docs/wire.md\`

### Out of scope

- The transport layer and peer discovery
- ed25519-dalek, which beacon used at the time

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| BEACON-01 | High | Signature covers a re-serialised message | Fixed in 0.6.0 |
| BEACON-02 | Medium | Sequence numbers reset on restart | Fixed in 0.6.0 |
| BEACON-03 | Medium | 24-hour freshness window | Fixed in 0.6.0 |
| BEACON-04 | Low | Peer IDs are raw key bytes | Fixed in 0.6.0 |
| BEACON-05 | Info | Strict and permissive verification mixed | Fixed in 0.6.0 |

### BEACON-01: Signature covers a re-serialised message

**Severity:** High
**Status:** Fixed in 0.6.0

\`verify.rs\` decodes an announcement, re-encodes the decoded struct, and
verifies the signature over the re-encoding. The decoder accepts fields
in any order and ignores unknown fields, so many byte strings decode to
the same struct. A relay that forwards the bytes it received can be
made to forward content (in ignored fields) that the signer never saw.

**Recommendation:** verify over the exact bytes received, before
decoding. Reject unknown fields in signed messages.

**Retest:** v2 messages are verified over the raw bytes and the decoder
is strict. Retested 2026-04-21.

### BEACON-02: Sequence numbers reset on restart

**Severity:** Medium
**Status:** Fixed in 0.6.0

Each peer numbers its announcements from 0 after every restart. Relays
keep the highest sequence number seen per peer, so after a peer restarts
they either drop its new announcements, or (after the relay's cache
expires) accept a replay of old ones.

**Recommendation:** use the announcement timestamp, or persist the
counter.

### BEACON-03: 24-hour freshness window

**Severity:** Medium
**Status:** Fixed in 0.6.0

Announcements are accepted up to 24 hours after their timestamp. A
captured announcement for an address the peer no longer uses can be
replayed for a day.

**Recommendation:** 10 minutes, with a configurable allowance for clock
skew.

### BEACON-04: Peer IDs are raw key bytes

**Severity:** Low
**Status:** Fixed in 0.6.0

The peer ID is the public key as received. See SIGIL-01: some keys have
two encodings, so some peers have two IDs.

**Recommendation:** use \`verify_strict\`, which rejects non-canonical
keys, or canonicalise before using the bytes as an ID.

### BEACON-05: Strict and permissive verification mixed

**Severity:** Info
**Status:** Fixed in 0.6.0

The relay path used ed25519-dalek's \`verify\` and the end-node path used
\`verify_strict\`. They disagree on some crafted signatures, so relays
forward things end nodes then drop.

## General recommendations

- Write the verification rule into \`docs/wire.md\`, so other
  implementations can match it exactly.
`;

const tidepoolReport = `# tidepool ingest and API: security review

| | |
|---|---|
| Project | tidepool (tidal-collective), community project |
| Version | 0.2.0 |
| Reviewers | malik, zeynep |
| Dates | 2026-05-25 to 2026-06-05 |
| Status | Final |

## Summary

tidepool ingests sensor feeds from ocean buoys and serves readings over a
small HTTP API. Its ingest endpoint is public, because buoys report over
cellular links from changing addresses, which makes the feed parser the
most exposed part of the system.

We found one High issue (unbounded line length in the feed parser lets
any client exhaust memory) and two Medium ones. tidepool is not
cryptography-heavy; we took it on because several research groups
publish data through it and asked for a second pair of eyes.

## Scope

### In scope

- \`internal/ingest\` and \`internal/api\` at v0.2.0
- The feed format as documented in the README

### Out of scope

- The storage layer, except where ingest writes to it
- Deployment configuration

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| TIDE-01 | High | Unbounded line length in the feed parser | Open |
| TIDE-02 | Medium | No HTTP server timeouts | Open |
| TIDE-03 | Medium | Station IDs used in archive paths | Open |
| TIDE-04 | Low | Error responses echo raw input | Open |
| TIDE-05 | Low | Feed tokens compared with == | Open |
| TIDE-06 | Info | Parser is not fuzzed | Open |

### TIDE-01: Unbounded line length in the feed parser

**Severity:** High
**Status:** Open

\`parse.go\` reads each feed line with \`bufio.Reader.ReadString('\\n')\`,
which grows its buffer until it sees a newline. A client that sends
gigabytes without one makes the process allocate until it is killed.
The ingest endpoint doesn't need authentication to reach the parser.

**Recommendation:** use a \`bufio.Scanner\` with an explicit maximum
token size (feed lines are under 200 bytes in practice), and cap the
request body with \`http.MaxBytesReader\`.

### TIDE-02: No HTTP server timeouts

**Severity:** Medium
**Status:** Open

The server is started with \`http.ListenAndServe\`, which sets no read,
write or idle timeouts. A few hundred slow clients hold all connections.

**Recommendation:** use an \`http.Server\` with \`ReadHeaderTimeout\`,
\`ReadTimeout\` and \`IdleTimeout\` set.

### TIDE-03: Station IDs used in archive paths

**Severity:** Medium
**Status:** Open

The nightly archive writes \`archive/<station>/<date>.csv\` using the
station ID from the feed. A station ID of \`../../etc\` writes outside the
archive directory.

**Recommendation:** validate station IDs against \`^[A-Z0-9-]{1,32}$\` at
ingest, and use \`filepath.Join\` plus a prefix check when writing.

### TIDE-04: Error responses echo raw input

**Severity:** Low
**Status:** Open

Parse errors include the offending line in the HTTP response. Harmless
in JSON clients, but the dashboard renders error text as HTML.

### TIDE-05: Feed tokens compared with ==

**Severity:** Low
**Status:** Open

Per-station tokens are compared with \`==\` on strings. Use
\`subtle.ConstantTimeCompare\`.

### TIDE-06: Parser is not fuzzed

**Severity:** Info
**Status:** Open

Go's native fuzzing would have found TIDE-01 in seconds. theo has
offered a harness.
`;

const latchRetest = `# latch 0.4: retest

| | |
|---|---|
| Project | latch, Keystone's signed capability tokens |
| Version | 0.4.0 |
| Reviewers | malik |
| Dates | 2026-07-06 to 2026-07-08 |
| Status | Final |

## Summary

A short retest of the open findings from the 0.2 review, plus a look at
the one significant change since then: tokens can now be bound to a
TLS channel. Both open findings are fixed. We found one new Low issue.

## Scope

### In scope

- LATCH-03 and LATCH-04 from the 0.2 report
- \`src/binding.rs\` (new in 0.4)

### Out of scope

- Everything else; it hasn't changed since 0.2.1

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| LATCH-06 | Low | Channel binding is optional per caveat | Acknowledged |

Retest of earlier findings:

- **LATCH-03** (errors include the full token): fixed in 0.2.2. Errors
  now print the token ID only. Retested 2026-07-06.
- **LATCH-04** (unbounded token length): fixed in 0.3.0. Tokens over
  4 KiB are rejected before parsing; the limit is configurable.
  Retested 2026-07-06.

### LATCH-06: Channel binding is optional per caveat

**Severity:** Low
**Status:** Acknowledged

A token is channel-bound if it carries a \`bind\` caveat. A holder can't
remove caveats, so this is safe, but nothing stops an issuer from
forgetting to add one, and the verifier can't require it.

**Recommendation:** add a verifier option that rejects tokens without a
\`bind\` caveat.

The maintainers plan this for 0.5 and accepted the risk until then.
`;

const sigil03Report = `# sigil 0.3: security review

| | |
|---|---|
| Project | sigil, Keystone's Ed25519 library |
| Version | 0.3.0 |
| Commit range | v0.1.0..v0.3.0 |
| Reviewers | malik, theo (fuzzing) |
| Dates | 2026-09-07 to 2026-09-18 |
| Status | Final |

## Summary

This review covers what changed since 0.1: batch verification, the
\`rand_core\` feature with \`SigningKey::generate\`, \`TryFrom\` parsing, and
the fixes for SIGIL-01 and the late nonce finding. The batch
verification code is correct and the documentation about its
cofactored rule is clear. We have no Medium or higher findings.

## Scope

### In scope

- \`src/batch.rs\`, \`src/signing.rs\`, \`src/verifying.rs\` at 0.3.0
- The fuzz targets and CI fuzzing setup

### Out of scope

- Code unchanged since 0.1.0, which the 0.1 review covers

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| SIGIL-06 | Low | Batch verification accepts weak keys | Acknowledged |
| SIGIL-07 | Low | Hasher state holding the seed is not wiped | Open |
| SIGIL-08 | Info | CI fuzz runs start from an empty corpus | Open |
| SIGIL-09 | Info | MSRV policy is undocumented | Open |

### SIGIL-06: Batch verification accepts weak keys

**Severity:** Low
**Status:** Acknowledged

\`verify_batch\` implements the cofactored rule, as documented, and so
accepts small-order keys. The README says sigil is "strict by default",
and a reader skimming it could reasonably expect batching to be strict
too. A caller who batches without first checking \`is_weak()\` accepts
signatures under keys anyone can sign for.

**Recommendation:** either check \`is_weak()\` on every key inside
\`verify_batch\` (cheap compared to the multiscalar multiplication), or
add the warning to the README, not only to the module docs.

### SIGIL-07: Hasher state holding the seed is not wiped

**Severity:** Low
**Status:** Open

\`SigningKey::from_bytes\` zeroizes the digest and the clamped scalar, but
\`Sha512::digest(seed)\` creates a hasher whose internal buffer holds the
seed and is dropped without being wiped.

**Recommendation:** hash with an explicit \`Sha512\` and wipe it, or
enable sha2's \`zeroize\` support when it is available.

### SIGIL-08: CI fuzz runs start from an empty corpus

**Severity:** Info
**Status:** Open

The one-minute CI runs mostly rediscover trivial inputs. They catch
build breakage, which is useful, but they are not going to find bugs.

### SIGIL-09: MSRV policy is undocumented

**Severity:** Info
**Status:** Open

0.3.0 raised the MSRV in a minor release. That is allowed before 1.0,
but users can't know it without reading the CHANGELOG.
`;

export const audits: RepoSeed = {
  owner: { org: "keystone" },
  name: "audits",
  description:
    "Public security audit reports and methodology for Keystone's libraries and a few community projects.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["zeynep", "malik"],
  threshold: 2,
  seeding: 15,
  files: {
    "README.md": readme,
    LICENSE: license,
    "METHODOLOGY.md": methodology,
    "SEVERITY.md": severity,
    "TEMPLATE.md": template,
    "CONTRIBUTING.md": contributing,
    "FINDINGS.md": findingsRoot,
    Makefile: makefile,
    "tools/check-index.py": checkIndex,
    "reports/2025-11-latch-0.2.md": latchReport,
  },
  root: {
    label: "root",
    message: `Start a public home for Keystone's audit reports

Moves the latch 0.2 report out of the wiki, and writes down how we
review, how we rate severity, and the template we've been copying by
hand.`,
    author: "zeynep",
    daysAgo: 340,
  },
  history: [
    {
      label: "latch-03-fixed",
      message: `latch: LATCH-03 is still open after 0.2.1

Correct the date in the retest note. The 0.2.1 release fixed 01, 02 and
05; 03 is waiting on a change to the error type.`,
      author: "malik",
      daysAgo: 336,
      changes: {
        "reports/2025-11-latch-0.2.md": [
          [
            "**Recommendation:** include the token's ID, never its MAC.\n",
            "**Recommendation:** include the token's ID, never its MAC.\n\n**Retest:** not fixed in 0.2.1. The maintainers plan to change the\nerror type in 0.2.2. Checked 2025-11-28.\n",
          ],
        ],
      },
    },
    {
      label: "embargo",
      message: `METHODOLOGY: describe how we handle embargoed findings

We've been doing this informally. Writing it down so maintainers know
what to expect before they ask us for a review.`,
      author: "zeynep",
      daysAgo: 320,
      changes: {
        "METHODOLOGY.md": [
          [
            "## Retesting\n",
            `### Embargoes

If a finding affects other projects (a shared dependency, a common
pattern), we tell those projects privately too, and agree on one
publication date for everyone. We will extend the 90 days once, by up
to 30 days, if a fix is close and the maintainers ask. We won't extend
it because a release date is inconvenient.

## Retesting
`,
          ],
        ],
      },
    },
    {
      label: "template-not-covered",
      message: `TEMPLATE: say what we didn't cover

"Out of scope" is what was agreed up front. "Not covered" is what was
in scope but we ran out of time for. Readers deserve to know both.`,
      author: "malik",
      daysAgo: 300,
      changes: {
        "TEMPLATE.md": [
          [
            "### Out of scope\n\n## Findings\n",
            "### Out of scope\n\n### Not covered\n\nIn scope, but we didn't get to it. Be specific.\n\n## Findings\n",
          ],
        ],
      },
    },
    {
      label: "severity-examples",
      message: `SEVERITY: give an example for each level

Calibrated against findings we've already published, so it's not just
adjectives.`,
      author: "zeynep",
      daysAgo: 285,
      changes: {
        "SEVERITY.md": [
          [
            "**Info**: not a vulnerability. Documentation, tests, process.\n",
            `**Info**: not a vulnerability. Documentation, tests, process.

Examples from our own reports: LATCH-01 (a holder can extend a token's
lifetime) is High because every holder can do it, but it doesn't let
anyone mint tokens. LATCH-02 (non-constant-time MAC check) is Medium:
exploitable in principle, hard in practice. LATCH-03 (tokens in logs)
is Low because it needs log access first.
`,
          ],
        ],
      },
    },
    {
      label: "check-status",
      message: `tools: also check that every index row has a status

An empty status cell slipped through on a draft and nobody noticed for
a week.`,
      author: "malik",
      daysAgo: 270,
      changes: {
        "tools/check-index.py": [
          [
            "    for fid, row in index.items():\n        if fid not in reports:\n",
            "    for fid, row in index.items():\n        if not row[\"status\"].strip():\n            errors.append(f\"{fid}: empty status in FINDINGS.md\")\n        if fid not in reports:\n",
          ],
          [
            '            rows[m.group(1)] = {"severity": m.group(2), "report": m.group(5)}\n',
            '            rows[m.group(1)] = {"severity": m.group(2), "status": m.group(4), "report": m.group(5)}\n',
          ],
        ],
      },
    },
    {
      label: "sigil-draft",
      message: `Add a draft of the sigil 0.1 report

Findings only, no write-ups yet. Not linked from FINDINGS.md until it's
final, so check-index will complain; that's expected for drafts.`,
      author: "malik",
      daysAgo: 244,
      changes: {
        "reports/2026-02-sigil-0.1.md": sigilReportDraft,
      },
    },
    {
      label: "sigil-final",
      message: `Publish the sigil 0.1 report

SIGIL-01 is fixed on main and was found independently by theo, so
there's no reason to wait for the 0.2.0 release. Statuses say 0.2.0
because that's the first release with the fixes.`,
      author: "malik",
      daysAgo: 226,
      changes: {
        "reports/2026-02-sigil-0.1.md": sigilReport,
        "FINDINGS.md": [
          [
            "| LATCH-05 | Info | Docs suggest 16-byte root keys | Fixed in 0.2.1 | [2025-11](reports/2025-11-latch-0.2.md) |\n",
            `| LATCH-05 | Info | Docs suggest 16-byte root keys | Fixed in 0.2.1 | [2025-11](reports/2025-11-latch-0.2.md) |

## sigil

| ID | Severity | Title | Status | Report |
|----|----------|-------|--------|--------|
| SIGIL-01 | Medium | verify_strict accepts non-canonical public keys | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |
| SIGIL-02 | Low | SigningKey is Clone | Acknowledged | [2026-02](reports/2026-02-sigil-0.1.md) |
| SIGIL-03 | Low | Error variants invite branching | Acknowledged | [2026-02](reports/2026-02-sigil-0.1.md) |
| SIGIL-04 | Info | No fuzzing | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |
`,
          ],
        ],
      },
    },
    {
      label: "beacon-report",
      message: `Add the beacon announcements report

Requested by the beacon maintainers in the issue tracker. All five
findings are fixed in beacon 0.6.0, which shipped last week, so this
goes out in full.`,
      author: "malik",
      daysAgo: 196,
      changes: {
        "reports/2026-04-beacon-announcements.md": beaconReport,
        "FINDINGS.md": [
          [
            "## latch\n",
            `## beacon

| ID | Severity | Title | Status | Report |
|----|----------|-------|--------|--------|
| BEACON-01 | High | Signature covers a re-serialised message | Fixed in 0.6.0 | [2026-04](reports/2026-04-beacon-announcements.md) |
| BEACON-02 | Medium | Sequence numbers reset on restart | Fixed in 0.6.0 | [2026-04](reports/2026-04-beacon-announcements.md) |
| BEACON-03 | Medium | 24-hour freshness window | Fixed in 0.6.0 | [2026-04](reports/2026-04-beacon-announcements.md) |
| BEACON-04 | Low | Peer IDs are raw key bytes | Fixed in 0.6.0 | [2026-04](reports/2026-04-beacon-announcements.md) |
| BEACON-05 | Info | Strict and permissive verification mixed | Fixed in 0.6.0 | [2026-04](reports/2026-04-beacon-announcements.md) |

## latch
`,
          ],
        ],
      },
    },
    {
      label: "beacon-links",
      message: `beacon report: link each finding to its fix

So readers can check the fixes themselves instead of taking the status
column on trust.`,
      author: "ada",
      daysAgo: 186,
      changes: {
        "reports/2026-04-beacon-announcements.md": [
          [
            "**Retest:** v2 messages are verified over the raw bytes and the decoder\nis strict. Retested 2026-04-21.\n",
            "**Retest:** v2 messages are verified over the raw bytes and the decoder\nis strict. Retested 2026-04-21.\n\nFix: beacon commit 4e1a9c2, \"Verify announcements over received bytes\".\n",
          ],
          [
            "**Recommendation:** use the announcement timestamp, or persist the\ncounter.\n",
            "**Recommendation:** use the announcement timestamp, or persist the\ncounter.\n\nFix: beacon commit 9b03d7e, \"Order announcements by timestamp\".\n",
          ],
          [
            "**Recommendation:** 10 minutes, with a configurable allowance for clock\nskew.\n",
            "**Recommendation:** 10 minutes, with a configurable allowance for clock\nskew.\n\nFix: beacon commit 9b03d7e (same change as BEACON-02).\n",
          ],
          [
            "keys, or canonicalise before using the bytes as an ID.\n",
            "keys, or canonicalise before using the bytes as an ID.\n\nFix: beacon commit c58e210, \"Switch to sigil and verify_strict\".\n",
          ],
        ],
      },
    },
    {
      label: "fuzzing-method",
      message: `METHODOLOGY: describe how we fuzz during reviews

What we fuzz, for how long, and what we hand over to the maintainers
afterwards (targets and a minimised corpus).`,
      author: "theo",
      daysAgo: 174,
      changes: {
        "METHODOLOGY.md": [
          [
            "We write tests for every finding we can reproduce, and send them to the\nmaintainers with the finding.\n",
            `We write tests for every finding we can reproduce, and send them to the
maintainers with the finding.

### Fuzzing

Anything in scope that parses untrusted bytes gets a fuzz target, if it
doesn't already have one. We run each target for at least 24 CPU-hours
during the review, and differential targets (comparing against a second
implementation) where one exists, because those find logic bugs and not
only crashes.

At the end we hand the maintainers the targets and a minimised corpus,
and recommend they keep running them. A fuzz target that only ran
during the audit is worth very little a year later.
`,
          ],
        ],
      },
    },
    {
      label: "sigil-late-finding",
      message: `sigil 0.1: add SIGIL-05, reported after publication

The nonce in sign() wasn't zeroized. We should have caught this; it was
reported in sigil's issue tracker instead. Added as a dated late
finding rather than rewriting the report.`,
      author: "zeynep",
      daysAgo: 150,
      changes: {
        "reports/2026-02-sigil-0.1.md": [
          [
            "| SIGIL-04 | Info | No fuzzing | Fixed in 0.2.0 |\n",
            "| SIGIL-04 | Info | No fuzzing | Fixed in 0.2.0 |\n| SIGIL-05 | Low | Signing nonce is not zeroized (late) | Fixed in 0.2.0 |\n",
          ],
          [
            "## General recommendations\n",
            `### SIGIL-05: Signing nonce is not zeroized

**Severity:** Low
**Status:** Fixed in 0.2.0

*Added 2026-05-23, after publication. Reported by an outside
contributor in sigil's issue tracker; we missed it.*

\`sign()\` wipes nothing it computes. The nonce \`r\` is as sensitive as
the secret scalar: anyone who learns it for one signature can solve
\`s = r + k·a\` for \`a\`. It was left on the stack when \`sign()\` returned.

**Recommendation:** zeroize \`r\` as soon as \`s\` is computed.

**Retest:** fixed as recommended. Retested 2026-05-25.

## General recommendations
`,
          ],
        ],
        "FINDINGS.md": [
          [
            "| SIGIL-04 | Info | No fuzzing | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |\n",
            "| SIGIL-04 | Info | No fuzzing | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |\n| SIGIL-05 | Low | Signing nonce is not zeroized | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |\n",
          ],
        ],
      },
    },
    {
      label: "tidepool-report",
      message: `Add the tidepool ingest and API report

Shared with the tidepool maintainers on 2026-06-05. Publishing now with
all findings open, at their request: they'd rather the public know about
TIDE-01 while they work on it, since anyone could find it in minutes.`,
      author: "malik",
      daysAgo: 132,
      changes: {
        "reports/2026-06-tidepool-ingest.md": tidepoolReport,
        "FINDINGS.md": [
          [
            "| SIGIL-05 | Low | Signing nonce is not zeroized | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |\n",
            `| SIGIL-05 | Low | Signing nonce is not zeroized | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |

## tidepool

| ID | Severity | Title | Status | Report |
|----|----------|-------|--------|--------|
| TIDE-01 | High | Unbounded line length in the feed parser | Open | [2026-06](reports/2026-06-tidepool-ingest.md) |
| TIDE-02 | Medium | No HTTP server timeouts | Open | [2026-06](reports/2026-06-tidepool-ingest.md) |
| TIDE-03 | Medium | Station IDs used in archive paths | Open | [2026-06](reports/2026-06-tidepool-ingest.md) |
| TIDE-04 | Low | Error responses echo raw input | Open | [2026-06](reports/2026-06-tidepool-ingest.md) |
| TIDE-05 | Low | Feed tokens compared with == | Open | [2026-06](reports/2026-06-tidepool-ingest.md) |
| TIDE-06 | Info | Parser is not fuzzed | Open | [2026-06](reports/2026-06-tidepool-ingest.md) |
`,
          ],
        ],
      },
    },
    {
      label: "readme-list",
      message: `README: list published reports

The directory listing is fine for us; a dated list with one line per
report is better for everyone else.`,
      author: "zeynep",
      daysAgo: 118,
      changes: {
        "README.md": [
          [
            "## Asking for a review\n",
            `## Reports

| Date    | Project | Version | Highest severity |
|---------|---------|---------|------------------|
| 2026-06 | [tidepool ingest and API](reports/2026-06-tidepool-ingest.md) | 0.2.0 | High |
| 2026-04 | [beacon announcements](reports/2026-04-beacon-announcements.md) | 0.5.2 | High |
| 2026-02 | [sigil](reports/2026-02-sigil-0.1.md) | 0.1.0 | Medium |
| 2025-11 | [latch](reports/2025-11-latch-0.2.md) | 0.2.0 | High |

## Asking for a review
`,
          ],
        ],
      },
    },
    {
      label: "latch-retest",
      message: `Add the latch 0.4 retest

LATCH-03 and LATCH-04 are fixed. One new Low finding in the channel
binding code, accepted by the maintainers until 0.5.`,
      author: "malik",
      daysAgo: 96,
      changes: {
        "reports/2026-07-latch-0.4-retest.md": latchRetest,
        "FINDINGS.md": [
          [
            "| LATCH-03 | Low | Errors include the full token | Open | [2025-11](reports/2025-11-latch-0.2.md) |\n| LATCH-04 | Low | Token length is unbounded | Acknowledged | [2025-11](reports/2025-11-latch-0.2.md) |\n",
            "| LATCH-03 | Low | Errors include the full token | Fixed in 0.2.2 | [2025-11](reports/2025-11-latch-0.2.md) |\n| LATCH-04 | Low | Token length is unbounded | Fixed in 0.3.0 | [2025-11](reports/2025-11-latch-0.2.md) |\n",
          ],
          [
            "| LATCH-05 | Info | Docs suggest 16-byte root keys | Fixed in 0.2.1 | [2025-11](reports/2025-11-latch-0.2.md) |\n",
            "| LATCH-05 | Info | Docs suggest 16-byte root keys | Fixed in 0.2.1 | [2025-11](reports/2025-11-latch-0.2.md) |\n| LATCH-06 | Low | Channel binding is optional per caveat | Acknowledged | [2026-07](reports/2026-07-latch-0.4-retest.md) |\n",
          ],
        ],
        "reports/2025-11-latch-0.2.md": [
          [
            "error type in 0.2.2. Checked 2025-11-28.\n",
            "error type in 0.2.2. Checked 2025-11-28.\n\n*Update 2026-07-06: fixed in 0.2.2, see the 0.4 retest.*\n",
          ],
          [
            "default) before parsing.\n",
            "default) before parsing.\n\n*Update 2026-07-06: fixed in 0.3.0, see the 0.4 retest.*\n",
          ],
        ],
        "README.md": [
          [
            "| 2026-06 | [tidepool ingest and API]",
            "| 2026-07 | [latch retest](reports/2026-07-latch-0.4-retest.md) | 0.4.0 | Low |\n| 2026-06 | [tidepool ingest and API]",
          ],
        ],
      },
    },
    {
      label: "tidepool-retest",
      message: `tidepool report: retest TIDE-01 and TIDE-03

Both fixed in tidepool 0.2.1. Retested by malik against the original
reproducers; I'm recording the results with his notes.`,
      author: "kofi",
      daysAgo: 79,
      changes: {
        "reports/2026-06-tidepool-ingest.md": [
          [
            "| TIDE-01 | High | Unbounded line length in the feed parser | Open |\n",
            "| TIDE-01 | High | Unbounded line length in the feed parser | Fixed in 0.2.1 |\n",
          ],
          [
            "| TIDE-03 | Medium | Station IDs used in archive paths | Open |\n",
            "| TIDE-03 | Medium | Station IDs used in archive paths | Fixed in 0.2.1 |\n",
          ],
          [
            "**Severity:** High\n**Status:** Open\n",
            "**Severity:** High\n**Status:** Fixed in 0.2.1\n",
          ],
          [
            "request body with `http.MaxBytesReader`.\n",
            "request body with `http.MaxBytesReader`.\n\n**Retest:** lines are capped at 4 KiB and request bodies at 1 MiB. The\nreproducer gets a 413 after 1 MiB. Retested 2026-08-01.\n",
          ],
          [
            "### TIDE-03: Station IDs used in archive paths\n\n**Severity:** Medium\n**Status:** Open\n",
            "### TIDE-03: Station IDs used in archive paths\n\n**Severity:** Medium\n**Status:** Fixed in 0.2.1\n",
          ],
          [
            "ingest, and use `filepath.Join` plus a prefix check when writing.\n",
            "ingest, and use `filepath.Join` plus a prefix check when writing.\n\n**Retest:** station IDs are validated at ingest, and the archive writer\nrefuses paths outside its root. Retested 2026-08-01.\n",
          ],
        ],
        "FINDINGS.md": [
          [
            "| TIDE-01 | High | Unbounded line length in the feed parser | Open |",
            "| TIDE-01 | High | Unbounded line length in the feed parser | Fixed in 0.2.1 |",
          ],
          [
            "| TIDE-03 | Medium | Station IDs used in archive paths | Open |",
            "| TIDE-03 | Medium | Station IDs used in archive paths | Fixed in 0.2.1 |",
          ],
        ],
      },
    },
    {
      label: "severity-dos",
      message: `SEVERITY: say how we rate denial of service

We rated TIDE-01 High and LATCH-04 Low, and people reasonably asked why.
The difference is who can trigger it and what it takes down.`,
      author: "zeynep",
      daysAgo: 61,
      changes: {
        "SEVERITY.md": [
          [
            "## Status\n",
            `### Denial of service

A crash or resource exhaustion that any unauthenticated client can
trigger against a service is **High**. If it needs authentication, or
only slows things down, it's **Medium**. If it needs an attacker to
already hold a valid credential and only affects their own requests,
it's **Low**. TIDE-01 is the first case; LATCH-04 the last.

## Status
`,
          ],
        ],
      },
    },
    {
      label: "template-range",
      message: `TEMPLATE: add a commit range row

For follow-up reviews, "version 0.3.0" doesn't say which changes we
actually looked at. A range does.`,
      author: "tomas",
      daysAgo: 44,
      changes: {
        "TEMPLATE.md": [
          [
            "| Version | |\n",
            "| Version | |\n| Commit range | (for follow-up reviews, e.g. v0.1.0..v0.2.0) |\n",
          ],
        ],
      },
    },
    {
      label: "sigil-03-report",
      message: `Add the sigil 0.3 report

Covers everything since 0.1: batch verification, generate(), TryFrom
and the SIGIL-01/05 fixes. Nothing above Low. theo did the fuzzing half
of this one.`,
      author: "malik",
      daysAgo: 24,
      changes: {
        "reports/2026-09-sigil-0.3.md": sigil03Report,
        "FINDINGS.md": [
          [
            "| SIGIL-05 | Low | Signing nonce is not zeroized | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |\n",
            `| SIGIL-05 | Low | Signing nonce is not zeroized | Fixed in 0.2.0 | [2026-02](reports/2026-02-sigil-0.1.md) |
| SIGIL-06 | Low | Batch verification accepts weak keys | Acknowledged | [2026-09](reports/2026-09-sigil-0.3.md) |
| SIGIL-07 | Low | Hasher state holding the seed is not wiped | Open | [2026-09](reports/2026-09-sigil-0.3.md) |
| SIGIL-08 | Info | CI fuzz runs start from an empty corpus | Open | [2026-09](reports/2026-09-sigil-0.3.md) |
| SIGIL-09 | Info | MSRV policy is undocumented | Open | [2026-09](reports/2026-09-sigil-0.3.md) |
`,
          ],
        ],
        "README.md": [
          [
            "| 2026-07 | [latch retest]",
            "| 2026-09 | [sigil follow-up](reports/2026-09-sigil-0.3.md) | 0.3.0 | Low |\n| 2026-07 | [latch retest]",
          ],
        ],
      },
    },
    {
      label: "check-sort",
      message: `tools: print errors sorted by finding ID

The output order depended on the order reports were globbed in, which
made diffs between runs noisy.`,
      author: "malik",
      daysAgo: 10,
      changes: {
        "tools/check-index.py": [
          ["    for e in errors:\n", "    for e in sorted(errors):\n"],
        ],
      },
    },
    {
      label: "sigil-07-note",
      message: `sigil 0.3: note the maintainers' plan for SIGIL-07

Still open. They'll switch to an explicit hasher in 0.3.1.`,
      author: "zeynep",
      daysAgo: 4,
      changes: {
        "reports/2026-09-sigil-0.3.md": [
          [
            "enable sha2's `zeroize` support when it is available.\n",
            "enable sha2's `zeroize` support when it is available.\n\n*Update 2026-10-16: the maintainers will hash with an explicit,\nwiped `Sha512` in 0.3.1.*\n",
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Review request: beacon signed announcements",
      author: "ada",
      daysAgo: 222,
      body: `beacon (lumen-labs) is a sans-I/O library for signed peer announcements. A few small networks run it in production now, including two community mesh projects, and we've never had anyone outside the team look at the verification path.

What we're worried about, in order:
1. Whether a relay can be made to forward something the signer didn't sign.
2. Replay of old announcements.
3. Whether we're using ed25519-dalek correctly (we mix verify and verify_strict).

Happy to walk you through the code on a call. The wire format is in docs/wire.md.`,
      labels: ["review-request"],
      assignees: ["malik"],
      state: "solved",
      closedHoursAfter: 860,
      comments: [
        {
          author: "malik",
          body: "Thanks ada. This is a good fit: small, widely depended on, and point 3 is in our wheelhouse. We can start the week of 2026-03-16. Can you freeze a commit for us?",
          hoursAfter: 30,
        },
        {
          author: "ada",
          body: "0.5.2 is tagged. tomas will be around for questions too.",
          hoursAfter: 33,
          replyTo: 0,
        },
        {
          author: "zeynep",
          body: "I'll join for the signature parts. Point 3 alone is worth a finding, I suspect.",
          hoursAfter: 40,
          reactions: [{ emoji: "😅", by: ["ada"] }],
        },
        {
          author: "malik",
          body: "Report is published. Thanks for turning the fixes around so quickly.",
          hoursAfter: 860,
          reactions: [{ emoji: "🎉", by: ["ada", "tomas"] }],
        },
      ],
    },
    {
      title: "How do you rate timing leaks in code that only handles public data?",
      author: "theo",
      daysAgo: 230,
      body: "Reading the sigil 0.1 draft: verification uses a constant-time comparison, but there's no finding for it either way. If a verification path had a timing leak on public inputs, what would that be rated? Info? Not a finding at all?",
      labels: ["question"],
      state: "solved",
      closedHoursAfter: 72,
      comments: [
        {
          author: "zeynep",
          body: "Not a finding, as long as everything involved really is public. The trap is the \"really\": a message that's public to the verifier might not be public to an observer on the network. We'd rate it by what the leak could reveal to whom.",
          hoursAfter: 8,
        },
        {
          author: "malik",
          body: "In practice: Info if we can't name a secret it leaks, and we'd still say so in the report so readers know we looked.",
          hoursAfter: 11,
          replyTo: 0,
        },
        {
          author: "theo",
          body: "That makes sense. Might be worth a sentence in SEVERITY.md, this question will come up again.",
          hoursAfter: 20,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Review request: tidepool ingest parser",
      author: "kofi",
      daysAgo: 168,
      body: `tidepool's ingest endpoint is public (buoys report from changing cellular IPs), and the feed parser is the first thing every request hits. It was written quickly two years ago and nobody has looked at it with an attacker's eyes.

I know you mostly review crypto code. If this is outside what you do, no hard feelings.`,
      labels: ["review-request"],
      assignees: ["malik", "zeynep"],
      state: "solved",
      closedHoursAfter: 900,
      comments: [
        {
          author: "zeynep",
          body: "It's outside our usual area, but several research groups publish through tidepool and a parser on a public endpoint is exactly the kind of thing that matters. We'll do it, scoped to ingest and the API.",
          hoursAfter: 26,
          reactions: [{ emoji: "🙏", by: ["kofi", "lena"] }],
        },
        {
          author: "theo",
          body: "If you want, I can write a Go fuzz harness for the parser ahead of time. Would be a nice warm-up.",
          hoursAfter: 31,
        },
        {
          author: "malik",
          body: "Yes please. Send it to kofi as a patch to tidepool, not here.",
          hoursAfter: 35,
          replyTo: 1,
        },
        {
          author: "kofi",
          body: "Report's out and 01/03 are fixed. Thanks all, this was really useful.",
          hoursAfter: 900,
        },
      ],
    },
    {
      title: "BEACON-03 is marked fixed but v1 messages still get 24 hours",
      author: "tomas",
      daysAgo: 160,
      body: "The fix in beacon 0.6.0 shortened the freshness window for v2 announcements only. v1 is still accepted for compatibility, with the old 24-hour window. Either the status should say \"Fixed for v2\" or we need to drop v1. As a beacon maintainer I'd rather the report be accurate than flattering.",
      labels: ["correction"],
      assignees: ["malik"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "malik",
          body: "You're right, I retested with v2 messages only. Embarrassing. When does beacon drop v1?",
          hoursAfter: 4,
        },
        {
          author: "tomas",
          body: "0.7.0, planned for about a month from now. Relays already log a deprecation warning.",
          hoursAfter: 7,
          replyTo: 0,
        },
        {
          author: "ada",
          body: "Confirming: v1 goes away in 0.7. Fine with leaving the status until then if there's a note.",
          hoursAfter: 9,
        },
        {
          author: "malik",
          body: "Checked 0.7.0 today: v1 is gone, so the status is accurate again as of that release. I'd still like to add a dated note to the finding so the history is visible.",
          hoursAfter: 120,
        },
      ],
    },
    {
      title: "Broken link to the latch retest from the 0.2 report",
      author: "self",
      daysAgo: 92,
      body: "The update notes under LATCH-03 and LATCH-04 say \"see the 0.4 retest\", but there's no link, and the file name isn't obvious from the report. Small thing, but I went looking for it in the README first and it took a while.",
      labels: ["docs", "good-first-issue"],
      state: "solved",
      closedHoursAfter: 30,
      comments: [
        {
          author: "malik",
          body: "Good point. The README table links it now; I'll make the notes links too.",
          hoursAfter: 5,
        },
        {
          author: "self",
          body: "Thanks! The README table is great, by the way.",
          hoursAfter: 9,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Publish PDFs alongside the Markdown?",
      author: "wren",
      daysAgo: 108,
      body: "Our compliance people want a PDF they can attach to a vendor assessment. Would you consider generating PDFs for each report?",
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 60,
      comments: [
        {
          author: "zeynep",
          body: "We'd rather not maintain a PDF pipeline. Pandoc with the default template produces something perfectly attachable from any of these files: `pandoc reports/2026-04-beacon-announcements.md -o beacon.pdf`.",
          hoursAfter: 12,
        },
        {
          author: "wren",
          body: "Fair enough, that works. Might be worth a line in the README for the next person who asks.",
          hoursAfter: 20,
          replyTo: 0,
        },
      ],
    },
    {
      title: "check-index.py fails on reports with Windows line endings",
      author: "diego",
      daysAgo: 70,
      body: `Editing a report on Windows and running \`make check\`:

\`\`\`
TIDE-02: severity Medium in report, None in index
\`\`\`

The severity regex anchors on \`$\`-less patterns but the row regex ends with \`|$\` and the lines still have a trailing \\r after splitlines() on some files I'd copied over. Converting to LF fixes it.`,
      labels: ["bug", "tools"],
      state: "solved",
      closedHoursAfter: 50,
      comments: [
        {
          author: "malik",
          body: "splitlines() handles \\r\\n, so I think the \\r came from a file with mixed endings. Either way, I'd rather add a .gitattributes forcing LF than make the script tolerant of everything.",
          hoursAfter: 8,
        },
        {
          author: "diego",
          body: "Yep, it was mixed: my editor converted only the lines I'd touched. LF everywhere is fine by me.",
          hoursAfter: 14,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Should findings carry CVSS scores?",
      author: "noor",
      daysAgo: 55,
      body: "Our vulnerability management tooling ingests CVSS vectors. Right now someone on our team translates your severity into CVSS by hand, which is guesswork. Would you add a CVSS 3.1 vector to each finding?",
      labels: ["question", "discussion"],
      comments: [
        {
          author: "zeynep",
          body: "I'm reluctant. CVSS was built for deployed products, and for a library the right score depends entirely on how the library is used. LATCH-01 is a 9-something in an API gateway and a 3 in a CLI tool. A single number would be precise and wrong.",
          hoursAfter: 6,
        },
        {
          author: "noor",
          body: "I understand, but the alternative is that someone less informed picks the number for you. Isn't a careful wrong number better than a careless one?",
          hoursAfter: 10,
          replyTo: 0,
        },
        {
          author: "malik",
          body: "I'm somewhere in between. We could publish a vector for the \"typical\" deployment we describe in each report's summary, clearly labelled as such.",
          hoursAfter: 16,
          replyTo: 1,
        },
        {
          author: "zeynep",
          body: "\"Typical\" is doing a lot of work there. Let's see the archived patch's approach before deciding; I'll leave this open.",
          hoursAfter: 30,
          replyTo: 2,
        },
        {
          author: "felix",
          body: "Lurker from a company that consumes these: plain-language severity plus a clear description has been more useful to us than any CVSS score. Please don't drop the prose for numbers.",
          hoursAfter: 52,
          reactions: [{ emoji: "👍", by: ["zeynep", "wren"] }],
        },
      ],
    },
    {
      title: "Machine-readable findings index",
      author: "self",
      daysAgo: 20,
      body: "Would a `findings.json` generated from FINDINGS.md be welcome? I'd like to show Keystone findings next to dependency versions in our internal dashboard, and parsing Markdown tables from CI feels fragile. check-index.py already parses everything it needs, so it could write the JSON as a side effect.",
      labels: ["enhancement", "tools"],
      comments: [
        {
          author: "malik",
          body: "Yes, as long as the Markdown stays the source of truth and the JSON is generated, not hand-edited.",
          hoursAfter: 7,
        },
        {
          author: "self",
          body: "Agreed. I'll put up a patch that adds an `--json` flag.",
          hoursAfter: 12,
          replyTo: 0,
        },
      ],
    },
    {
      title: "SIGIL-06 should be Medium, not Low",
      author: "ada",
      daysAgo: 18,
      body: `I'm biased as a sigil user, but: a batch verifier that silently accepts signatures under weak keys, in a crate whose README says "strict by default", is a trap. The module docs mention it, but people read the README and the function signature, not module docs.

By your own SEVERITY.md, "makes a serious mistake by callers likely" is Medium.`,
      labels: ["question", "severity"],
      comments: [
        {
          author: "malik",
          body: "The argument for Low: the caller has to opt into the `batch` feature and the cofactored rule is in the first paragraph of the module docs. The argument for Medium is yours, and it's a good one.",
          hoursAfter: 5,
        },
        {
          author: "zeynep",
          body: "I'm a sigil maintainer, so I'll stay out of the rating. As a maintainer, though: I'd rather fix it than argue about it. An `is_weak()` check per item costs about 2% of a 64-item batch.",
          hoursAfter: 9,
        },
        {
          author: "ada",
          body: "If it's fixed in 0.3.1 I don't much care what the label says. But for the next reader, I'd add a note to the finding about why it's Low.",
          hoursAfter: 15,
          replyTo: 1,
          reactions: [{ emoji: "👍", by: ["malik"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "beacon report: link each finding to its fix",
      author: "ada",
      daysAgo: 189,
      labels: ["docs"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds a \"Fix:\" line with the beacon commit for each finding, so readers can check them. BEACON-05 doesn't have its own commit, it was part of the sigil switch.",
          hoursAfter: 0,
          base: "beacon-report",
          commits: [
            {
              message: `beacon report: link each finding to its fix`,
              author: "ada",
              daysAgo: 189,
              changes: {
                "reports/2026-04-beacon-announcements.md": [
                  [
                    "**Retest:** v2 messages are verified over the raw bytes and the decoder\nis strict. Retested 2026-04-21.\n",
                    "**Retest:** v2 messages are verified over the raw bytes and the decoder\nis strict. Retested 2026-04-21.\n\nFix: 4e1a9c2\n",
                  ],
                  [
                    "**Recommendation:** use the announcement timestamp, or persist the\ncounter.\n",
                    "**Recommendation:** use the announcement timestamp, or persist the\ncounter.\n\nFix: 9b03d7e\n",
                  ],
                  [
                    "**Recommendation:** 10 minutes, with a configurable allowance for clock\nskew.\n",
                    "**Recommendation:** 10 minutes, with a configurable allowance for clock\nskew.\n\nFix: 9b03d7e\n",
                  ],
                  [
                    "keys, or canonicalise before using the bytes as an ID.\n",
                    "keys, or canonicalise before using the bytes as an ID.\n\nFix: c58e210\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "malik",
              hoursAfter: 20,
              summary: "Thanks! Bare hashes are hard to read in a report; could you add the commit summary and say which repo?",
              comments: [
                {
                  body: "\"beacon commit 4e1a9c2, \\\"Verify announcements over received bytes\\\"\" or similar. Someone reading this in two years won't know which repository a short hash belongs to.",
                  path: "reports/2026-04-beacon-announcements.md",
                  line: 63,
                },
                {
                  body: "Same commit as BEACON-02; worth saying so explicitly so nobody thinks it's a typo.",
                  path: "reports/2026-04-beacon-announcements.md",
                  line: 92,
                },
              ],
            },
          ],
        },
        {
          description: "Commit summaries and the repository name added, and the shared fix for 02/03 called out.",
          hoursAfter: 70,
          fromHistory: ["beacon-links"],
          reviews: [
            {
              author: "malik",
              hoursAfter: 74,
              verdict: "accept",
              summary: "Perfect.",
            },
            {
              author: "zeynep",
              hoursAfter: 80,
              verdict: "accept",
              summary: "LGTM, merging.",
              comments: [
                {
                  body: "Nice to have this one explicit.",
                  path: "reports/2026-04-beacon-announcements.md",
                  line: 92,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "METHODOLOGY: describe the fuzzing setup",
      author: "theo",
      daysAgo: 180,
      labels: ["docs"],
      state: "merged",
      revisions: [
        {
          description:
            "Writes down what we've actually been doing on the last two reviews: fuzz anything that parses untrusted input, and hand the targets over.",
          hoursAfter: 0,
          base: "beacon-report",
          commits: [
            {
              message: `METHODOLOGY: describe how we fuzz during reviews`,
              author: "theo",
              daysAgo: 180,
              changes: {
                "METHODOLOGY.md": [
                  [
                    "We write tests for every finding we can reproduce, and send them to the\nmaintainers with the finding.\n",
                    `We write tests for every finding we can reproduce, and send them to the
maintainers with the finding.

### Fuzzing

Anything in scope that parses untrusted bytes gets a fuzz target. We run
each target until coverage stops growing.
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "zeynep",
              hoursAfter: 30,
              summary: "Good start. Two things I'd want a maintainer to know.",
              comments: [
                {
                  body: "\"Until coverage stops growing\" is hard to verify from outside. Can we commit to a number of CPU-hours instead? 24 is what we've done in practice.",
                  path: "METHODOLOGY.md",
                  line: 29,
                },
                {
                  body: "Please mention differential fuzzing. SIGIL-01 came from one, and it's the kind that finds logic bugs rather than crashes.",
                  path: "METHODOLOGY.md",
                  line: 28,
                  endLine: 29,
                },
              ],
            },
          ],
        },
        {
          description:
            "Commits to 24 CPU-hours per target, mentions differential targets, and adds a paragraph about handing targets and a corpus to maintainers.",
          hoursAfter: 140,
          fromHistory: ["fuzzing-method"],
          reviews: [
            {
              author: "zeynep",
              hoursAfter: 150,
              verdict: "accept",
              summary: "Exactly right. The last paragraph is my favourite.",
            },
            {
              author: "malik",
              hoursAfter: 153,
              verdict: "accept",
              summary: "Merging.",
            },
          ],
        },
      ],
    },
    {
      title: "tidepool report: retest TIDE-01 and TIDE-03",
      author: "kofi",
      daysAgo: 80,
      labels: ["retest"],
      state: "merged",
      revisions: [
        {
          description:
            "Records malik's retest results for the two fixes in tidepool 0.2.1, in the report and in FINDINGS.md. The other four findings are still open on our side.",
          hoursAfter: 0,
          fromHistory: ["tidepool-retest"],
          reviews: [
            {
              author: "malik",
              hoursAfter: 10,
              verdict: "accept",
              summary: "Matches my notes. Thanks for writing it up.",
              comments: [
                {
                  body: "Good that this records the 413 the reproducer now gets. Observed behaviour is more convincing than just \"fixed\".",
                  path: "reports/2026-06-tidepool-ingest.md",
                  line: 60,
                  endLine: 61,
                  resolved: true,
                },
              ],
            },
            {
              author: "zeynep",
              hoursAfter: 18,
              verdict: "accept",
              summary: "LGTM.",
            },
          ],
        },
      ],
    },
    {
      title: "tools: export findings as JSON",
      author: "self",
      daysAgo: 6,
      labels: ["tools", "enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "Adds `--json PATH` to check-index.py. It writes every row of FINDINGS.md as an object with id, project, severity, title, status and report. The Markdown stays the source of truth.",
          hoursAfter: 0,
          base: "sigil-07-note",
          commits: [
            {
              message: `tools: add --json to check-index.py`,
              author: "self",
              daysAgo: 6,
              changes: {
                "tools/check-index.py": [
                  ["import re\nimport sys\n", "import json\nimport re\nimport sys\n"],
                  [
                    "def main():\n    reports, index = findings_in_reports(), findings_in_index()\n",
                    `def write_json(index, path):
    rows = [{"id": fid, "project": fid.split("-")[0].lower(), **row} for fid, row in index.items()]
    Path(path).write_text(json.dumps(rows, indent=2) + "\\n", encoding="utf-8")


def main():
    reports, index = findings_in_reports(), findings_in_index()
    if "--json" in sys.argv:
        write_json(index, sys.argv[sys.argv.index("--json") + 1])
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "malik",
              hoursAfter: 14,
              summary: "Useful, thanks. A few things before this goes in.",
              comments: [
                {
                  body: "The title isn't in `index` rows (we only keep severity, status and report), so the JSON won't have it even though the description says it does.",
                  path: "tools/check-index.py",
                  line: 37,
                },
                {
                  body: "Please write the JSON only if the check passes. Otherwise a broken index gets exported and someone's dashboard shows garbage.",
                  path: "tools/check-index.py",
                  line: 48,
                  endLine: 49,
                },
                {
                  body: "`sys.argv.index(...) + 1` throws IndexError if --json is the last argument. argparse would make this clearer.",
                  path: "tools/check-index.py",
                  line: 49,
                },
              ],
            },
          ],
          comments: [
            {
              author: "zeynep",
              body: "Could we sort by ID in the output, like the error messages now are? Stable diffs for anyone who commits the JSON.",
              hoursAfter: 20,
            },
          ],
        },
        {
          description:
            "Switches to argparse, keeps the title in index rows, writes the JSON only when the check passes, and sorts rows by ID.",
          hoursAfter: 52,
          commits: [
            {
              message: `tools: address review on --json`,
              author: "self",
              daysAgo: 4,
              changes: {
                "tools/check-index.py": [
                  ["import json\nimport re\n", "import argparse\nimport json\nimport re\n"],
                  [
                    '"severity": m.group(2), "status": m.group(4),',
                    '"severity": m.group(2), "title": m.group(3), "status": m.group(4),',
                  ],
                  [
                    "for fid, row in index.items()]\n",
                    "for fid, row in sorted(index.items())]\n",
                  ],
                  [
                    "    reports, index = findings_in_reports(), findings_in_index()\n    if \"--json\" in sys.argv:\n        write_json(index, sys.argv[sys.argv.index(\"--json\") + 1])\n",
                    "    parser = argparse.ArgumentParser()\n    parser.add_argument(\"--json\", metavar=\"PATH\", help=\"write the index as JSON if the check passes\")\n    args = parser.parse_args()\n    reports, index = findings_in_reports(), findings_in_index()\n",
                  ],
                  [
                    "    return 1 if errors else 0\n",
                    "    if errors:\n        return 1\n    if args.json:\n        write_json(index, args.json)\n    return 0\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "malik",
              hoursAfter: 60,
              verdict: "accept",
              summary: "All good from me. Needs zeynep too.",
              comments: [
                {
                  body: "Thanks, this is the behaviour I wanted.",
                  path: "tools/check-index.py",
                  line: 66,
                  endLine: 70,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "Add CVSS vectors to every finding",
      author: "noor",
      daysAgo: 48,
      labels: ["discussion"],
      state: "archived",
      revisions: [
        {
          description:
            "A proposal to go with the CVSS discussion: adds a `**CVSS:**` line to the template and to the latch findings, scored for the deployment the report's summary describes.",
          hoursAfter: 0,
          base: "severity-dos",
          commits: [
            {
              message: `Add CVSS 3.1 vectors to the template and latch findings`,
              author: "noor",
              daysAgo: 48,
              changes: {
                "TEMPLATE.md": [
                  [
                    "**Severity:** <level>\n",
                    "**Severity:** <level>\n**CVSS:** <vector> (for the deployment described in the summary)\n",
                  ],
                ],
                "reports/2025-11-latch-0.2.md": [
                  [
                    "### LATCH-01: Duplicate `exp` caveats: the last one wins\n\n**Severity:** High\n",
                    "### LATCH-01: Duplicate `exp` caveats: the last one wins\n\n**Severity:** High\n**CVSS:** CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N (8.1)\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "zeynep",
              hoursAfter: 26,
              summary: "Thanks for making it concrete; it helps. I still don't think we should do this, reasons in the issue.",
              comments: [
                {
                  body: "PR:L assumes the attacker holds a token, which is right, but C:H/I:H assumes the token grants access to everything. For most latch users it's one API path. This is the problem in miniature.",
                  path: "reports/2025-11-latch-0.2.md",
                  line: 48,
                },
              ],
            },
          ],
          comments: [
            {
              author: "noor",
              body: "That's a fair hit. I'll archive this and keep translating on our side; maybe a \"suggested CVSS for a typical deployment\" section in the summary someday.",
              hoursAfter: 40,
              reactions: [{ emoji: "❤️", by: ["zeynep"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Draft: latch 0.5 report",
      author: "zeynep",
      daysAgo: 2,
      labels: ["report"],
      state: "draft",
      revisions: [
        {
          description:
            "Work in progress. latch 0.5 adds the required-binding verifier option from LATCH-06. Review dates and findings are placeholders until we start next week.",
          hoursAfter: 0,
          base: "sigil-07-note",
          commits: [
            {
              message: `Start the latch 0.5 report`,
              author: "zeynep",
              daysAgo: 2,
              changes: {
                "reports/2026-10-latch-0.5.md": `# latch 0.5: security review

| | |
|---|---|
| Project | latch, Keystone's signed capability tokens |
| Version | 0.5.0-rc.1 |
| Commit range | v0.4.0..v0.5.0-rc.1 |
| Reviewers | zeynep, malik |
| Dates | 2026-10-26 to (planned) 2026-11-06 |
| Status | Draft |

## Summary

TODO.

## Scope

### In scope

- \`src/binding.rs\` and the new \`VerifierOptions::require_binding\`
- Retest of LATCH-06

### Out of scope

- Everything unchanged since 0.4.0

### Not covered

## Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
`,
              },
            },
          ],
          comments: [
            {
              author: "malik",
              body: "I can start Wednesday instead of Monday, if that's ok. Monday and Tuesday are taken by the sigil 0.3.1 changes.",
              hoursAfter: 10,
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "reports-2026-h1",
      at: "readme-list",
      title: "Reports, first half of 2026",
      notes: `A snapshot of every report published between January and June 2026, for people who want a citable version.

- sigil 0.1 (one Medium, fixed)
- beacon announcements (one High, all fixed)
- tidepool ingest and API (one High, being fixed)

Statuses are as of the tag. FINDINGS.md on main is always the current picture.`,
      author: "zeynep",
      daysAgo: 117,
    },
  ],
};
