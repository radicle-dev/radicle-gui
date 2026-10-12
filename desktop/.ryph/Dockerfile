FROM ghcr.io/drips-network/ryph-universal:1

USER root

# Tauri's system libraries (radicle-desktop's cargo build, clippy and tests),
# and bzip2 for radicle-explorer's .tar.bz2 test fixtures.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev \
      libjavascriptcoregtk-4.1-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      libxdo-dev \
      bzip2 \
 && rm -rf /var/lib/apt/lists/*

# The OS libraries Playwright's browsers need: WebKit for radicle-desktop's e2e
# tests, Chromium and WebKit for radicle-explorer's and always-on-node's. The
# browsers themselves are installed by each member's setup, keyed on its lockfile.
RUN npx -y playwright@1.61.1 install-deps chromium webkit \
 && rm -rf /var/lib/apt/lists/* /root/.npm \
 && chown -R runner:runner /usr/local/share/mise

# garden-broker's `make lint`.
RUN curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/v2.14.0/install.sh \
      | sh -s -- -b /usr/local/bin v2.14.0 \
 && golangci-lint version

USER runner

# garden-broker's go.mod files say `go 1.25.0`, a minimum, and pin no toolchain.
# Without this, mise reads that line as a pin and tries to download Go 1.25.0
# instead of using the image's newer Go.
ENV MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS=node,python,deno,bun

# Debug info is most of a warm target/ (8 GB of radicle-desktop's 13). Line
# tables keep file:line in panics and backtraces. Set for the whole machine,
# so the image's warm build and every run's builds use the same profile.
ENV CARGO_PROFILE_DEV_DEBUG=line-tables-only
