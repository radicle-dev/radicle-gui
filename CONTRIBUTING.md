# Contributing

This repository holds two projects, each with its own development guide:
`explorer/README.md` and `desktop/README.md`. This file covers what
applies to both.

* Before adding any code dependencies, check with the maintainers if this is okay.
* Write properly formatted comments: they should be english sentences, eg:

      // Return the current UNIX time.

* Follow the guidelines when proposing code changes (see below).
* Write properly formatted git commits (see below).

## Proposing changes

When proposing changes via a patch:

* Isolate changes in separate commits to make the review process easier.
* Don't make unrelated changes, unless it happens to be an obvious improvement to
  code you are touching anyway ("boyscout rule").
* Rebase on `master` when needed.
* Keep your changesets small, specific and uncontroversial, so that they can be
  merged more quickly.
* If the change is substantial or requires re-architecting certain parts of the
  codebase, write an ADR first, in `docs/adr/` if it affects the whole
  repository or in the project's own `docs/adr/` otherwise, and get consensus
  on that before proposing the code changes.

## Writing Git commit messages

A properly formed git commit subject line should always be able to complete the
following sentence:

     If applied, this commit will _____

For example, the following message is well formed:

     Add support for .gif files

In addition, it should be capitalized and *must not* include a period. Prefix
commits that touch a single component with it: `explorer:` for the web app,
`httpd:` for `radicle-httpd` and `radicle-search`, and `desktop:` for the
desktop app. Commits that span most of the repository have no prefix. Either
way, each commit should be understandable, testable and revertable as one
coherent change.

When it comes to formatting, here's a model git commit message[1]:

     Capitalized, short (50 chars or less) summary

     More detailed explanatory text, if necessary.  Wrap it to about 72
     characters or so.  In some contexts, the first line is treated as the
     subject of an email and the rest of the text as the body.  The blank
     line separating the summary from the body is critical (unless you omit
     the body entirely); tools like rebase can get confused if you run the
     two together.

     Write your commit message in the imperative: "Fix bug" and not "Fixed bug"
     or "Fixes bug."  This convention matches up with commit messages generated
     by commands like git merge and git revert.

     Further paragraphs come after blank lines.

     - Bullet points are okay, too.

     - Typically a hyphen or asterisk is used for the bullet, followed by a
       single space, with blank lines in between, but conventions vary here.

     - Use a hanging indent.

[1]: http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html

## Patch labels

Label every new patch with each component it touches, so reviewers and
filters can tell the projects apart:

| Label | Covers |
|---|---|
| `explorer` | the web app in `explorer/`: `src/`, `http-client/`, `workers/`, its tests and config |
| `desktop` | anything under `desktop/` |
| `httpd` | `explorer/crates/radicle-httpd/` and `explorer/crates/radicle-search/` |

A patch that touches several components gets several labels. Changes to
shared files (`.github/`, `.buildkite/`, `.ryph/`, root docs) get the labels
of the components they affect. `git push` can't set labels, so add them
once the patch is open:

```sh
rad patch label <patch-id> --add explorer --add httpd
```

## Releases and tags

Each project is released on its own. Release tags are
`releases/<component>/<version>`; the `refs/tags/releases/*` rule in the
repository's identity decides when they become canonical.

| Component | How it's released | Tag |
|---|---|---|
| Explorer web app | Deployed continuously, no releases or tags | — |
| `radicle-httpd` + `radicle-search` | Together, one version, see `explorer/RELEASE.md` | `releases/httpd/<version>` |
| Desktop app | `desktop/scripts/release`, see `desktop/README.md` | `releases/desktop/<version>` |

The older `releases/<version>` tags (httpd 0.22.0–0.29.0, desktop
0.9.0–0.16.0) are left over from before the two repositories were merged.
Never create, match or describe against them; scripts must always match a
component's own prefix.
