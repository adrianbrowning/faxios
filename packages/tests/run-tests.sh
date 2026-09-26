#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "==> build faxios"
pnpm --dir ../lib build

echo "==> pack + install into smoke/module suites"
# The suites depend on "faxios": "file:../../faxios.tgz"; stage the fresh
# tarball at packages/tests/faxios.tgz, as CI does with $FAXIOS_TARBALL. Their
# lockfiles record a tarball integrity that changes every build, so install
# without reading or writing them.
PACK_DIR=$(mktemp -d)
TARBALL=$(pnpm --dir ../lib pack --pack-destination "$PACK_DIR" 2>/dev/null | tail -1)
mv -f "$TARBALL" faxios.tgz
rm -rf "$PACK_DIR"
pnpm --dir smoke/esm install --no-lockfile --ignore-workspace --ignore-scripts
pnpm --dir module/esm install --no-lockfile --ignore-workspace --ignore-scripts
# Bun keeps reusing the tarball content pinned in bun.lock, so install
# without it (CI deletes it) and restore the tracked lock on exit.
BUN_LOCK_BACKUP=$(mktemp)
mv -f smoke/bun/bun.lock "$BUN_LOCK_BACKUP"
trap 'mv -f "$BUN_LOCK_BACKUP" smoke/bun/bun.lock' EXIT
bun install --cwd smoke/bun

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
