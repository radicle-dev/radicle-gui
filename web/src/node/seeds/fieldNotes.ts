import type { RepoSeed } from "./types";

// field-notes: self's private scratchpad of design notes for the Radicle 2
// web app. Only self seeds it.

const README = `# field-notes

Working notes for the Radicle 2 web app. Private on purpose: half of this is
wrong, and I'd rather be wrong here than in a design review.

- \`notes/\`: one file per open design question, rewritten as my thinking
  changes. Git history is the changelog.
- \`research/\`: summaries of conversations with people who use Radicle (or
  tried to and bounced).

Things graduate out of here into issues on the real repo once they're
concrete enough to argue about.
`;

const BROWSER_NODE = `# A node in a browser tab

Premise: opening the web app *is* running a node. No install, no daemon, no
"connect to your local node" screen. The tab gets a key, a small store, and
talks to seeds directly.

## What has to be true

1. **Storage.** Repos live in the browser (OPFS for packfiles, IndexedDB for
   refs and COB indexes). Quotas are per-origin and the browser can evict us
   under pressure unless \`navigator.storage.persist()\` is granted.
2. **Transport.** Browsers can't open raw TCP, so seeds need to speak
   something a tab can reach: WebTransport (HTTP/3) where available,
   WebSocket as the fallback. WebRTC only matters for tab-to-tab, which is a
   later problem.
3. **Keys.** The signing key is generated in the browser. Non-extractable
   WebCrypto keys would be ideal, but Ed25519 support is uneven, so we may
   need to hold raw key bytes, encrypted with a passphrase.

## Open questions

- What does "my node" mean when I have three tabs open? One elected leader
  tab (Web Locks API) that owns storage and connections, others talk to it
  over BroadcastChannel?
- How much do we fetch eagerly? Full clone of every followed repo will blow
  quotas on phones.
`;

const ORGS = `# Orgs

Orgs are actor repositories with several members. Changing the org (members,
profile, which repos it owns) needs \`threshold\` member signatures, the same
way repo delegates work.

## Why not just "a team"?

Because there's no server to be the source of truth. An org's membership is
whatever its members have signed. That's a feature (no admin can quietly
remove you) and a UX problem (adding someone takes a quorum).

## Rough model

- An org has members, each \`admin\` or \`member\`. Only admins' signatures
  count towards the threshold for membership changes.
- Repos owned by an org list the org as a delegate; the org's threshold
  then applies to canonical refs.
- Proposed changes show as pending until enough admins approve.

## Things I don't know yet

- Is an org with threshold 1 and three admins confusing? Any one admin can
  remove the other two.
`;

const ONBOARDING = `# Onboarding

Goal: someone who has never heard of Radicle can open a link to a repo,
read it, and leave a comment in under a minute, without being taught any
vocabulary first.

## Current flow (too long)

1. Land on repo.
2. Click "Comment".
3. Modal: "Create an identity". Explains DIDs.
4. Pick an alias.
5. Back to comment box.

## Ideas

- Don't block on identity until they actually submit.
- Never say DID in onboarding. "Your key" is enough.
`;

const INTERVIEWS = `# Interview summary (round 1)

Eight conversations, 30–45 min each. Mix of people already using Radicle
from the CLI and people who tried it and stopped.

## Themes

### "Where is my stuff?"
Five of eight couldn't say where a repo lives once it's on the network.
The ones who could had run a seed themselves.

### Seeding is invisible
Nobody connected "seeding" with "keeping this repo available". Two thought
it meant starring.

### Patches feel familiar, revisions don't
Everyone understood patches as pull requests. Revisions confused people
who'd only used GitHub: "so is this a new PR?"

## Quotes

> "I'd use it for my own projects tomorrow if I didn't have to keep a
> terminal open."

> "I don't want to learn what a delegate is. I want to know who can merge."
`;

export const fieldNotes: RepoSeed = {
  owner: { person: "self" },
  name: "field-notes",
  description: "Private design notes for the Radicle 2 web app: open questions, research, half-formed ideas.",
  defaultBranch: "main",
  visibility: "private",
  delegates: ["self"],
  threshold: 1,
  seeding: 1,
  files: {
    "README.md": README,
    "notes/browser-node.md": BROWSER_NODE,
    "notes/orgs.md": ORGS,
    "notes/onboarding.md": ONBOARDING,
    "research/interviews-summary.md": INTERVIEWS,
  },
  root: {
    label: "root",
    message: `Start field notes

Pulling scattered notes out of my notes app into something with history.
Three design questions and the first round of interview findings.`,
    author: "self",
    daysAgo: 31,
  },
  history: [
    {
      label: "browser-node-lifecycle",
      message: `browser-node: add tab lifecycle and eviction

Tried the leader-tab idea in a throwaway prototype. Works, but the leader
gets frozen when it's a background tab on mobile, and everything stalls.
Writing down what I learned before I forget.`,
      author: "self",
      daysAgo: 26,
      changes: {
        "notes/browser-node.md": [
          [
            `## Open questions\n`,
            `## Tab lifecycle

The node lives as long as some tab does. Things that kill or freeze it:

- **Background throttling.** Chrome freezes background tabs after ~5 min on
  mobile; timers stop, sockets are kept but not serviced. Desktop is more
  forgiving but still clamps timers to once a minute after a while.
- **Closing the last tab.** No graceful shutdown hook we can rely on;
  \`pagehide\` fires, \`beforeunload\` sometimes doesn't. Anything not yet
  flushed to OPFS is gone, so writes must be durable before we acknowledge
  them in the UI.
- **Leader tab goes to background.** Prototype result: other tabs stall
  waiting on a frozen leader. Leadership has to move to the visible tab on
  \`visibilitychange\`, which means the store must tolerate a handover
  mid-fetch.

A SharedWorker would sidestep most of this (one node, any number of tabs),
but Safari only brought SharedWorker back recently and it's not available in
some embedded webviews. Worth it as the primary path with leader election as
the fallback.

## Eviction

If the browser evicts our storage, the node forgets everything except what
seeds still have. That's fine for public repos (refetch) and catastrophic for
private ones that only existed here. So:

- Ask for persistent storage the first time someone creates a private repo,
  with an honest explanation of why.
- Show "only on this device" on any repo nobody else seeds. This repo, for
  instance.

## Open questions
`,
          ],
        ],
      },
    },
    {
      label: "interviews-round-1-more",
      message: `research: add the two late interviews and a theme on trust

Interviews seven and eight came in after the first write-up. Both were
people at small studios, and both raised the same thing: who do I trust
when there's no company in the middle?`,
      author: "self",
      daysAgo: 21,
      changes: {
        "research/interviews-summary.md": [
          [
            `## Quotes\n`,
            `### Trust needs a face
Small-team participants wanted to see *people*, not keys. "Signed by
z6Mk..." meant nothing; "Signed by Mira, who's a delegate here" did.
Avatars, aliases and "you follow this person" matter more than the crypto.

## Quotes
`,
          ],
          [
            `> "I don't want to learn what a delegate is. I want to know who can merge."\n`,
            `> "I don't want to learn what a delegate is. I want to know who can merge."

> "If I can't tell whether a patch came from my teammate or from someone
> pretending to be them, I'm not moving our work there."
`,
          ],
        ],
      },
    },
    {
      label: "orgs-approvals",
      message: `orgs: sketch the pending-approval flow

What an admin sees when another admin proposes adding a member, and what
the proposer sees while waiting. Leaning towards treating proposals like
patches against the org, since people already understand review.`,
      author: "self",
      daysAgo: 16,
      changes: {
        "notes/orgs.md": [
          [
            `## Things I don't know yet\n`,
            `## Approvals

Treat an org change like a patch against the org:

- Proposer sees: "Adding Kofi to Fieldwork Studio, 1 of 2 approvals". The
  change is visible to members immediately, marked pending.
- Other admins get it in their inbox with Approve / Decline, and the diff
  ("+ kofi as member").
- Once threshold is met, it's applied. No separate merge step; nobody should
  have to come back and press a button after the last approval.
- Declines don't block on their own; they're a comment with weight. If the
  threshold is 2 of 3 and one admin declines, the other two can still
  approve. Need to check this matches how the protocol actually counts.

What I'm unsure about: whether "pending" should be visible to non-members.
Probably not; it leaks intent ("they're about to remove Oskar").

## Things I don't know yet
`,
          ],
        ],
      },
    },
    {
      label: "browser-node-keys",
      message: `browser-node: expand the key storage section

Spent an afternoon on WebCrypto Ed25519 support across browsers. Better
than I thought, but the fallback path still matters, and the recovery story
is the real problem.`,
      author: "self",
      daysAgo: 11,
      changes: {
        "notes/browser-node.md": [
          [
            `3. **Keys.** The signing key is generated in the browser. Non-extractable
   WebCrypto keys would be ideal, but Ed25519 support is uneven, so we may
   need to hold raw key bytes, encrypted with a passphrase.
`,
            `3. **Keys.** The signing key is generated in the browser. Non-extractable
   WebCrypto Ed25519 keys are now in all three engines, so the default path
   is: generate non-extractable, store the CryptoKey in IndexedDB, never see
   the bytes. Older browsers fall back to raw bytes wrapped with a
   passphrase-derived key.

   The catch with non-extractable: you can't back it up. Clearing site data
   destroys your identity. So we need a second key from day one: either an
   exportable recovery key the person writes down, or a second device
   enrolled as another key on the same identity. I prefer the second; it's
   what people already do with passkeys.
`,
          ],
        ],
      },
    },
    {
      label: "onboarding-deferred-identity",
      message: `onboarding: rewrite around deferred identity

The old note was a list of complaints. Rewrote it as a proposed flow,
using what came out of the interviews about faces over keys.`,
      author: "self",
      daysAgo: 5,
      changes: {
        "notes/onboarding.md": [
          [
            `## Ideas

- Don't block on identity until they actually submit.
- Never say DID in onboarding. "Your key" is enough.
`,
            `## Proposed flow

1. Land on repo. Everything is readable; nothing asks who you are.
2. Click "Comment", write the comment.
3. On submit, an inline panel (not a modal): "Post as..." with a name field
   prefilled from nothing, and a note that this browser will remember you.
4. Key is generated in the background while they type the name. Comment
   posts. Done.
5. Later, once, at a calm moment: "Add a second device so you don't lose
   access". Not during the first action.

## Words

- Never say DID in onboarding. "Your key" is enough, and mostly we don't
  need to say anything.
- "Seeding" in onboarding copy becomes "keeping a copy". The interviews were
  clear that nobody guesses what seeding means.
`,
          ],
        ],
      },
    },
    {
      label: "readme-status",
      message: `README: add a status line per note

So future me knows which notes are still live questions and which have
turned into issues on the real repo.`,
      author: "self",
      daysAgo: 1,
      changes: {
        "README.md": [
          [
            `Things graduate out of here into issues on the real repo once they're
concrete enough to argue about.
`,
            `Things graduate out of here into issues on the real repo once they're
concrete enough to argue about.

## Status

| Note | State |
| --- | --- |
| browser-node | Live. Tab lifecycle is the scary part. |
| orgs | Approvals flow sketched; need to check threshold semantics. |
| onboarding | Ready to prototype. |
| interviews-summary | Round 1 done; round 2 recruiting. |
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Check how the protocol counts declines towards an org threshold",
      author: "self",
      daysAgo: 15,
      labels: ["orgs", "todo"],
      body: `The approvals sketch in notes/orgs.md assumes a decline is just a comment
and doesn't block. Need to confirm against the actual identity document
rules before I put that in a design. If declines don't exist at all at the
protocol level, the UI shouldn't invent them.`,
      comments: [
        {
          author: "self",
          body: "Partial answer: there's no decline, only signatures. A proposal sits until enough admins sign. So \"Decline\" in the UI would really be \"don't sign, and say why\". Need a better word.",
          hoursAfter: 50,
        },
      ],
    },
    {
      title: "Recruit round 2: people who tried Radicle and stopped",
      author: "self",
      daysAgo: 9,
      labels: ["research", "todo"],
      body: `Round 1 skewed towards people who already use the CLI. Round 2 should be
mostly people who bounced. Target five. Questions to add:

- What were you trying to do when you gave up?
- What did you expect "seed" to mean?
- Would you run something in a browser tab that stays open?`,
    },
    {
      title: "Prototype the leader-tab handover on visibilitychange",
      author: "self",
      daysAgo: 29,
      labels: ["browser-node", "todo"],
      state: "closed",
      closedHoursAfter: 70,
      body: `Before betting on leader election, try a handover in a throwaway page:
two tabs, Web Locks for leadership, release the lock when the leader goes
hidden. Measure how long the other tab is without a node.`,
      comments: [
        {
          author: "self",
          body: "Handover takes ~150ms on desktop Chrome, but Safari doesn't always fire visibilitychange before freezing. Closing this; SharedWorker first, election as fallback. Written up in notes/browser-node.md.",
          hoursAfter: 68,
        },
      ],
    },
  ],
  patches: [],
};
