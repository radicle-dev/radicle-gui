# CONTRIBUTING

Contributions are very welcome. When contributing code, please follow these
simple guidelines.

* Make sure you run `npm run check` for code formatting problems.
* Run our test suite `npm run test:*` to avoid regressions or bugs.
* Before adding any code dependencies, check with the maintainers if this is okay.
* Write properly formatted comments: they should be english sentences, eg:

      // Return the current UNIX time.

* Follow the guidelines when proposing code changes (see below).
* Write properly formatted git commits (see below).

Running Tests
-------------

The test suite includes end-to-end (e2e) tests that run against the built
application.

**Basic usage:**

    npm run test:e2e

**Skipping setup:**

The test suite performs setup operations before running tests:
* Building the application bundle
* Creating test fixtures (repositories with test data)

On subsequent test runs, you can skip this setup to save time:

    SKIP_SETUP=true npm run test:e2e

Use this when:
* You haven't changed any source code since the last test run
* The test fixtures are already created
* You want to iterate quickly on test development

**Note:** If you've made code changes or are getting unexpected test failures,
remove the `SKIP_SETUP` flag to ensure tests run against the latest build.

**Common usage patterns:**

* First time run: `npm run test:e2e -- --project chromium`
* Subsequent runs (no code changes): `SKIP_SETUP=true npm run test:e2e -- --project chromium`
* Single test by line number: `SKIP_SETUP=true npm run test:e2e -- tests/e2e/repo/commits.spec.ts:90 --project chromium`

**Testing with local radicle-httpd build:**

If you're developing radicle-httpd and want to test changes locally:

    npm run test:e2e:local

This will:
1. Compile radicle-httpd from the `radicle-httpd/` directory
2. Run the full test suite against the locally compiled binary

**Running e2e tests in Docker:**

If your host OS isn't supported by Playwright's browser builds (e.g. a very
new or unusual Linux distribution), run the suite inside a container instead.
Requires Docker with the Compose plugin.

    scripts/test-e2e-docker

Any arguments are forwarded to `npm run test:e2e` (defaulting to
`--project chromium` when none are given):

    scripts/test-e2e-docker tests/e2e/repo.spec.ts
    scripts/test-e2e-docker --project chromium -g "some test name"

`SKIP_SETUP=true` is forwarded the same as for the native runner:

    SKIP_SETUP=true scripts/test-e2e-docker

To test against a radicle-httpd you compile from source (the equivalent of
`npm run test:e2e:local`), pass `--local`:

    scripts/test-e2e-docker --local

Notes:
* The first image build is slow (it downloads Chromium); subsequent runs are
  cached. `--local` additionally installs a Rust toolchain and compiles
  radicle-httpd on first use.
* The repo is bind-mounted, so test artifacts and the binary/fixture cache
  land on the host as usual. `node_modules`, the cargo cache, and httpd's
  build directory live in container-private volumes, leaving your host copies
  untouched.

Proposing changes
-----------------
When proposing changes via a patch:

* Isolate changes in separate commits to make the review process easier.
* Don't make unrelated changes, unless it happens to be an obvious improvement to
  code you are touching anyway ("boyscout rule").
* Rebase on `master` when needed.
* Keep your changesets small, specific and uncontroversial, so that they can be
  merged more quickly.
* If the change is substantial or requires re-architecting certain parts of the
  codebase, write a proposal in english first, and get consensus on that before
  proposing the code changes.

Writing Git commit messages
---------------------------
A properly formed git commit subject line should always be able to complete the
following sentence:

     If applied, this commit will _____

For example, the following message is well formed:

     Add support for .gif files

In addition, it should be capitalized and *must not* include a period.

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

---

[1]: http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html
