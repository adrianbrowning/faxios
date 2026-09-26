#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "==> build faxios"
pnpm --dir ../lib build

echo "==> pack + install into smoke/module suites"
# The suites pin "faxios": "file:/tmp/faxios-0.0.1.tgz"; stage the fresh
# tarball there, as CI does with $FAXIOS_TARBALL.
TARBALL=$(pnpm --dir ../lib pack --pack-destination /tmp 2>/dev/null | tail -1)
cp "$TARBALL" /tmp/faxios-0.0.1.tgz
pnpm --dir smoke/esm install --no-frozen-lockfile --ignore-workspace --ignore-scripts
pnpm --dir module/esm install --no-frozen-lockfile --ignore-workspace --ignore-scripts
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
