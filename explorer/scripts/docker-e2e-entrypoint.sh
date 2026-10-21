#!/usr/bin/env bash
# Entrypoint for the e2e Docker container. Installs npm deps into the
# container-private node_modules volume (only when package-lock.json changes),
# ensures the Radicle test binaries are present, then runs Playwright. Any
# arguments are forwarded to the test command.
#
# When USE_LOCAL_HTTPD=true, runs test:e2e:local (compiles radicle-httpd from
# source and tests the frontend against it) instead of test:e2e.
set -euo pipefail

cd /work

# The container runs as root, so anything it writes into the bind-mounted repo
# would otherwise be root-owned on the host. Hand those paths back to the
# invoking user (HOST_UID/HOST_GID set by scripts/test-e2e-docker) on exit.
# The workspace target/ lives in a named volume, so it's not host-visible.
cleanup() {
  if [ -n "${HOST_UID:-}" ]; then
    chown -R "$HOST_UID:${HOST_GID:-$HOST_UID}" \
      tests/tmp tests/artifacts tests/visual/snapshots build .svelte-kit \
      2>/dev/null || true
  fi
}
trap cleanup EXIT

LOCK_HASH=$(md5sum package-lock.json | cut -d' ' -f1)
STAMP=node_modules/.lockhash
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$LOCK_HASH" ]; then
  echo "📦 Installing npm dependencies..."
  npm ci
  echo "$LOCK_HASH" >"$STAMP"
else
  echo "📦 npm dependencies up to date."
fi

echo "⬇️  Ensuring Radicle test binaries..."
mkdir -p tests/artifacts
./scripts/install-binaries

NPM_SCRIPT="test:e2e"
if [ "${USE_LOCAL_HTTPD:-}" = "true" ]; then
  NPM_SCRIPT="test:e2e:local"
  echo "🦀 Local httpd mode: radicle-httpd will be compiled from source."
fi

echo "🧪 Running e2e tests ($NPM_SCRIPT)..."
set +e
npm run "$NPM_SCRIPT" -- "$@"
status=$?
set -e
exit "$status"
