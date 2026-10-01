#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

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
LOCKFILES="smoke/esm/pnpm-lock.yaml module/esm/pnpm-lock.yaml smoke/bun/bun.lock"
LOCK_BACKUP=$(mktemp -d)
# Bun's shared cache keeps serving an older build of the same tarball path.
BUN_CACHE=$(mktemp -d)
for lockfile in $LOCKFILES; do
  mkdir -p "$LOCK_BACKUP/$(dirname "$lockfile")"
  cp "$lockfile" "$LOCK_BACKUP/$lockfile"
done
trap 'for lockfile in $LOCKFILES; do cp "$LOCK_BACKUP/$lockfile" "$lockfile"; done; rm -rf "$LOCK_BACKUP" "$BUN_CACHE"' EXIT
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
