#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "==> build faxios"
pnpm --dir ../lib build

echo "==> pack + install into smoke/module suites"
TARBALL=$(pnpm --dir ../lib pack --pack-destination /tmp 2>/dev/null | tail -1)
pnpm --dir smoke/esm install "$TARBALL"
pnpm --dir module/esm install "$TARBALL"

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
