#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# One run at a time: every run rebuilds dist/ and repacks faxios.tgz, so an overlapping run (or a
# test:docs-examples run against dist/) reads half-written files and fails for no reason.
LOCK_DIR=.run-tests.lock
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  OTHER_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
  if [ -n "$OTHER_PID" ] && kill -0 "$OTHER_PID" 2>/dev/null; then
    echo "run-tests.sh: another run (pid $OTHER_PID) is in progress; wait for it to finish." >&2
    exit 1
  fi
  # The previous run died without cleaning up.
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"

# One trap for the whole run: restores any backed-up lockfiles, removes temp dirs and the lock,
# then fails the run if a lockfile still differs from HEAD (it would otherwise ride into a commit).
LOCK_BACKUP=""
BUN_CACHE=""
cleanup() {
  local status=$?
  if [ -n "$LOCK_BACKUP" ]; then
    for lockfile in $LOCKFILES; do
      if [ -f "$LOCK_BACKUP/$lockfile" ]; then cp "$LOCK_BACKUP/$lockfile" "$lockfile"; fi
    done
    if [ -z "$FAXIOS_ALLOW_DIRTY_LOCKFILES" ] && ! git diff --quiet HEAD -- $LOCKFILES; then
      echo "run-tests.sh: these harness lockfiles still differ from HEAD after the restore:" >&2
      git diff --name-only HEAD -- $LOCKFILES >&2
      status=1
    fi
  fi
  rm -rf "$LOCK_DIR" ${LOCK_BACKUP:+"$LOCK_BACKUP"} ${BUN_CACHE:+"$BUN_CACHE"}
  exit $status
}
trap cleanup EXIT

LOCKFILES="smoke/esm/pnpm-lock.yaml module/esm/pnpm-lock.yaml smoke/bun/bun.lock"
# A killed run leaves the lockfiles pinned to its tarball; backing those up and "restoring" them
# would keep them modified forever. Start only from the committed lockfiles.
if [ -z "$FAXIOS_ALLOW_DIRTY_LOCKFILES" ] && ! git diff --quiet HEAD -- $LOCKFILES; then
  echo "run-tests.sh: these harness lockfiles differ from HEAD, probably left over from an interrupted run:" >&2
  git diff --name-only HEAD -- $LOCKFILES >&2
  echo "Restore them with: git checkout HEAD -- $LOCKFILES" >&2
  echo "(Set FAXIOS_ALLOW_DIRTY_LOCKFILES=1 if you changed them on purpose.)" >&2
  exit 1
fi

echo "==> build faxios"
pnpm --dir ../lib build

echo "==> pack + install into smoke/module suites"
# The suites depend on "faxios": "file:../../faxios.tgz"; stage the fresh
# tarball at packages/tests/faxios.tgz, as CI does with $FAXIOS_TARBALL. Their
# lockfiles record a tarball integrity that changes every build, so pin it to
# the staged tarball, install frozen, and restore the tracked lockfiles on exit.
PACK_DIR=$(mktemp -d)
TARBALL=$(pnpm --dir ../lib pack --pack-destination "$PACK_DIR" 2>/dev/null | tail -1)
mv -f "$TARBALL" faxios.tgz
rm -rf "$PACK_DIR"
LOCK_BACKUP=$(mktemp -d)
# Bun's shared cache keeps serving an older build of the same tarball path.
BUN_CACHE=$(mktemp -d)
for lockfile in $LOCKFILES; do
  mkdir -p "$LOCK_BACKUP/$(dirname "$lockfile")"
  cp "$lockfile" "$LOCK_BACKUP/$lockfile"
done
node pin-tarball-integrity.ts $LOCKFILES
pnpm --dir smoke/esm install --frozen-lockfile --ignore-workspace --ignore-scripts
pnpm --dir module/esm install --frozen-lockfile --ignore-workspace --ignore-scripts
BUN_INSTALL_CACHE_DIR="$BUN_CACHE" bun install --cwd smoke/bun --frozen-lockfile

echo "==> unit"
pnpm test:vitest:unit

echo "==> browser (headless)"
pnpm test:vitest:browser:headless

echo "==> smoke esm"
pnpm test:smoke:esm:vitest

echo "==> module esm"
pnpm test:module:esm

echo "==> Deno"
pnpm test:smoke:deno

echo "==> Bun"
pnpm test:smoke:bun
